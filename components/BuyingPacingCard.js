'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fmt, today } from '@/lib/utils';
import { computeBuyingPacing } from '@/lib/buying-pacing';

// Self-contained "Buying vs Sales" pacing card. Fetches its own month-to-date
// data so it can be dropped onto any owner page. Mirrors the numbers in the
// Wednesday Telegram report.
export default function BuyingPacingCard({ className = '' }) {
  const { supabase, isOwner } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOwner) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      const td = today();
      const monthStart = `${td.slice(0, 7)}-01`;
      const [{ data: stores }, { data: salesRows }, { data: purchaseRows }] = await Promise.all([
        supabase.from('stores').select('id, name, color, buying_target_pct, is_active').order('created_at'),
        supabase.from('daily_sales').select('store_id, total_sales, net_sales').gte('date', monthStart).lte('date', td),
        supabase.from('purchases').select('store_id, total_cost, unit_cost').gte('week_of', monthStart).lte('week_of', td),
      ]);
      if (cancelled) return;
      const activeStores = (stores || []).filter(s => s.is_active !== false);
      setData(computeBuyingPacing({ stores: activeStores, salesRows, purchaseRows, today: td }));
      setLoading(false);
    })().catch((e) => { console.error('[buying-pacing]', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supabase, isOwner]);

  if (!isOwner || loading || !data) return null;

  const o = data.overall;
  const pctStr = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
  const c = (over) => (over ? 'var(--color-danger)' : 'var(--color-success)');

  return (
    <div
      className={`rounded-xl border bg-[var(--bg-elevated)] p-4 ${className}`}
      style={{ borderColor: o.overBudget ? 'rgba(226,75,74,0.3)' : 'var(--border-subtle)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[var(--text-primary)] text-[14px] font-bold">
          🛒 Buying vs Sales · {data.monthName} 1–{data.daysElapsed}
          <span className="text-[var(--text-muted)] font-normal text-[12px]"> ({data.daysElapsed} of {data.daysInMonth} days)</span>
        </h3>
        <span className="text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide" style={{ background: c(o.overBudget) + '22', color: c(o.overBudget) }}>
          {o.overBudget ? 'Over target' : 'On target'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat label="Sales (MTD)" value={fmt(o.mtdSales)} />
        <Stat label="Buying (MTD)" value={fmt(o.mtdBuying)} />
        <Stat label="Buying % of sales" value={pctStr(o.pct)} sub={`target ≤ ${o.targetPct.toFixed(0)}% (${fmt(o.targetBuying)})`} color={c(o.overBudget)} />
        <Stat label={o.headroom >= 0 ? 'Left to spend' : 'Over target by'} value={fmt(Math.abs(o.headroom))} color={o.headroom >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
      </div>

      <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 text-[12px]">
        <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Projected for all of {data.monthName} (current pace)</p>
        <p className="text-[var(--text-secondary)]">
          Sales ~<span className="text-[var(--text-primary)] font-semibold tabular-nums">{fmt(o.projSales)}</span>
          {' · '}Buying ~<span className="font-semibold tabular-nums" style={{ color: c(o.projOverBudget) }}>{fmt(o.projBuying)}</span>
          {' '}(<span className="tabular-nums" style={{ color: c(o.projOverBudget) }}>{pctStr(o.projPct)}</span>)
          {' · '}target ~<span className="tabular-nums">{fmt(o.projTargetBuying)}</span>
          {o.projOverBudget && <span className="text-[var(--color-danger)] font-semibold"> — on pace to overspend, buy less this weekend</span>}
        </p>
      </div>

      {data.perStore.length > 1 && (
        <div className="mt-3 space-y-1.5">
          {data.perStore.map(s => {
            const short = s.name?.split(' - ').pop()?.trim() || s.name;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-[var(--text-primary)] truncate">{short}</span>
                </span>
                <span className="text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                  {fmt(s.mtdSales)} → {fmt(s.mtdBuying)}{' '}
                  <span className="font-semibold" style={{ color: c(s.overBudget) }}>({pctStr(s.pct)} / {s.targetPct.toFixed(0)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div>
      <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider">{label}</p>
      <p className="text-[18px] font-bold tabular-nums" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[var(--text-muted)] text-[10px]">{sub}</p>}
    </div>
  );
}
