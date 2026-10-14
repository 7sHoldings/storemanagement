'use client';
import { useState, useEffect } from 'react';
import { Button, Alert, ConfirmModal } from '@/components/UI';
import { useAuth } from '@/components/AuthProvider';
import { logActivity } from '@/lib/activity';
import { storeShortName } from '@/lib/utils';
import { DEFAULT_REGISTER_DEPARTMENTS } from '@/lib/register-departments';

const LIST_KEY = 'pricebook.registerDepartments.v1';
const parseNames = (text) => [...new Set(String(text || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean))];

// Choose which department buttons every register shows. The chosen
// departments stay on the register's Departments screen (NRS lists them
// A–Z); every other department is hidden with NRS's "Do not show". Hidden
// departments keep their items, which still scan and sell.
//
// Preview first (nothing changes), then apply one store at a time or all.
export default function RegisterScreenPanel({ stores }) {
  const { supabase, profile } = useAuth();
  const [text, setText] = useState(DEFAULT_REGISTER_DEPARTMENTS.join('\n'));
  const [plans, setPlans] = useState({});        // store_id -> preview json | { error }
  const [applied, setApplied] = useState({});    // store_id -> apply json | { error }
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);  // array of stores to apply

  useEffect(() => {
    try { const saved = localStorage.getItem(LIST_KEY); if (saved) setText(saved); } catch { /* storage unavailable */ }
  }, []);
  const names = parseNames(text);
  const saveText = (v) => { setText(v); try { localStorage.setItem(LIST_KEY, v); } catch { /* storage unavailable */ } };

  const call = async (store, apply) => {
    const res = await fetch('/api/pricebook/departments/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: store.id, show: names, apply }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  };

  const preview = async () => {
    setPlans({}); setApplied({});
    for (const s of stores) {
      setBusy(`Checking ${s.name}…`);
      try { const json = await call(s, false); setPlans(p => ({ ...p, [s.id]: json })); }
      catch (e) { setPlans(p => ({ ...p, [s.id]: { error: e.message } })); }
    }
    setBusy('');
  };

  const apply = async (targets) => {
    setConfirm(null);
    for (const s of targets) {
      setBusy(`Updating ${s.name}’s register…`);
      try {
        const json = await call(s, true);
        setApplied(a => ({ ...a, [s.id]: json }));
        setPlans(p => ({ ...p, [s.id]: { ...json, changes: [], toCreate: [], missing: [] } }));
        await logActivity(supabase, profile, {
          action: 'update',
          entityType: 'nrs_department',
          description: `${profile?.name} set ${s.name}'s register to show ${json.rows.filter(r => r.shownAfter).length} departments (${(json.created || []).filter(c => c.ok).length} added, ${json.changed} changed${json.failed ? `, ${json.failed} failed` : ''})`,
          storeName: s.name,
          metadata: { show: names, results: json.results },
        });
      } catch (e) {
        setApplied(a => ({ ...a, [s.id]: { error: e.message } }));
      }
    }
    setBusy('');
  };

  const previewed = stores.filter(s => plans[s.id] && !plans[s.id].error);
  const hasWork = (p) => (p?.changes?.length || 0) + (p?.toCreate || []).filter(c => c.from_store).length > 0;
  const pendingStores = previewed.filter(s => hasWork(plans[s.id]));

  return (
    <div>
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 mb-4">
        <h3 className="text-sw-text text-[15px] font-bold">Department buttons on the register</h3>
        <p className="text-sw-sub text-[12px] mt-1 max-w-2xl">
          These departments get a button on every register (NRS sorts them A–Z). A store missing one gets it added,
          copied from a store that has it. Every other department is hidden
          from the register screen. Nothing is deleted, and items in hidden departments still scan and sell.
          Preview first, then try one store before applying to all.
        </p>
        <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_1fr] mt-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)]">Show these ({names.length}) — one per line</label>
            <textarea value={text} onChange={e => saveText(e.target.value)} rows={12} disabled={!!busy}
              className="w-full mt-1 rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[13px] text-sw-text font-mono" />
            <button type="button" className="text-[11px] underline text-[var(--text-muted)]" disabled={!!busy}
              onClick={() => saveText(DEFAULT_REGISTER_DEPARTMENTS.join('\n'))}>Reset to the agreed list</button>
          </div>
          <div className="flex flex-col gap-2 items-start">
            <Button variant="secondary" onClick={preview} disabled={!!busy || !names.length}>Preview all stores</Button>
            {pendingStores.length > 0 && (
              <Button variant="primary" onClick={() => setConfirm(pendingStores)} disabled={!!busy}>
                Apply to all {pendingStores.length} store{pendingStores.length === 1 ? '' : 's'}
              </Button>
            )}
            {busy && <span className="text-[12px] text-amber-500">{busy}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {stores.filter(s => plans[s.id]).map(s => {
          const p = plans[s.id];
          const a = applied[s.id];
          if (p.error) return <Alert key={s.id} type="error">{s.name}: {p.error}</Alert>;
          const shown = p.rows.filter(r => r.shownAfter);
          const hideCount = p.changes.filter(c => !c.shownAfter).length;
          const showCount = p.changes.filter(c => c.shownAfter).length;
          return (
            <div key={s.id} className="rounded-xl border border-sw-border bg-sw-card p-4">
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <h4 className="text-sw-text text-[14px] font-bold">{storeShortName(s.name)}</h4>
                {hasWork(p) ? (
                  <Button variant="primary" className="!text-[11px] !py-1" disabled={!!busy} onClick={() => setConfirm([s])}>
                    Apply to {storeShortName(s.name)}
                  </Button>
                ) : (
                  <span className="text-[11px] text-green-500 font-semibold">{a ? 'Updated' : 'Already set'}</span>
                )}
              </div>
              <div className="text-[12px] mt-2">
                <span className="text-sw-sub">Register will show ({shown.length}, A–Z): </span>
                <span className="text-sw-text font-semibold">{shown.map(r => `${r.label} (${r.item_count})`).join(', ')}</span>
              </div>
              {p.changes.length > 0 && (
                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                  Changes: hide {hideCount}, show {showCount}. {p.rows.length - shown.length} departments hidden in total.
                </div>
              )}
              {p.toCreate?.some(c => c.from_store) && (
                <div className="text-[11px] text-green-500 mt-1">
                  Will be added to this store: {p.toCreate.filter(c => c.from_store).map(c => `${c.name} (copied from ${storeShortName(c.from_store)})`).join(', ')}
                </div>
              )}
              {p.toCreate?.some(c => !c.from_store) && (
                <div className="text-[11px] text-red-500 mt-1">
                  No store has these to copy (no button): {p.toCreate.filter(c => !c.from_store).map(c => c.name).join(', ')}
                </div>
              )}
              {p.substituted?.length > 0 && (
                <div className="text-[11px] text-amber-500 mt-1">
                  Spelled differently here: {p.substituted.map(x => `“${x.wanted}” → “${x.used}”`).join(', ')}
                </div>
              )}
              {p.duplicatesHidden?.length > 0 && (
                <div className="text-[11px] text-amber-500 mt-1">
                  Second spelling hidden: {p.duplicatesHidden.map(x => `${x.hidden.join(', ')} (showing “${x.used}”)`).join('; ')}
                </div>
              )}
              {a && (
                <div className="mt-2">
                  {a.error ? <Alert type="error">{a.error}</Alert> : (
                    <Alert type={a.failed || a.warnings ? 'warning' : 'success'}>
                      {(a.created || []).some(c => c.ok) && `Added ${a.created.filter(c => c.ok).map(c => c.name).join(', ')}. `}
                      Updated {a.changed} department{a.changed === 1 ? '' : 's'}{a.failed ? `, ${a.failed} failed` : ''}{a.warnings ? `, ${a.warnings} to check` : ''}.
                      {(a.created || []).some(c => !c.ok) && (
                        <ul className="mt-1 text-[11px] list-disc pl-4">
                          {a.created.filter(c => !c.ok).map(c => <li key={c.name}>Couldn’t add {c.name}: {c.error}</li>)}
                        </ul>
                      )}
                      {(a.results || []).some(r => !r.ok || r.warning) && (
                        <ul className="mt-1 text-[11px] list-disc pl-4">
                          {a.results.filter(r => !r.ok || r.warning).map(r => <li key={r.dept}>{r.label}: {r.error || r.warning}</li>)}
                        </ul>
                      )}
                    </Alert>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirm && (
        <ConfirmModal
          title={`Update ${confirm.length === 1 ? confirm[0].name : `${confirm.length} stores`}?`}
          message={`Missing departments are added, then the register${confirm.length === 1 ? '' : 's'} will show only these ${names.length} departments; every other department button is hidden. This takes effect on the live register${confirm.length === 1 ? '' : 's'}.`}
          confirmLabel="Update registers"
          confirmVariant="primary"
          onCancel={() => setConfirm(null)}
          onConfirm={() => apply(confirm)}
        />
      )}
    </div>
  );
}
