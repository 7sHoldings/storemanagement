'use client';
import { useState } from 'react';
import { Button, Alert } from '@/components/UI';
import { downloadCSV, storeShortName } from '@/lib/utils';

const money = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (f) => `${(f * 100).toFixed(1)}%`;

// Which departments each store actually sells from, over the last 60 days,
// added up from every register line in NRS. Read-only: this is the list used
// to decide which departments keep a button on each store's register.
//
// "Top sellers" are the departments that together make up `share` of the
// store's sales (busiest first until the running total reaches it), listed
// A–Z the way they would sit on the register.
export default function DepartmentSalesPanel({ stores }) {
  const [days, setDays] = useState(60);
  const [share, setShare] = useState(0.95);
  const [results, setResults] = useState({}); // store_id -> json | { error }
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');

  const run = async () => {
    setRunning(true); setResults({});
    for (let i = 0; i < stores.length; i++) {
      const s = stores[i];
      setProgress(`Reading ${s.name} (${i + 1} of ${stores.length})… this takes a minute per store`);
      try {
        const res = await fetch(`/api/pricebook/departments/sales?store_id=${encodeURIComponent(s.id)}&days=${days}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        setResults(r => ({ ...r, [s.id]: json }));
      } catch (e) {
        setResults(r => ({ ...r, [s.id]: { error: e.message } }));
      }
    }
    setProgress(''); setRunning(false);
  };

  const topOf = (json) => {
    if (!json?.departments) return [];
    const out = [];
    for (const d of json.departments) {
      if (d.sales_cents <= 0) break;
      out.push(d);
      if (d.cumulative >= share) break;
    }
    return out.sort((a, b) => a.dept.localeCompare(b.dept));
  };

  const exportCSV = () => {
    const rows = [];
    stores.forEach(s => {
      const json = results[s.id];
      const top = new Set(topOf(json).map(d => d.dept));
      (json?.departments || []).forEach((d, i) => rows.push([
        s.name, i + 1, d.dept, (d.sales_cents / 100).toFixed(2), (d.share * 100).toFixed(2),
        (d.cumulative * 100).toFixed(2), d.qty, (d.refund_cents / 100).toFixed(2), top.has(d.dept) ? 'yes' : '',
      ]));
    });
    downloadCSV(`department-sales-${days}d.csv`,
      ['Store', 'Rank', 'Department', 'Sales', 'Share %', 'Cumulative %', 'Qty', 'Refunds', 'Top seller'], rows);
  };

  const loaded = stores.filter(s => results[s.id] && !results[s.id].error);

  return (
    <div>
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 mb-4">
        <h3 className="text-sw-text text-[15px] font-bold">Sales by department, per store</h3>
        <p className="text-sw-sub text-[12px] mt-1 max-w-2xl">
          Adds up every register sale line in NRS for each store. “Top sellers” are the departments that together
          make up the chosen share of that store’s sales, listed A–Z. Nothing is changed in NRS.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[12px] text-sw-sub">
          <label className="flex items-center gap-1.5">Last
            <select value={days} onChange={e => setDays(Number(e.target.value))} disabled={running} style={{ width: 'auto' }}
              className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-sw-text">
              {[30, 60, 90].map(n => <option key={n} value={n}>{n} days</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">Top sellers =
            <select value={share} onChange={e => setShare(Number(e.target.value))} style={{ width: 'auto' }}
              className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-sw-text">
              {[0.9, 0.95, 0.98, 0.99].map(n => <option key={n} value={n}>{n * 100}% of sales</option>)}
            </select>
          </label>
          <Button variant="primary" onClick={run} disabled={running} className="!text-[11px]">
            {running ? 'Reading…' : loaded.length ? 'Reload' : 'Load sales'}
          </Button>
          {loaded.length > 0 && <Button variant="secondary" onClick={exportCSV} className="!text-[11px]">CSV</Button>}
        </div>
        {progress && <p className="text-[12px] text-amber-500 mt-2">{progress}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {stores.filter(s => results[s.id]).map(s => {
          const json = results[s.id];
          if (json.error) return <Alert key={s.id} type="error">{s.name}: {json.error}</Alert>;
          const top = topOf(json);
          const total = json.departments.reduce((t, d) => t + Math.max(d.sales_cents, 0), 0);
          return (
            <div key={s.id} className="rounded-xl border border-sw-border bg-sw-card p-4">
              <div className="flex justify-between items-baseline gap-2 flex-wrap">
                <h4 className="text-sw-text text-[14px] font-bold">{storeShortName(s.name)}</h4>
                <span className="text-[11px] text-[var(--text-muted)]">{json.from} → {json.to} · {money(total)} · {json.line_count} lines</span>
              </div>
              {(json.truncated?.length > 0 || json.failedRanges?.length > 0) && (
                <div className="mt-2">
                  <Alert type="warning">
                    Incomplete: {[...(json.failedRanges || []), ...(json.truncated || [])].map(r => `${r.from}–${r.to}`).join(', ')} could not be fully read.
                  </Alert>
                </div>
              )}
              <div className="mt-2 text-[12px]">
                <span className="text-sw-sub">Top sellers ({top.length}, A–Z): </span>
                <span className="text-sw-text font-semibold">{top.map(d => d.dept).join(', ')}</span>
              </div>
              <details className="mt-2">
                <summary className="text-[11px] text-[var(--text-muted)] cursor-pointer">All {json.departments.length} departments by sales</summary>
                <table className="w-full text-[11px] mt-2">
                  <thead><tr className="text-[var(--text-muted)]"><th className="text-left">Department</th><th className="text-right">Sales</th><th className="text-right">Share</th><th className="text-right">Qty</th></tr></thead>
                  <tbody>
                    {json.departments.map(d => (
                      <tr key={d.dept} className={top.some(t => t.dept === d.dept) ? 'text-sw-text' : 'text-[var(--text-muted)]'}>
                        <td>{d.dept}</td><td className="text-right font-mono">{money(d.sales_cents)}</td>
                        <td className="text-right">{pct(d.share)}</td><td className="text-right">{d.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
