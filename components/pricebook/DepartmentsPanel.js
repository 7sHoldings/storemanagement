'use client';
import { useState, useEffect, useMemo } from 'react';
import { Button, Alert, Loading } from '@/components/UI';
import { downloadCSV, storeShortName } from '@/lib/utils';

// Every department in every store, side by side, so gaps are easy to spot.
//
// An item can only be added to a store that has its department, and each
// department carries the tax settings, so the five stores need the same
// list. This view reads each store's NRS departments live and marks where
// one is missing. Departments are added in the NRS portal; refresh to check.
export default function DepartmentsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(true);
  const [filter, setFilter] = useState('');

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

  const failed = useMemo(() => new Set((data?.failedStores || []).map(f => f.store_id)), [data]);
  const all = data?.departments || [];
  const gaps = all.filter(d => d.missing.length > 0);
  const missingCount = gaps.reduce((n, d) => n + d.missing.length, 0);
  const rows = all
    .filter(d => !onlyGaps || d.missing.length > 0)
    .filter(d => !filter.trim() || d.label.toLowerCase().includes(filter.trim().toLowerCase()));

  const exportCSV = () => {
    const stores = data?.stores || [];
    downloadCSV('departments-by-store.csv',
      ['Department', ...stores.map(s => s.name), 'Missing in'],
      all.map(d => [d.label, ...stores.map(s => d.codes[s.id] || (failed.has(s.id) ? '?' : 'MISSING')), d.missing.join('; ')]));
  };

  if (loading) return <Loading text="Loading departments from every store…" />;
  if (error) return <Alert type="error">{error}</Alert>;

  const stores = data?.stores || [];

  return (
    <div>
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sw-text text-[15px] font-bold">Departments by store</h3>
            <p className="text-sw-sub text-[12px] mt-1 max-w-2xl">
              {gaps.length === 0
                ? `All ${all.length} departments are set up in every store.`
                : `${gaps.length} of ${all.length} departments are missing from at least one store (${missingCount} gaps). An item can’t be added to a store that lacks its department. Add the missing ones in the NRS portal with the same name and tax settings, then refresh.`}
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
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search departments…"
            style={{ width: '14rem' }} className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text" />
          <label className="flex items-center gap-1.5 text-[12px] text-sw-sub">
            <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)} />
            Only show departments with gaps
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-sw-border bg-sw-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-sw-border text-[var(--text-muted)]">
              <th className="text-left px-3 py-2 font-semibold">Department</th>
              {stores.map(s => (
                <th key={s.id} className="px-2 py-2 font-semibold text-center whitespace-nowrap" title={s.name}>{storeShortName(s.name)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={stores.length + 1} className="text-center py-8 text-[var(--text-muted)]">
                {onlyGaps ? 'No gaps — every department is in every store.' : 'No departments match.'}
              </td></tr>
            )}
            {rows.map(d => (
              <tr key={d.key} className="border-b border-sw-border/50 last:border-0">
                <td className="px-3 py-1.5 text-sw-text font-semibold">{d.label}</td>
                {stores.map(s => {
                  const code = d.codes[s.id];
                  if (code) return <td key={s.id} className="px-2 py-1.5 text-center text-green-500" title={`Code: ${code}`}>✓</td>;
                  if (failed.has(s.id)) return <td key={s.id} className="px-2 py-1.5 text-center text-[var(--text-muted)]">?</td>;
                  return <td key={s.id} className="px-2 py-1.5 text-center text-red-500 font-bold" title="Missing in this store">✗</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
