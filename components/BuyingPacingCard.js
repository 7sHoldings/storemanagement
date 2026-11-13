'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fmt, today } from '@/lib/utils';
import { computeBuyingPacing } from '@/lib/buying-pacing';

// Self-contained "Buying vs Sales" pacing card. Fetches its own data so it can
// be dropped onto any owner page. Pass the page's date range (`start`/`end`)
// and store filter (`storeIds`) so the card follows what the user picked —
// "Last Month" shows last month. With no range it falls back to the current
// month to date, the same numbers as the Wednesday Telegram report.
export default function BuyingPacingCard({ className = '', start, end, storeIds }) {
  const { supabase, isOwner } = useAuth();
  const [data, setData] = useState(null);
  const storeKey = (storeIds || []).filter(Boolean).join(',');

  useEffect(() => {
    if (!isOwner) return undefined;
    let cancelled = false;
    (async () => {
      const td = today();
      const from = start || `${td.slice(0, 7)}-01`;
      // Nothing after today exists yet, so an unfinished period stops there.
      const to = end && end < td ? end : td;
      const [{ data: stores }, { data: salesRows }, { data: purchaseRows }] = await Promise.all([
        supabase.from('stores').select('id, name, color, buying_target_pct, is_active').order('created_at'),
        supabase.from('daily_sales').select('store_id, total_sales, net_sales').gte('date', from).lte('date', to),
        supabase.from('purchases').select('store_id, total_cost, unit_cost').gte('week_of', from).lte('week_of', to),
      ]);
      if (cancelled) return;
      const activeStores = (stores || [])
        .filter(s => s.is_active !== false)
        .filter(s => !storeKey || storeKey.split(',').includes(s.id));
      setData(computeBuyingPacing({ stores: activeStores, salesRows, purchaseRows, today: td, start, end }));
    })().catch((e) => { console.error('[buying-pacing]', e); });
    return () => { cancelled = true; };
  }, [supabase, isOwner, start, end, storeKey]);

  if (!isOwner || !data) return null;

  const o = data.overall;
  const pctStr = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
  const c = (over) => (over ? 'var(--color-danger)' : 'var(--color-success)');

  return (
    <div
      className={`rounded-xl border bg-[var(--bg-elevated)] p-4 ${className}`}
      style={{ borderColor: o.overBudget ? 'rgba(226,75,74,0.3)' : 'var(--border-subtle)' }}
    >
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[var(--text-primary)] text-[15px] font-semibold">
          Buying vs sales · {data.label}
          {data.inProgress && (
            <span className="text-[var(--text-muted)] font-normal text-[12px]"> ({data.daysElapsed} of {data.daysInPeriod} days)</span>
          )}
        </h3>
        <span className="text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: c(o.overBudget) + '22', color: c(o.overBudget) }}>
          {o.overBudget ? 'Over target' : 'On target'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat label="Sales" value={fmt(o.mtdSales)} />
        <Stat label="Buying" value={fmt(o.mtdBuying)} />
        <Stat label="Buying % of sales" value={pctStr(o.pct)} sub={`target ≤ ${o.targetPct.toFixed(0)}% (${fmt(o.targetBuying)})`} color={c(o.overBudget)} />
        <Stat label={o.headroom >= 0 ? 'Left to spend' : 'Over target by'} value={fmt(Math.abs(o.headroom))} color={o.headroom >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
      </div>

      {data.inProgress && (
      <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 text-[12px]">
        <p className="text-[var(--text-muted)] text-[12px] font-bold mb-1">Projected for the full period (current pace)</p>
        <p className="text-[var(--text-secondary)]">
          Sales ~<span className="text-[var(--text-primary)] font-semibold tabular-nums">{fmt(o.projSales)}</span>
          {' · '}Buying ~<span className="font-semibold tabular-nums" style={{ color: c(o.projOverBudget) }}>{fmt(o.projBuying)}</span>
          {' '}(<span className="tabular-nums" style={{ color: c(o.projOverBudget) }}>{pctStr(o.projPct)}</span>)
          {' · '}target ~<span className="tabular-nums">{fmt(o.projTargetBuying)}</span>
          {o.projOverBudget && <span className="text-[var(--color-danger)] font-semibold"> — on pace to overspend, buy less this weekend</span>}
        </p>
      </div>
      )}

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
      <p className="text-[var(--text-muted)] text-[13px] font-medium">{label}</p>
      <p className="text-[20px] font-semibold tabular-nums" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[var(--text-muted)] text-[12px]">{sub}</p>}
    </div>
  );
}
