'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Loading, DateBar, useDateRange, StorePills, Alert } from '@/components/UI';
import { fmt } from '@/lib/utils';
import { profitSummary } from '@/lib/profit';

// One row of the money chain. `strong` marks the two lines worth reading
// first — total sales and profit — so the eye lands on them rather than
// weighing seven numbers equally.
function Line({ label, value, hint, sign = '', strong = false, tone = 'plain' }) {
  const toneClass =
    tone === 'minus' ? 'text-sw-red'
    : tone === 'plus' ? 'text-sw-green'
    : 'text-sw-text';
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? '' : 'text-[13px]'}`}>
      <div className="min-w-0">
        <div className={strong ? 'text-[13px] font-bold uppercase tracking-wide text-sw-sub' : 'text-sw-sub'}>
          {label}
        </div>
        {hint && <div className="text-[11px] text-sw-dim mt-0.5">{hint}</div>}
      </div>
      <div className={`shrink-0 font-mono tabular-nums ${toneClass} ${strong ? 'text-[22px] font-bold' : ''}`}>
        {sign}{fmt(Math.abs(value))}
      </div>
    </div>
  );
}

const Rule = () => <div className="border-t border-sw-border my-1" />;

export default function MoneyPage() {
  const { supabase, isOwner, effectiveStoreId } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thismonth');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState([]);
  const [summary, setSummary] = useState(null);
  const [perStore, setPerStore] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('stores').select('id, name').order('created_at')
      .then(({ data }) => setStores(data || []));
  }, [supabase]);

  // Employees are scoped to their own store; owners choose.
  const activeStore = isOwner ? storeId : (effectiveStoreId || '');

  const load = useCallback(async () => {
    setErr('');
    const scope = (q) => (activeStore ? q.eq('store_id', activeStore) : q);
    try {
      const [sales, purchases, expenses, collections, games] = await Promise.all([
        scope(supabase.from('daily_sales')
          .select('date, store_id, gross_sales, total_sales, tax_collected, cash_sales, r2_net, card_sales, register2_card, r1_safe_drop, r2_safe_drop, short_over')
          .gte('date', range.start).lte('date', range.end)),
        scope(supabase.from('purchases').select('store_id, total_cost, unit_cost')
          .gte('week_of', range.start).lte('week_of', range.end)),
        // Expenses are one figure per month, so every month the range touches
        // is fetched whole and shared out by day in profitSummary.
        scope(supabase.from('expenses').select('store_id, month, amount')
          .gte('month', range.start.slice(0, 7)).lte('month', range.end.slice(0, 7))),
        scope(supabase.from('cash_collections').select('store_id, cash_collected')
          .gte('date', range.start).lte('date', range.end)),
        scope(supabase.from('game_machine_collections').select('store_id, amount')
          .gte('date', range.start).lte('date', range.end)),
      ]);

      // A silently empty result reads as "no sales" and shows a confident
      // zero, which is worse than an error.
      for (const r of [sales, purchases, expenses, collections, games]) {
        if (r.error) throw new Error(r.error.message);
      }

      const args = {
        sales: sales.data, purchases: purchases.data, expenses: expenses.data,
        collections: collections.data, games: games.data,
        start: range.start, end: range.end,
      };
      setSummary(profitSummary(args));

      // Same figures per store, so a bad month can be traced to one shop.
      const ids = [...new Set((sales.data || []).map(r => r.store_id))];
      setPerStore(ids.map(id => ({
        id,
        name: stores.find(s => s.id === id)?.name || 'Store',
        ...profitSummary({
          sales: (sales.data || []).filter(r => r.store_id === id),
          purchases: (purchases.data || []).filter(r => r.store_id === id),
          expenses: (expenses.data || []).filter(r => r.store_id === id),
          collections: (collections.data || []).filter(r => r.store_id === id),
          games: (games.data || []).filter(r => r.store_id === id),
          start: range.start, end: range.end,
        }),
      })).sort((a, b) => b.totalSales - a.totalSales));
    } catch (e) {
      setErr(e.message);
      setSummary(null);
      setPerStore([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, range.start, range.end, activeStore, stores]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Correcting a sale or an expense happens on another page, often in another
  // tab. Re-reading on focus means the owner comes back to current figures
  // instead of a stale screen they have no reason to distrust.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (loading && !summary) return <Loading text="Working out the numbers…" />;

  const s = summary;

  return (
    <div className="pb-10">
      <PageHeader title="Money" subtitle="Sales, costs and what is left" />

      <DateBar
        preset={preset} onPreset={selectPreset}
        startDate={range.start} endDate={range.end}
        onStartChange={setStart} onEndChange={setEnd}
      />
      {isOwner && stores.length > 1 && (
        <div className="mt-3">
          <StorePills stores={stores} value={storeId} onChange={setStoreId} />
        </div>
      )}

      {err && <div className="mt-3"><Alert type="error">Could not load the figures: {err}</Alert></div>}

      {s && (
        <>
          {/* ── The chain ── */}
          <div className="mt-4 rounded-xl border border-sw-border bg-sw-card p-4">
            <Line
              label="Gross sales"
              hint="What customers paid, sales tax included"
              value={s.grossSales}
            />
            <Line label="Sales tax" hint="The state's share — never yours" value={s.tax} sign="−" tone="minus" />
            <Rule />
            <Line label="Total sales" hint="What the business earned" value={s.totalSales} strong />
            <Rule />
            <Line label="Product buying" hint="Stock bought in" value={s.productBuying} sign="−" tone="minus" />
            <Line
              label="Expenses"
              hint={s.expensesProrated
                ? 'Rent, wages, bills — shared out by day for this range'
                : 'Rent, wages, bills'}
              value={s.expenses}
              sign="−"
              tone="minus"
            />
            {s.otherIncome > 0 && (
              <Line label="Game machines" hint="Income the stores earned without selling stock" value={s.otherIncome} sign="+" tone="plus" />
            )}
            <Rule />
            <div className={`rounded-lg px-3 py-3 mt-1 ${s.profit >= 0 ? 'bg-sw-greenD' : 'bg-sw-redD'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-wide text-sw-sub">
                    {s.profit >= 0 ? 'Profit' : 'Loss'}
                  </div>
                  <div className="text-[11px] text-sw-dim mt-0.5">
                    {s.margin.toFixed(1)}% of what came in
                  </div>
                </div>
                <div className={`font-mono tabular-nums text-[28px] font-bold ${s.profit >= 0 ? 'text-sw-green' : 'text-sw-red'}`}>
                  {s.profit < 0 ? '−' : ''}{fmt(Math.abs(s.profit))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Cash ── */}
          <div className="mt-4 rounded-xl border border-sw-border bg-sw-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-sw-sub mb-1">Cash</div>
            <Line label="Cash sales" hint="Both registers — R2 is cash only" value={s.cash.sales} />
            <Line label="Card sales" value={s.cash.card} />
            <Line label="Put in the safe" hint="Safe drops recorded" value={s.cash.safeDrop} />
            <Line label="Collected from the safe" value={s.cash.collected} />
            {Math.abs(s.cash.shortOver) >= 0.01 && (
              <>
                <Rule />
                <Line
                  label={s.cash.shortOver > 0 ? 'Cash short' : 'Cash over'}
                  hint="Rung up versus put in the safe"
                  value={s.cash.shortOver}
                  sign={s.cash.shortOver > 0 ? '−' : '+'}
                  tone={s.cash.shortOver > 0 ? 'minus' : 'plus'}
                />
              </>
            )}
          </div>

          {/* ── Per store ── */}
          {perStore.length > 1 && (
            <div className="mt-4 rounded-xl border border-sw-border bg-sw-card p-4 overflow-x-auto">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sw-sub mb-2">By store</div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-sw-sub text-[10px] uppercase">
                    <th className="text-left font-semibold py-1.5">Store</th>
                    <th className="text-right font-semibold py-1.5">Sales</th>
                    <th className="text-right font-semibold py-1.5">Buying</th>
                    <th className="text-right font-semibold py-1.5">Expenses</th>
                    <th className="text-right font-semibold py-1.5">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {perStore.map(p => (
                    <tr key={p.id} className="border-t border-sw-border">
                      <td className="py-2 pr-2">{p.name}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{fmt(p.totalSales)}</td>
                      <td className="py-2 text-right font-mono tabular-nums text-sw-sub">{fmt(p.productBuying)}</td>
                      <td className="py-2 text-right font-mono tabular-nums text-sw-sub">{fmt(p.expenses)}</td>
                      <td className={`py-2 text-right font-mono tabular-nums font-bold ${p.profit >= 0 ? 'text-sw-green' : 'text-sw-red'}`}>
                        {p.profit < 0 ? '−' : ''}{fmt(Math.abs(p.profit))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* The two halves of the chain must agree; if they ever do not,
              say so rather than showing a sum that does not add up. */}
          {s.discrepancies.length > 0 && (
            <div className="mt-4">
              <Alert type="warning">
                {s.discrepancies.length} day{s.discrepancies.length === 1 ? '' : 's'} where
                gross minus tax does not match total sales. Re-run the NRS sync for
                {' '}{s.discrepancies.slice(0, 3).map(d => d.date).join(', ')}
                {s.discrepancies.length > 3 ? '…' : ''}.
              </Alert>
            </div>
          )}

          <div className="mt-4 text-[11px] text-sw-dim leading-relaxed">
            {s.days} day{s.days === 1 ? '' : 's'} with sales in this range.
            Figures are worked out from the records each time this page opens,
            so anything corrected by hand shows here straight away.
          </div>
        </>
      )}
    </div>
  );
}
