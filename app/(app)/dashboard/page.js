'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { proratedExpenses } from '@/lib/profit';
import { useDateRange, DatePresets, Loading } from '@/components/UI';
import { V2Alert } from '@/components/ui';
import { fmt, today } from '@/lib/utils';
import { previousRange, dailySeries, pctChange } from '@/lib/dashboard';
import DailySalesChart from '@/components/dashboard/DailySalesChart';
import BuyingPacingCard from '@/components/BuyingPacingCard';

const DEFAULT_TARGET = 50;
const shortName = (name) => name?.split(' - ').pop()?.trim() || name;
const fDate = (iso, opts = { month: 'short', day: 'numeric' }) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', opts);
const rangeLabel = (s, e) => {
  const sameYear = s.slice(0, 4) === e.slice(0, 4);
  return s === e ? fDate(s, { month: 'short', day: 'numeric', year: 'numeric' })
    : `${fDate(s)} – ${fDate(e)}${sameYear ? `, ${e.slice(0, 4)}` : ''}`;
};
const whole = (v) => '$' + Math.round(v).toLocaleString('en-US');

function Delta({ pct, className = '' }) {
  if (pct == null) return <span className={`text-[#71717A] ${className}`}>—</span>;
  const up = pct >= 0;
  return <span className={`${up ? 'text-[#15803D]' : 'text-[#B91C1C]'} font-semibold ${className}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%</span>;
}

function SoPill({ v }) {
  if (Math.abs(v) < 1) return <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-semibold bg-[#F4F4F5] text-[#52525B] tabular-nums">{v > 0 ? '−' : '+'}{fmt(Math.abs(v))}</span>;
  return v > 0
    ? <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-semibold bg-[#FEF2F2] text-[#B91C1C] tabular-nums">−{fmt(v)}</span>
    : <span className="inline-block px-2 py-0.5 rounded-md text-[12px] font-semibold bg-[#F0FDF4] text-[#15803D] tabular-nums">+{fmt(-v)}</span>;
}

function Sparkline({ values }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(values.length - 1, 1)) * 96).toFixed(1)} ${(30 - ((v - min) / span) * 28).toFixed(1)}`).join(' ');
  return <svg width="96" height="32" viewBox="0 0 96 32" aria-hidden="true" className="shrink-0"><path d={d} fill="none" stroke="#A21CAF" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

const Card = ({ children, className = '' }) => <section className={`bg-white border border-[#E4E4E7] rounded-xl ${className}`}>{children}</section>;
const Kpi = ({ label, children }) => (
  <Card className="px-[18px] py-4 flex flex-col gap-2">
    <span className="text-[13px] font-medium text-[#52525B]">{label}</span>
    {children}
  </Card>
);

export default function DashboardPage() {
  const { supabase, effectiveStoreId } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thismonth');
  const [data, setData] = useState(null);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const storeId = effectiveStoreId;
  // The comparison and chart stop at the last day NRS has synced: comparing
  // Nov 1–11 with Oct 1–13 because today is the 13th would be unfair.
  const shownEnd = data?.shownEnd || range.end;
  const prev = useMemo(() => previousRange(range.start, shownEnd), [range.start, shownEnd]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const scope = (q) => (storeId ? q.eq('store_id', storeId) : q);
        const { data: storeData } = await supabase.from('stores').select('*').order('created_at');

        const { data: salesAll } = await scope(supabase.from('daily_sales')
          .select('date, store_id, cash_sales, card_sales, r2_net, r1_safe_drop, r2_safe_drop, total_sales, gross_sales, net_sales, non_tax_sales, short_over, tax_collected')
          .gte('date', range.start).lte('date', range.end));
        const lastData = (salesAll || []).reduce((m, r) => (r.date > m ? r.date : m), '');
        // Today's figures only arrive with tomorrow morning's NRS sync, so a
        // range that runs into today stops at yesterday (or at the last day
        // that has synced, if that is earlier). A range of just today is
        // left alone.
        const td = today();
        const yd = new Date(td + 'T12:00:00'); yd.setDate(yd.getDate() - 1);
        const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
        let shownEnd = range.end;
        if (range.end >= td && range.start < td) {
          shownEnd = lastData && lastData < yesterday ? lastData : yesterday;
          if (shownEnd < range.start) shownEnd = range.start;
        }
        const cmp = previousRange(range.start, shownEnd);
        // Every figure covers the same days as the comparison.
        const sales = (salesAll || []).filter((r) => r.date <= shownEnd);

        const [
          { data: prevSales }, { data: purch }, { data: exps },
          { data: cashRows }, { data: gmRows }, { data: paidOutRows }, { data: todayRows },
        ] = await Promise.all([
          scope(supabase.from('daily_sales').select('date, store_id, total_sales, net_sales').gte('date', cmp.start).lte('date', cmp.end)),
          scope(supabase.from('purchases').select('total_cost, unit_cost, week_of, store_id').gte('week_of', range.start).lte('week_of', range.end)),
          // Expenses are stored per month; the months overlapping the range
          // are fetched and shared out by day (proratedExpenses).
          scope(supabase.from('expenses').select('amount, store_id, month').gte('month', range.start.slice(0, 7)).lte('month', range.end.slice(0, 7))),
          scope(supabase.from('cash_collections').select('date, store_id, cash_collected, collected_by').gte('date', range.start).lte('date', range.end)),
          scope(supabase.from('game_machine_collections').select('amount, store_id').gte('date', range.start).lte('date', range.end)),
          // Cash paid out of the collected cash (e.g. cash payroll).
          scope(supabase.from('expenses').select('amount, store_id').eq('paid_from', 'cash_collection').gte('expense_date', range.start).lte('expense_date', range.end)),
          scope(supabase.from('daily_sales').select('store_id').eq('date', today())),
        ]);
        // Profit take-outs are company-wide (no store), so only the All
        // Stores view deducts them from Cash in Hand.
        const { data: takeoutRows } = storeId
          ? { data: [] }
          : await supabase.from('profit_takeouts').select('cash_amount').gte('date', range.start).lte('date', range.end);
        if (cancelled) return;

        const sum = (rows, f) => (rows || []).reduce((s, r) => s + (Number(f(r)) || 0), 0);
        const net = (r) => r.total_sales ?? r.net_sales ?? 0;
        const totalNet = sum(sales, net);
        const totalGross = sum(sales, (r) => r.gross_sales ?? r.total_sales);
        const totalCash = sum(sales, (r) => (r.cash_sales || 0) + (r.r2_net || 0));
        const totalCard = sum(sales, (r) => r.card_sales);
        const totalShortOver = sum(sales, (r) => r.short_over);
        const totalPurch = sum(purch, (r) => r.total_cost || r.unit_cost);
        const totalExp = proratedExpenses(exps, range.start, range.end);
        const totalGameMachine = sum(gmRows, (r) => r.amount);
        const cashCollected = sum((cashRows || []).filter((c) => c.collected_by), (r) => r.cash_collected);
        const cashPaidOut = sum(paidOutRows, (r) => r.amount);
        const cashTakenOut = sum(takeoutRows, (r) => r.cash_amount);
        // Same formula as the Cash Collection page and the P&L Report.
        const cashInHand = cashCollected + totalGameMachine - cashPaidOut - cashTakenOut;
        // Net profit mirrors the P&L Report: sales + game income − buying − expenses.
        const totalIncome = totalNet + totalGameMachine;
        const netProfit = totalIncome - totalPurch - totalExp;
        const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
        const prevNet = sum(prevSales, net);

        // Safe drops waiting to be collected: days with no owner-recorded collection.
        const collectedKeys = new Set((cashRows || []).filter((c) => c.collected_by).map((c) => `${c.store_id}_${c.date}`));
        const drop = (r) => (r.r1_safe_drop || 0) + (r.r2_safe_drop || 0);
        const uncollected = (sales || []).filter((r) => drop(r) > 0 && !collectedKeys.has(`${r.store_id}_${r.date}`));
        const toCollect = sum(uncollected, drop);
        const dropDays = (sales || []).filter((r) => drop(r) > 0).length;
        const noDrop = (sales || []).filter((r) => drop(r) === 0 && (r.cash_sales || 0) + (r.r2_net || 0) > 0);

        const inScope = storeId ? (storeData || []).filter((s) => s.id === storeId) : (storeData || []);
        const perStore = inScope.map((st) => {
          const rows = (sales || []).filter((r) => r.store_id === st.id);
          const n = sum(rows, net);
          const before = sum((prevSales || []).filter((r) => r.store_id === st.id), net);
          const buy = sum((purch || []).filter((r) => r.store_id === st.id), (r) => r.total_cost || r.unit_cost);
          const exp = proratedExpenses((exps || []).filter((r) => r.store_id === st.id), range.start, range.end);
          const games = sum((gmRows || []).filter((r) => r.store_id === st.id), (r) => r.amount);
          const income = n + games;
          return {
            id: st.id, name: shortName(st.name), color: st.color,
            target: Number.isFinite(Number(st.buying_target_pct)) ? Number(st.buying_target_pct) : DEFAULT_TARGET,
            sales: n, prev: before, delta: pctChange(n, before),
            cash: sum(rows, (r) => (r.cash_sales || 0) + (r.r2_net || 0)), card: sum(rows, (r) => r.card_sales),
            buying: buy, buyPct: n > 0 ? (buy / n) * 100 : null,
            shortOver: sum(rows, (r) => r.short_over),
            margin: income > 0 ? ((income - buy - exp) / income) * 100 : 0,
          };
        }).sort((a, b) => b.sales - a.sales);
        const target = totalNet > 0 ? perStore.reduce((s, x) => s + x.sales * x.target, 0) / totalNet : DEFAULT_TARGET;

        setStores(storeData || []);
        setData({
          totalNet, totalGross, totalCash, totalCard, totalShortOver, totalPurch, totalExp, totalGameMachine,
          cashCollected, cashPaidOut, cashTakenOut, cashInHand, netProfit, margin, prevNet,
          toCollect, uncollectedDays: uncollected.length, dropDays, noDrop, perStore, target,
          shownEnd,
          series: dailySeries(sales, range.start, shownEnd),
          prevSeries: dailySeries(prevSales, cmp.start, cmp.end),
          missingToday: inScope.filter((st) => !(todayRows || []).some((r) => r.store_id === st.id)),
        });
      } catch (e) {
        console.error('[dashboard] load failed:', e);
        if (!cancelled) setLoadError(e?.message || 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, storeId]);

  const alerts = useMemo(() => {
    if (!data) return [];
    const a = [];
    data.perStore.forEach((s) => {
      if (s.shortOver > 50) a.push({ tone: 'red', title: `${s.name} is ${whole(s.shortOver)} short`, body: 'More cash was rung up than reached the safe.', href: '/cash' });
      else if (s.shortOver < -50) a.push({ tone: 'amber', title: `${s.name} is ${whole(-s.shortOver)} over`, body: 'More cash in the safe than was rung up.', href: '/cash' });
      if (s.margin < 40 && s.sales > 100) a.push({ tone: 'amber', title: `${s.name} margin is only ${s.margin.toFixed(0)}%`, body: 'Check buying and expenses on the P&L.', href: '/reports' });
    });
    // Days with cash rung up but no safe drop — grouped by date.
    const byDate = {};
    data.noDrop.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r.store_id); });
    const storeCount = data.perStore.length;
    Object.entries(byDate).sort().forEach(([date, ids]) => {
      const names = ids.map((id) => shortName(stores.find((s) => s.id === id)?.name)).filter(Boolean);
      a.push({
        tone: 'amber',
        title: ids.length === storeCount && storeCount > 1 ? `No safe drops recorded on ${fDate(date)}` : `${names.join(', ')} — no safe drop on ${fDate(date)}`,
        body: 'Confirm the drop was entered in NRS.',
        href: '/sales',
      });
    });
    if (data.missingToday.length) {
      a.push({ tone: 'gray', title: data.missingToday.length === 1 ? `${shortName(data.missingToday[0].name)} has no entry for today yet` : `${data.missingToday.length} stores have no entry for today yet`, body: 'NRS syncs each morning; employees add house accounts.', href: '/sales' });
    }
    if (data.uncollectedDays) {
      a.push({ tone: 'gray', title: 'Cash waiting to be collected', body: `${data.uncollectedDays} store-day${data.uncollectedDays === 1 ? '' : 's'} · ${fmt(data.toCollect)} in safes.`, href: '/cash' });
    }
    return a;
  }, [data, stores]);

  if (loading && !data) return <Loading />;

  const d = data;
  const curName = preset === 'thismonth' ? 'This month' : 'This period';
  const prevName = preset === 'thismonth' || range.start.endsWith('-01') ? fDate(prev.start, { month: 'long' }) : 'Previous period';
  const salesDelta = d ? pctChange(d.totalNet, d.prevNet) : null;
  const buyPct = d && d.totalNet > 0 ? (d.totalPurch / d.totalNet) * 100 : 0;
  const maxStoreSales = d ? Math.max(...d.perStore.map((s) => s.sales), 1) : 1;
  const shortList = d ? d.perStore.filter((s) => s.shortOver > 1).sort((a, b) => b.shortOver - a.shortOver).slice(0, 2) : [];
  const dot = { red: '#B91C1C', amber: '#D97706', gray: '#71717A' };

  return (
    <div className="flex flex-col gap-5">
      {/* Page header — title row, then a controls row that never moves */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight text-[#18181B]">Dashboard</h1>
            <p className="text-[13px] text-[#71717A] mt-1">
              {storeId ? shortName(stores.find((s) => s.id === storeId)?.name) : 'All stores'} · {rangeLabel(range.start, shownEnd)}
              {shownEnd !== range.end && <span> (synced through {fDate(shownEnd)})</span>} · compared with {rangeLabel(prev.start, prev.end)}
            </p>
          </div>
          <Link href="/sales?new=1" className="hidden md:inline-flex shrink-0 h-9 px-3.5 rounded-lg bg-[#A21CAF] hover:bg-[#86198F] text-white text-[13px] font-semibold items-center">Enter sales</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DatePresets active={preset} onChange={selectPreset} />
          <span className="hidden sm:flex items-center gap-1.5 sm:ml-auto">
            <input type="date" aria-label="Start date" value={range.start} onChange={(e) => setStart(e.target.value)} className="!w-[150px] !h-9 !min-h-0 !py-0 !text-[13px]" />
            <span className="text-[13px] text-[#71717A]">to</span>
            <input type="date" aria-label="End date" value={range.end} onChange={(e) => setEnd(e.target.value)} className="!w-[150px] !h-9 !min-h-0 !py-0 !text-[13px]" />
          </span>
        </div>
      </div>

      {loadError && <V2Alert type="danger">{loadError}</V2Alert>}

      {d && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi label="Net sales">
              <div className="flex items-end justify-between gap-3">
                <span className="text-[26px] font-semibold tracking-tight tabular-nums text-[#18181B]">{whole(d.totalNet)}</span>
                <Sparkline values={d.series.map((x) => x.value)} />
              </div>
              <span className="text-[12px] text-[#71717A]"><Delta pct={salesDelta} /> vs {whole(d.prevNet)} in {prevName === 'Previous period' ? 'the previous period' : prevName}</span>
            </Kpi>
            <Kpi label="Product buying">
              <span className="text-[26px] font-semibold tracking-tight tabular-nums text-[#18181B]">{whole(d.totalPurch)}</span>
              <div className="h-1.5 rounded-full bg-[#F4F4F5] overflow-hidden" role="progressbar" aria-valuenow={Math.round(buyPct)} aria-valuemin={0} aria-valuemax={Math.round(d.target)} aria-label="Buying as a share of the target">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (buyPct / d.target) * 100)}%`, background: buyPct > d.target ? '#B91C1C' : '#A21CAF' }} />
              </div>
              <span className="text-[12px] text-[#71717A]">{buyPct.toFixed(1)}% of sales · target ≤ {d.target.toFixed(0)}%</span>
            </Kpi>
            <Kpi label="Short / Over">
              <span className={`text-[26px] font-semibold tracking-tight tabular-nums ${d.totalShortOver > 1 ? 'text-[#B91C1C]' : d.totalShortOver < -1 ? 'text-[#15803D]' : 'text-[#18181B]'}`}>
                {d.totalShortOver > 0.005 ? '−' : d.totalShortOver < -0.005 ? '+' : ''}{fmt(Math.abs(d.totalShortOver))}
              </span>
              <span className="text-[12px] text-[#71717A]">
                {d.totalShortOver > 1 ? 'Net short' : d.totalShortOver < -1 ? 'Net over' : 'Balanced'}
                {shortList.length > 0 && ` · largest: ${shortList.map((s) => `${s.name} ${whole(s.shortOver)}`).join(', ')}`}
              </span>
            </Kpi>
            <Kpi label="Cash to collect">
              <span className="text-[26px] font-semibold tracking-tight tabular-nums text-[#18181B]">{whole(d.toCollect)}</span>
              <span className="text-[12px] text-[#71717A]">Safe drops · {d.dropDays - d.uncollectedDays} of {d.dropDays} days collected</span>
            </Kpi>
          </div>

          {/* Chart + sales by store */}
          <div className="flex flex-wrap gap-4">
            <Card className="flex-[2_1_560px] min-w-0 px-5 py-[18px]">
              <DailySalesChart current={d.series} previous={d.prevSeries} currentLabel={curName} previousLabel={prevName} />
            </Card>
            {d.perStore.length > 1 && (
              <Card className="flex-[1_1_320px] min-w-0 px-5 py-[18px] flex flex-col gap-3.5">
                <h2 className="text-[15px] font-semibold text-[#18181B]">Sales by store</h2>
                {d.perStore.map((s, i) => (
                  <div key={s.id} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="font-medium text-[#18181B]">{s.name}</span>
                      <span className="tabular-nums"><span className="font-semibold text-[#18181B]">{whole(s.sales)}</span><Delta pct={s.delta} className="text-[12px] ml-2" /></span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F4F4F5] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(s.sales / maxStoreSales) * 100}%`, background: i === 0 ? '#A21CAF' : '#D4A5DC' }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Profit & cash strip */}
          <Card className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#F0F0F2]">
            <div className="px-5 py-4">
              <div className="text-[13px] font-medium text-[#52525B]">Net profit</div>
              <div className={`text-[20px] font-semibold tabular-nums mt-1 ${d.netProfit < 0 ? 'text-[#B91C1C]' : 'text-[#18181B]'}`}>{d.netProfit < 0 ? '−' : ''}{whole(Math.abs(d.netProfit))}</div>
              <div className="text-[12px] text-[#71717A]">{d.margin.toFixed(1)}% margin</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[13px] font-medium text-[#52525B]">Expenses</div>
              <div className="text-[20px] font-semibold tabular-nums mt-1 text-[#18181B]">{whole(d.totalExp)}</div>
              <div className="text-[12px] text-[#71717A]">Shared out by day</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-[13px] font-medium text-[#52525B]">Game machines</div>
              <div className="text-[20px] font-semibold tabular-nums mt-1 text-[#18181B]">{whole(d.totalGameMachine)}</div>
              <div className="text-[12px] text-[#71717A]">Other income</div>
            </div>
            <div className="px-5 py-4" title={`Collected ${fmt(d.cashCollected)} + games ${fmt(d.totalGameMachine)} − paid out ${fmt(d.cashPaidOut)} − taken out ${fmt(d.cashTakenOut)}`}>
              <div className="text-[13px] font-medium text-[#52525B]">Cash in hand</div>
              <div className="text-[20px] font-semibold tabular-nums mt-1 text-[#18181B]">{fmt(d.cashInHand)}</div>
              <div className="text-[12px] text-[#71717A]">After cash expenses{storeId ? '' : ' & take-outs'}</div>
            </div>
          </Card>

          {/* Store table + attention */}
          <div className="flex flex-wrap gap-4 items-start">
            <Card className="flex-[2_1_640px] min-w-0 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-[#18181B]">Store performance</h2>
                <Link href="/reports" className="text-[13px] font-medium text-[#A21CAF] hover:text-[#86198F]">View P&amp;L report →</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[680px]">
                  <thead>
                    <tr>
                      <th className="!pl-5">Store</th>
                      <th className="!text-right">Net sales</th>
                      <th className="!text-right">vs {prevName === 'Previous period' ? 'prev.' : prevName.slice(0, 3)}</th>
                      <th className="!text-right">Cash</th>
                      <th className="!text-right">Card</th>
                      <th className="!text-right">Buying</th>
                      <th className="!text-right !pr-5">Short / Over</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.perStore.map((s) => (
                      <tr key={s.id}>
                        <td className="!pl-5 font-medium">{s.name}</td>
                        <td className="!text-right font-semibold">{whole(s.sales)}</td>
                        <td className="!text-right"><Delta pct={s.delta} className="font-normal" /></td>
                        <td className="!text-right !text-[#52525B]">{whole(s.cash)}</td>
                        <td className="!text-right !text-[#52525B]">{whole(s.card)}</td>
                        <td className={`!text-right ${s.buyPct != null && s.buyPct > s.target ? '!text-[#B91C1C] font-semibold' : '!text-[#52525B]'}`}>{s.buyPct == null ? '—' : `${s.buyPct.toFixed(1)}%`}</td>
                        <td className="!text-right !pr-5"><SoPill v={s.shortOver} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="flex-[1_1_300px] min-w-0 px-5 py-4">
              <h2 className="text-[15px] font-semibold text-[#18181B] mb-2">Needs attention</h2>
              {alerts.length === 0 ? (
                <p className="text-[13px] text-[#71717A] py-2">Everything looks good for this period.</p>
              ) : alerts.map((a, i) => (
                <Link key={i} href={a.href} className="flex gap-3 items-start py-2.5 border-t border-[#F0F0F2] hover:bg-[#FAFAFA] -mx-2 px-2 rounded-md">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dot[a.tone] }} aria-hidden="true" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-semibold text-[#18181B]">{a.title}</span>
                    <span className="text-[12px] text-[#71717A]">{a.body}</span>
                  </span>
                </Link>
              ))}
            </Card>
          </div>

          {/* Buying pace for the same period and store */}
          <BuyingPacingCard start={range.start} end={range.end} storeIds={storeId ? [storeId] : []} />
        </>
      )}
    </div>
  );
}
