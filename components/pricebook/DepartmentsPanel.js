'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button, Alert, Loading } from '@/components/UI';
import { downloadCSV, storeShortName } from '@/lib/utils';
import { groupDepartments, suggestSimilar, applyMerges, planSync, summarize } from '@/lib/department-sync';

// Plan for one department list across all five stores.
//
// Reads every store's NRS departments live (with item counts), folds
// spellings that differ only in case/spacing/punctuation into one, asks the
// owner about near-matches, and shows per store what has to happen:
// nothing, add the department, or move items from another spelling.
//
// This view only plans. The owner's choices (which near-matches are the
// same, the name to keep, departments to leave alone) are remembered in
// this browser.
const PREFS_KEY = 'pricebook.deptSync.v1';
const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
};
const savePrefs = (p) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
};
const pctTax = (decibps) => `${(decibps / 1000).toFixed(2).replace(/\.?0+$/, '')}%`;

export default function DepartmentsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [filter, setFilter] = useState('');
  // { merges: [[keyA,keyB]], dismissed: ['keyA|keyB'], chosen: {key: name}, skipped: [key] }
  const [prefs, setPrefs] = useState({ merges: [], dismissed: [], chosen: {}, skipped: [] });

  useEffect(() => { setPrefs(p => ({ ...p, ...loadPrefs() })); }, []);
  const updatePrefs = (patch) => setPrefs(p => { const n = { ...p, ...patch }; savePrefs(n); return n; });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/pricebook/departments');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load departments');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const stores = useMemo(() => {
    const failed = new Set((data?.failedStores || []).map(f => f.store_id));
    return (data?.stores || []).map(s => ({ ...s, loaded: !failed.has(s.id) }));
  }, [data]);
  const baseGroups = useMemo(() => groupDepartments(data?.perStore || []), [data]);
  const groupByKey = useMemo(() => new Map(baseGroups.map(g => [g.key, g])), [baseGroups]);

  const pending = useMemo(() => {
    const dismissed = new Set(prefs.dismissed || []);
    const merged = new Set((prefs.merges || []).map(([a, b]) => `${a}|${b}`));
    return suggestSimilar(baseGroups).filter(([a, b]) => !dismissed.has(`${a}|${b}`) && !merged.has(`${a}|${b}`));
  }, [baseGroups, prefs]);

  const plan = useMemo(() => planSync(
    applyMerges(baseGroups, prefs.merges || []),
    stores,
    { chosen: prefs.chosen || {}, skipped: new Set(prefs.skipped || []) },
  ), [baseGroups, stores, prefs]);
  const totals = summarize(plan);

  const rows = plan
    .filter(p => !onlyChanges || p.skipped || Object.values(p.perStore).some(c => c.status !== 'ok'))
    .filter(p => !filter.trim() || p.names.some(n => n.toLowerCase().includes(filter.trim().toLowerCase())));

  const variantLine = (key) => {
    const g = groupByKey.get(key);
    if (!g) return key;
    return g.variants.map(v => {
      const per = stores.filter(s => v.stores[s.id]).map(s => `${storeShortName(s.name)} ${v.stores[s.id].item_count}`);
      return `“${v.name}” (${per.join(', ')})`;
    }).join(' · ');
  };

  const exportCSV = () => {
    downloadCSV('department-sync-plan.csv',
      ['Department', 'Also spelled', 'Tax', ...stores.map(s => s.name), 'Skipped'],
      plan.map(p => [
        p.name,
        p.names.filter(n => n !== p.name).join('; '),
        p.taxRates.map(pctTax).join(' / '),
        ...stores.map(s => {
          const c = p.perStore[s.id];
          if (c.status === 'ok') return `OK (${c.have[0].item_count} items)`;
          if (c.status === 'create') return 'ADD';
          if (c.status === 'merge') return `MOVE from ${c.have.map(h => `${h.name} (${h.item_count})`).join(' + ')}`;
          return '?';
        }),
        p.skipped ? 'yes' : '',
      ]));
  };

  if (loading) return <Loading text="Loading departments from every store…" />;
  if (error) return <Alert type="error">{error}</Alert>;

  return (
    <div>
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sw-text text-[15px] font-bold">One department list for every store</h3>
            <p className="text-sw-sub text-[12px] mt-1 max-w-2xl">
              {totals.departments} departments · {totals.inSync} already the same everywhere ·{' '}
              <span className="text-red-500 font-semibold">{totals.toCreate} to add</span> ·{' '}
              <span className="text-amber-500 font-semibold">{totals.toMerge} spelled differently (items to move)</span>.
              Names that differ only in capitals, spaces or punctuation are treated as one department.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCSV} className="!text-[11px]">CSV</Button>
            <Button variant="secondary" onClick={load} className="!text-[11px]">Refresh</Button>
          </div>
        </div>
        {data?.failedStores?.length > 0 && (
          <div className="mt-3">
            <Alert type="warning">
              Couldn’t load departments for {data.failedStores.map(f => f.store).join(', ')}. Those columns show “?”.
            </Alert>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-sw-card p-4 mb-4">
          <h3 className="text-sw-text text-[14px] font-bold mb-1">Are these the same department? ({pending.length})</h3>
          <p className="text-sw-sub text-[12px] mb-3">Similar names. Say “Same” to treat them as one department, so items get moved to one name.</p>
          <ul className="space-y-2">
            {pending.map(([a, b]) => (
              <li key={`${a}|${b}`} className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="flex-1 min-w-[240px] text-sw-text">
                  {variantLine(a)} <span className="text-[var(--text-muted)]">vs</span> {variantLine(b)}
                </span>
                <Button variant="primary" className="!text-[11px] !py-1"
                  onClick={() => updatePrefs({ merges: [...(prefs.merges || []), [a, b]] })}>Same</Button>
                <Button variant="secondary" className="!text-[11px] !py-1"
                  onClick={() => updatePrefs({ dismissed: [...(prefs.dismissed || []), `${a}|${b}`] })}>Different</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search departments…"
          style={{ width: '14rem' }} className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text" />
        <label className="flex items-center gap-1.5 text-[12px] text-sw-sub">
          <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />
          Only show departments that need a change
        </label>
        {((prefs.merges || []).length > 0 || (prefs.dismissed || []).length > 0) && (
          <button type="button" className="text-[11px] underline text-[var(--text-muted)]"
            onClick={() => updatePrefs({ merges: [], dismissed: [] })}>Reset “same/different” answers</button>
        )}
      </div>

      <div className="rounded-xl border border-sw-border bg-sw-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-sw-border text-[var(--text-muted)]">
              <th className="text-left px-3 py-2 font-semibold">Department (name to keep)</th>
              {stores.map(s => (
                <th key={s.id} className="px-2 py-2 font-semibold text-center whitespace-nowrap" title={s.name}>{storeShortName(s.name)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={stores.length + 1} className="text-center py-8 text-[var(--text-muted)]">
                {onlyChanges ? 'Every department is the same in every store.' : 'No departments match.'}
              </td></tr>
            )}
            {rows.map(p => (
              <tr key={p.key} className={`border-b border-sw-border/50 last:border-0 align-top ${p.skipped ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 min-w-[200px]">
                  {p.names.length > 1 ? (
                    <select value={p.name} style={{ width: 'auto' }}
                      onChange={e => updatePrefs({ chosen: { ...(prefs.chosen || {}), [p.key]: e.target.value } })}
                      className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[12px] text-sw-text font-semibold">
                      {p.names.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <span className="text-sw-text font-semibold">{p.name}</span>
                  )}
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {p.total} items · tax {p.taxRates.map(pctTax).join(' / ')}
                    {p.taxDiffers && <span className="text-amber-500 font-semibold"> · tax differs between stores</span>}
                  </div>
                  <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] mt-0.5">
                    <input type="checkbox" className="w-3 h-3" checked={p.skipped}
                      onChange={e => {
                        const set = new Set(prefs.skipped || []);
                        e.target.checked ? set.add(p.key) : set.delete(p.key);
                        updatePrefs({ skipped: [...set] });
                      }} />
                    leave this one alone
                  </label>
                </td>
                {stores.map(s => {
                  const c = p.perStore[s.id];
                  if (c.status === 'ok') {
                    return <td key={s.id} className="px-2 py-2 text-center text-green-500" title={`${c.have[0].name}`}>✓ <span className="text-[10px] text-[var(--text-muted)]">{c.have[0].item_count}</span></td>;
                  }
                  if (c.status === 'create') {
                    return <td key={s.id} className="px-2 py-2 text-center text-red-500 font-semibold" title={`Add “${p.name}” (copy from ${storeShortName(stores.find(x => x.id === p.source.store_id)?.name)})`}>+ add</td>;
                  }
                  if (c.status === 'merge') {
                    return (
                      <td key={s.id} className="px-2 py-2 text-center text-amber-500 text-[11px]">
                        {c.have.map(h => (
                          <div key={h.name} title={`Move ${h.item_count} items from “${h.name}” to “${p.name}”`}>
                            {h.name === p.name ? '✓ ' : '↪ '}{h.name} <span className="text-[var(--text-muted)]">({h.item_count})</span>
                          </div>
                        ))}
                      </td>
                    );
                  }
                  return <td key={s.id} className="px-2 py-2 text-center text-[var(--text-muted)]">?</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--text-muted)] mt-3">
        <span className="text-red-500 font-semibold">+ add</span> = the store doesn’t have this department ·{' '}
        <span className="text-amber-500 font-semibold">↪</span> = the store has it under another name; its items move to the name to keep.
        Numbers are items in that department.
      </p>
    </div>
  );
}
