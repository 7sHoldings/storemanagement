'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button, Alert, ConfirmModal } from '@/components/UI';
import { useAuth } from '@/components/AuthProvider';
import { logActivity } from '@/lib/activity';
import { similarKey } from '@/lib/department-sync';
import {
  TARGET_DEPARTMENTS, departmentSuggestion, targetForProduct, planMoves, classifyProduct, targetFor,
} from '@/lib/dept-migration';

// Department clean-up (Nov 2026).
//   1. Scan: read every store's products from NRS.
//   2. Review: each old department → one of the new departments (mixed
//      departments are sorted product by product). Everything is editable;
//      choices are remembered in this browser.
//   3. Run, store by store: create the new departments that are missing
//      (tax copied from the department that feeds each one), move every
//      product, then hide every other department on the register.
// Safe to stop and run again: a fresh scan only finds what is still left.
const PREFS_KEY = 'pricebook.deptCleanup.v1';
const BATCH = 30;
const pct = (d) => (d == null ? '—' : `${(d / 1000).toFixed(2).replace(/\.?0+$/, '')}%`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A phone drops requests now and then ("Load failed") or the server times out.
// Every action here is safe to repeat (a move re-saves the same department),
// so network errors and 5xx answers are retried before giving up.
const post = async (body, tries = 4) => {
  for (let attempt = 1; ; attempt++) {
    let res, json;
    try {
      res = await fetch('/api/pricebook/departments/cleanup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      json = await res.json().catch(() => ({}));
    } catch (e) {
      if (attempt >= tries) throw new Error(`${e.message || 'Network error'} (tried ${tries} times)`);
      await sleep(2000 * attempt);
      continue;
    }
    if (res.ok) return json;
    if (res.status >= 500 && attempt < tries) { await sleep(2000 * attempt); continue; }
    throw new Error(json.error || `Request failed (${res.status})`);
  }
};

// Keep the phone screen on during a long run (iOS stops requests when it locks).
const keepAwake = async () => {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
};

export default function DeptCleanupPanel({ stores }) {
  const { supabase, profile } = useAuth();
  const [items, setItems] = useState({});          // store_id -> [{upc,name,dept}]
  const [scanErr, setScanErr] = useState({});
  const [creates, setCreates] = useState({});      // store_id -> [{name, copyFrom, tax}]
  const [overrides, setOverrides] = useState({ departments: {}, products: {} });
  const [open, setOpen] = useState(null);          // old dept key expanded
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState([]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (s) setOverrides({ departments: {}, products: {}, ...s }); } catch { /* storage unavailable */ }
  }, []);
  const saveOverrides = (o) => { setOverrides(o); try { localStorage.setItem(PREFS_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ } };
  const note = (line) => setLog(l => [...l, line]);

  const scan = async () => {
    setItems({}); setScanErr({}); setCreates({}); setLog([]);
    const lock = await keepAwake();
    for (const s of stores) {
      try {
        const all = [];
        let start = 0;
        do {
          setBusy(`Reading ${s.name}’s products… ${all.length}`);
          const page = await post({ action: 'items', store_id: s.id, start });
          all.push(...page.items);
          start = page.next;
        } while (start != null);
        setItems(m => ({ ...m, [s.id]: all }));
        const c = await post({ action: 'create', store_id: s.id });
        setCreates(m => ({ ...m, [s.id]: c.missing }));
      } catch (e) {
        setScanErr(m => ({ ...m, [s.id]: e.message }));
      }
    }
    lock?.release?.().catch?.(() => {});
    setBusy('');
  };

  const scanned = stores.filter(s => items[s.id]);

  // Old departments across all stores, with how many products each holds.
  const groups = useMemo(() => {
    const m = new Map();
    for (const s of scanned) for (const it of items[s.id]) {
      const key = similarKey(it.dept);
      // Already exactly a new department — unless it is a mixed one ("Pills").
      if (targetFor(it.dept) === it.dept && !departmentSuggestion(it.dept).mixed) continue;
      const g = m.get(key) || { key, labels: new Set(), count: 0, products: new Map() };
      g.labels.add(it.dept || '(none)');
      g.count++;
      if (!g.products.has(it.upc)) g.products.set(it.upc, it);
      m.set(key, g);
    }
    return [...m.values()].map(g => {
      const label = [...g.labels][0];
      const sug = departmentSuggestion(label);
      return { ...g, label, labels: [...g.labels], mixed: sug.mixed, guessed: !!sug.guessed, suggested: sug.target, products: [...g.products.values()] };
    }).sort((a, b) => b.count - a.count);
  }, [items, scanned.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const plans = useMemo(() => Object.fromEntries(scanned.map(s => [s.id, planMoves(items[s.id], overrides)])), [items, overrides, scanned.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const unassigned = scanned.reduce((n, s) => n + plans[s.id].unassigned.length, 0);
  const totalMoves = scanned.reduce((n, s) => n + plans[s.id].moves.length, 0);
  const totalCreates = scanned.reduce((n, s) => n + (creates[s.id]?.length || 0), 0);

  const setDept = (key, value) => saveOverrides({ ...overrides, departments: { ...overrides.departments, [key]: value || undefined } });
  const setProduct = (upc, value) => saveOverrides({ ...overrides, products: { ...overrides.products, [upc]: value || undefined } });

  const run = async () => {
    const targets = confirm === true ? scanned : scanned.filter(s => s.id === confirm);
    setConfirm(false); setLog([]);
    const lock = await keepAwake();
    for (const s of targets) {
      try {
        setBusy(`${s.name}: adding missing departments…`);
        if (creates[s.id]?.length) {
          const c = await post({ action: 'create', store_id: s.id, apply: true });
          note(`${s.name}: added ${c.created} department(s)${c.results.some(r => !r.ok) ? ` — failed: ${c.results.filter(r => !r.ok).map(r => `${r.name} (${r.error})`).join(', ')}` : ''}`);
        }
        const moves = plans[s.id].moves;
        let moved = 0, failed = 0;
        const failures = [];
        let badBatches = 0;
        for (let i = 0; i < moves.length; i += BATCH) {
          setBusy(`${s.name}: moving products ${Math.min(i + BATCH, moves.length)} / ${moves.length}… keep this screen open`);
          const batch = moves.slice(i, i + BATCH);
          try {
            const r = await post({ action: 'move', store_id: s.id, moves: batch.map(m => ({ upc: m.upc, to: m.to })) });
            moved += r.moved; failed += r.failed;
            failures.push(...r.results.filter(x => !x.ok).slice(0, 5));
            badBatches = 0;
          } catch (e) {
            // One bad batch does not stop the store; three in a row does.
            failed += batch.length; failures.push({ upc: batch[0].upc, error: e.message });
            if (++badBatches >= 3) throw new Error(`${e.message} — ${moved} moved so far; press Scan again then Run to carry on`);
          }
        }
        note(`${s.name}: moved ${moved} product(s)${failed ? `, ${failed} failed (e.g. ${failures.slice(0, 3).map(f => `${f.upc}: ${f.error}`).join('; ')})` : ''}`);

        setBusy(`${s.name}: updating the register screen…`);
        const res = await fetch('/api/pricebook/departments/visibility', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: s.id, show: TARGET_DEPARTMENTS, apply: true }),
        });
        const v = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(v.error || 'Register update failed');
        note(`${s.name}: register now shows ${v.rows.filter(r => r.shownAfter).length} departments (${v.changed} changed${v.failed ? `, ${v.failed} failed` : ''})`);

        await logActivity(supabase, profile, {
          action: 'update', entityType: 'nrs_department', storeName: s.name,
          description: `${profile?.name} ran the department clean-up for ${s.name}: ${moved} products moved${failed ? `, ${failed} failed` : ''}`,
          metadata: { moved, failed, targets: TARGET_DEPARTMENTS },
        });
      } catch (e) {
        note(`${s.name}: stopped — ${e.message}`);
      }
    }
    lock?.release?.().catch?.(() => {});
    setBusy('');
    note('Done. Scan again to check nothing is left.');
  };

  const Select = ({ value, onChange, allowBlank = true }) => (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="!w-auto max-w-[11rem] inline-block bg-sw-card2 border border-sw-border rounded-md px-2 py-1 text-[12px] text-sw-text">
      {allowBlank && <option value="">— choose —</option>}
      {TARGET_DEPARTMENTS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <Alert type="info">
        Puts every store on the same {TARGET_DEPARTMENTS.length} departments: {TARGET_DEPARTMENTS.join(', ')}.
        Every product is moved into one of them and every other department is hidden from the register.
        <b> A product takes the tax of its new department.</b> Nothing changes until you press Run.
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={scan} disabled={!!busy}>{scanned.length ? 'Scan again' : '1. Scan all stores'}</Button>
        {scanned.length > 0 && (
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!!busy || unassigned > 0 || (totalMoves === 0 && totalCreates === 0)}>
            3. Run clean-up ({totalMoves} moves, {totalCreates} new departments)
          </Button>
        )}
        {busy && <span className="text-[13px] text-[var(--text-muted)]">{busy}</span>}
      </div>
      {Object.entries(scanErr).map(([id, err]) => (
        <Alert key={id} type="error">{stores.find(s => s.id === id)?.name}: {err}</Alert>
      ))}
      {unassigned > 0 && <Alert type="warning">{unassigned} product(s) have no department chosen yet — pick one for each red row below before running.</Alert>}

      {scanned.length > 0 && (
        <div className="bg-sw-card border border-sw-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-sw-border font-semibold text-sw-text text-[14px]">2. Where each old department goes</div>
          <div className="divide-y divide-sw-border">
            {groups.map(g => {
              const chosen = overrides.departments[g.key] || g.suggested;
              const missing = !g.mixed && !chosen;
              return (
                <div key={g.key} className={missing ? 'bg-red-500/5' : ''}>
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                    <button className="font-medium text-sw-text text-left min-w-[10rem]" onClick={() => setOpen(open === g.key ? null : g.key)}>
                      {open === g.key ? '▾' : '▸'} {g.labels.join(' / ')}
                    </button>
                    <span className="text-[var(--text-muted)]">{g.count} product(s)</span>
                    <span className="text-[var(--text-muted)]">→</span>
                    {g.mixed ? (
                      <span className="text-amber-500 text-[12px]">{g.guessed ? 'unknown department — ' : ''}sorted product by product (default {chosen}) — open to check</span>
                    ) : (
                      <Select value={chosen} onChange={v => setDept(g.key, v)} />
                    )}
                    {g.mixed && (
                      <span className="text-[11px] text-[var(--text-muted)] inline-flex items-center gap-1">
                        or send all to <Select value={overrides.departments[g.key]} onChange={v => setDept(g.key, v)} />
                      </span>
                    )}
                  </div>
                  {open === g.key && (
                    <div className="px-6 pb-3 max-h-80 overflow-y-auto">
                      <table className="w-full text-[12px]">
                        <tbody>
                          {g.products.map(p => {
                            const to = targetForProduct(p, overrides);
                            return (
                              <tr key={p.upc} className={`border-b border-sw-border/50 ${!to ? 'bg-red-500/5' : ''}`}>
                                <td className="py-1 pr-2 text-sw-text">{p.name || '(no name)'}</td>
                                <td className="py-1 pr-2 text-[var(--text-muted)] tabular-nums">{p.upc}</td>
                                <td className="py-1 text-right">
                                  <Select value={overrides.products[p.upc] || to} onChange={v => setProduct(p.upc, v)} />
                                  {g.mixed && !overrides.products[p.upc] && classifyProduct(p.name) && <span className="ml-1 text-[10px] text-[var(--text-muted)]">by name</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scanned.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {scanned.map(s => (
            <div key={s.id} className="bg-sw-card border border-sw-border rounded-xl p-4 text-[13px]">
              <div className="font-semibold text-sw-text mb-1">{s.name}</div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[var(--text-muted)]">{items[s.id].length} products · {plans[s.id].moves.length} to move</div>
                {(plans[s.id].moves.length > 0 || creates[s.id]?.length > 0) && (
                  <Button variant="secondary" className="!px-3 !py-1 text-[12px] shrink-0" onClick={() => setConfirm(s.id)} disabled={!!busy || plans[s.id].unassigned.length > 0}>Run this store</Button>
                )}
              </div>
              {creates[s.id]?.length > 0 && (
                <div className="mt-2">
                  <div className="text-[12px] text-[var(--text-muted)]">New departments to add (settings copied from):</div>
                  <ul className="mt-1 space-y-0.5">
                    {creates[s.id].map(c => (
                      <li key={c.name} className={c.copyFrom ? '' : 'text-red-500'}>
                        {c.name} ← {c.copyFrom || 'nothing to copy'} <span className="text-[var(--text-muted)]">· tax {pct(c.tax)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 text-[12px] text-[var(--text-muted)]">
                {plans[s.id].byPair.slice(0, 6).map(p => `${p.from} → ${p.to} (${p.count})`).join(' · ')}
                {plans[s.id].byPair.length > 6 ? ' …' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-sw-card border border-sw-border rounded-xl p-4 text-[13px] space-y-1">
          {log.map((l, i) => <div key={i} className="text-sw-text">{l}</div>)}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="Run the department clean-up?"
          message={confirm === true
            ? `This writes to NRS in all ${scanned.length} stores: adds ${totalCreates} department(s), moves ${totalMoves} product(s) (each takes its new department’s tax), and hides every department except the ${TARGET_DEPARTMENTS.length} on the register. It takes a long time — keep this screen open and the phone plugged in.`
            : `This writes to NRS for ${scanned.find(s => s.id === confirm)?.name}: adds ${creates[confirm]?.length || 0} department(s), moves ${plans[confirm]?.moves.length || 0} product(s) (each takes its new department’s tax), and hides every department except the ${TARGET_DEPARTMENTS.length} on the register. Keep this screen open.`}
          confirmLabel="Run clean-up"
          confirmVariant="primary"
          onCancel={() => setConfirm(false)}
          onConfirm={run}
        />
      )}
    </div>
  );
}
