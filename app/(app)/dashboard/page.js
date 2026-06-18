'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDateRange, Loading } from '@/components/UI';
import { V2Alert } from '@/components/ui';
import { fmt, weekRangeLabel, startOfWeekMonday, today } from '@/lib/utils';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import AttentionAlerts from '@/components/dashboard/AttentionAlerts';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import NetProfitHero from '@/components/dashboard/NetProfitHero';
import KpiGrid from '@/components/dashboard/KpiGrid';
import WeeklyChartCard from '@/components/dashboard/WeeklyChartCard';
import StorePerformanceCard from '@/components/dashboard/StorePerformanceCard';
import QuickActionsRow from '@/components/dashboard/QuickActionsRow';
import BuyingPacingCard from '@/components/BuyingPacingCard';

function greeting(name) {
  const h = new Date().getHours();
  const g = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : h < 23 ? 'Good evening' : 'Good night';
  return `${g}, ${name || 'Owner'}`;
}
const dayStr = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

const PRESET_LABELS = {
  today: 'Today', yesterday: 'Yesterday', thisweek: 'This Week', lastweek: 'Last Week',
  thismonth: 'This Month', lastmonth: 'Last Month', last2weeks: 'Last 2 Weeks',
  last2months: 'Last 2 Months', last3months: 'Last 3 Months', last6months: 'Last 6 Months',
  thisyear: 'This Year', lastyear: 'Last Year', all: 'All Time',
};

export default function DashboardPage() {
  const router = useRouter();
  const { supabase, isOwner, profile, effectiveStoreId } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thisweek');
  const [selectedStore, setSelectedStore] = useState('');
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [todaySales, setTodaySales] = useState([]);
  const [todayLastWeek, setTodayLastWeek] = useState([]);
  const [nrsStatus, setNrsStatus] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [storePerf, setStorePerf] = useState([]);
  const [topEmployees, setTopEmployees] = useState([]);
  const [storeSort, setStoreSort] = useState('revenue');

  const storeId = selectedStore || effectiveStoreId;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data: storeData } = await supabase.from('stores').select('*').order('created_at');
        setStores(storeData || []);

        fetch('/api/nrs/validate').then(r => r.json()).then(d => setNrsStatus(d?.valid === true)).catch(() => setNrsStatus(false));
        supabase.from('nrs_sync_log').select('sync_date, status, created_at').order('created_at', { ascending: false }).limit(10)
          .then(({ data: syncLogs }) => {
            if (!syncLogs?.length) return;
            const latest = syncLogs[0];
            setLastSync({
              date: latest.sync_date, time: latest.created_at,
              success: syncLogs.filter(l => l.status === 'success' && l.sync_date === latest.sync_date).length,
              failed: syncLogs.filter(l => l.status === 'failed' && l.sync_date === latest.sync_date).length,
            });
          });

        let salesQ = supabase.from('daily_sales')
          .select('cash_sales, card_sales, register2_cash, register2_card, r1_safe_drop, r2_safe_drop, r2_net, total_sales, gross_sales, net_sales, non_tax_sales, short_over, credits, tax_collected, date, store_id')
          .gte('date', range.start).lte('date', range.end);
        if (storeId) salesQ = salesQ.eq('store_id', storeId);
        const { data: sales } = await salesQ;

        let purchQ = supabase.from('purchases').select('total_cost, unit_cost, week_of, store_id')
          .gte('week_of', range.start).lte('week_of', range.end);
        if (storeId) purchQ = purchQ.eq('store_id', storeId);
        const { data: purch } = await purchQ;

        // Expenses are stored as YYYY-MM. Filter to the months that overlap
        // the selected date range so a 1-day window doesn't subtract every
        // expense ever recorded against today's sales.
        let expQ = supabase.from('expenses')
          .select('amount, store_id, month')
          .gte('month', range.start.slice(0, 7))
          .lte('month', range.end.slice(0, 7));
        if (storeId) expQ = expQ.eq('store_id', storeId);
        const { data: exps } = await expQ;

        let cashQ = supabase.from('cash_collections').select('cash_collected, store_id')
          .gte('date', range.start).lte('date', range.end);
        if (storeId) cashQ = cashQ.eq('store_id', storeId);
        const { data: cashRows } = await cashQ;

        // Game-machine income — "other income" added to net profit, same as
        // the P&L Report. Kept out of sales revenue (totalRevenue) so sales
        // metrics stay sales-only; only net profit & margin include it.
        let gmQ = supabase.from('game_machine_collections').select('amount, store_id')
          .gte('date', range.start).lte('date', range.end);
        if (storeId) gmQ = gmQ.eq('store_id', storeId);
        const { data: gmRows } = await gmQ;

        const totalGross = sales?.reduce((s, r) => s + (r.gross_sales ?? r.total_sales ?? 0), 0) || 0;
        // Cash counted = what was actually dropped in the safe across both
        // registers. Falls back to cash_sales + register2_cash for legacy
        // rows where neither safe drop column was filled.
        const totalCash = sales?.reduce((s, r) => {
          const dropped = (r.r1_safe_drop || 0) + (r.r2_safe_drop || 0);
          if (dropped > 0) return s + dropped;
          return s + (r.cash_sales || 0) + (r.register2_cash || 0);
        }, 0) || 0;
        const totalCard = sales?.reduce((s, r) => s + (r.card_sales || 0) + (r.register2_card || 0), 0) || 0;
        // Real net (tax stripped). Falls back to total_sales for legacy rows
        // that pre-date the net_sales column being populated.
        const totalNet = sales?.reduce((s, r) => s + (r.total_sales ?? r.net_sales ?? 0), 0) || 0;
        const totalRevenue = totalNet;
        const totalNonTax = sales?.reduce((s, r) => s + (r.non_tax_sales || 0), 0) || 0;
        const totalShortOver = sales?.reduce((s, r) => s + (r.short_over || 0), 0) || 0;
        const totalTax = sales?.reduce((s, r) => s + (r.tax_collected || 0), 0) || 0;
        const totalPurch = purch?.reduce((s, r) => s + (r.total_cost || r.unit_cost || 0), 0) || 0;
        // Sum the full month-amount of every expense whose month overlaps the
        // range (the query already scopes to overlapping months). Matches the
        // P&L Report exactly so the dashboard's Net Profit reconciles with it.
        const totalExp = exps?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
        const totalGameMachine = gmRows?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
        const cashInHand = cashRows?.reduce((s, r) => s + (r.cash_collected || 0), 0) || 0;
        // Net Profit formula mirrors the P&L Report: sales revenue plus
        // game-machine income, less purchases and expenses. Margin uses total
        // income (revenue + games) as the denominator, same as the P&L.
        const totalIncome = totalRevenue + totalGameMachine;
        const netProfit = totalRevenue + totalGameMachine - totalPurch - totalExp;
        const margin = totalIncome > 0 ? (netProfit / totalIncome * 100) : 0;

        setStats({ totalGross, totalNet, totalNonTax, totalCash, totalCard, totalShortOver, totalTax, totalPurch, totalExp, totalGameMachine, totalIncome, cashInHand, netProfit, margin });

        if (storeData?.length && !storeId) {
          const perf = storeData.map(st => {
            const rev = (sales || []).filter(r => r.store_id === st.id).reduce((s, r) => s + (r.total_sales ?? r.net_sales ?? 0), 0);
            const cogs = (purch || []).filter(r => r.store_id === st.id).reduce((s, r) => s + (r.total_cost || r.unit_cost || 0), 0);
            const exp = (exps || []).filter(r => r.store_id === st.id).reduce((s, r) => s + (r.amount || 0), 0);
            const games = (gmRows || []).filter(r => r.store_id === st.id).reduce((s, r) => s + (r.amount || 0), 0);
            const so = (sales || []).filter(r => r.store_id === st.id).reduce((s, r) => s + (r.short_over || 0), 0);
            const income = rev + games;
            const profit = rev + games - cogs - exp;
            const mg = income > 0 ? (profit / income * 100) : 0;
            return { ...st, revenue: rev, games, buying: cogs, expenses: exp, profit, margin: mg, shortOver: so };
          }).sort((a, b) => b.revenue - a.revenue);
          setStorePerf(perf);
        } else {
          // When scoped to a specific store, the per-store ranking doesn't
          // make sense — clear it so the Store Performance card stays hidden.
          setStorePerf([]);
          setTopEmployees([]);
        }

        // Always bucket by Monday–Sunday weeks. Key = Monday of the week.
        const weekMap = {};
        const seed = new Date(startOfWeekMonday(range.start) + 'T12:00:00');
        const endAt = new Date(range.end + 'T12:00:00');
        while (seed <= endAt) {
          weekMap[startOfWeekMonday(seed)] = { sales: 0, purchases: 0 };
          seed.setDate(seed.getDate() + 7);
        }
        sales?.forEach(s => {
          const wk = startOfWeekMonday(s.date);
          if (!weekMap[wk]) weekMap[wk] = { sales: 0, purchases: 0 };
          weekMap[wk].sales += (s.total_sales ?? s.net_sales ?? 0);
        });
        purch?.forEach(p => {
          const wk = startOfWeekMonday(p.week_of);
          if (!weekMap[wk]) weekMap[wk] = { sales: 0, purchases: 0 };
          weekMap[wk].purchases += (p.total_cost || p.unit_cost || 0);
        });
        setTrends(Object.entries(weekMap)
          .map(([key, d]) => ({ week: key, ...d, diff: (d.sales || 0) - (d.purchases || 0), label: weekRangeLabel(key) }))
          .sort((a, b) => a.week.localeCompare(b.week)));

        const todayStr = today();
        // Same calendar day one week ago, for the live-bar vs-last-week delta.
        const lastWeekStr = (() => {
          const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() - 7);
          const y = d.getFullYear(); const mo = String(d.getMonth()+1).padStart(2,'0'); const da = String(d.getDate()).padStart(2,'0');
          return `${y}-${mo}-${da}`;
        })();
        let todayQ = supabase.from('daily_sales').select('store_id, total_sales, gross_sales').eq('date', todayStr);
        let lastWeekQ = supabase.from('daily_sales').select('total_sales, gross_sales').eq('date', lastWeekStr);
        if (storeId) { todayQ = todayQ.eq('store_id', storeId); lastWeekQ = lastWeekQ.eq('store_id', storeId); }
        const [{ data: todayRows }, { data: lastWeekRows }] = await Promise.all([todayQ, lastWeekQ]);
        setTodaySales(todayRows || []);
        setTodayLastWeek(lastWeekRows || []);

        // Top employees — only fetched in multi-store mode; cleared above
        // when a specific store is selected.
        let shiftQ = supabase
          .from('employee_shifts')
          .select('employee_name, store_id, daily_sales(total_sales, net_sales)')
          .gte('shift_date', range.start).lte('shift_date', range.end);
        if (storeId) shiftQ = shiftQ.eq('store_id', storeId);
        const { data: shifts } = storeId ? { data: [] } : await shiftQ;
        if (shifts?.length) {
          const empMap = {};
          shifts.forEach(s => {
            const sales = Number(s.daily_sales?.total_sales ?? s.daily_sales?.net_sales ?? 0);
            const k = `${s.employee_name}|${s.store_id}`;
            if (!empMap[k]) empMap[k] = { name: s.employee_name, storeId: s.store_id, sales: 0, shifts: 0 };
            empMap[k].sales += sales;
            empMap[k].shifts++;
          });
          const top = Object.values(empMap).sort((a, b) => b.sales - a.sales).slice(0, 3);
          setTopEmployees(top.map(e => ({ ...e, storeName: storeData?.find(s => s.id === e.storeId)?.name || '—' })));
        }
      } catch (e) {
        console.error('[dashboard] load failed:', e);
        setLoadError(e?.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [range.start, range.end, storeId, selectedStore]);

  const paymentMix = useMemo(() => {
    if (!stats || stats.totalGross <= 0) return null;
    const total = stats.totalCash + stats.totalCard;
    if (total <= 0) return null;
    return { cash: stats.totalCash, card: stats.totalCard, cashPct: (stats.totalCash / total * 100).toFixed(0), cardPct: (stats.totalCard / total * 100).toFixed(0) };
  }, [stats]);

  // Alerts — when scoped to a specific store, only show alerts for that store.
  const alerts = useMemo(() => {
    const a = [];
    storePerf.forEach(s => {
      if (s.margin < 40 && s.revenue > 100) a.push({ type: 'warning', text: `${s.name} margin only ${s.margin.toFixed(0)}%`, link: '/reports' });
      if (Math.abs(s.shortOver) > 50) {
        const short = s.shortOver > 0;
        a.push({
          type: short ? 'danger' : 'warning',
          text: `${s.name} short/over: ${short ? '−' : '+'}${fmt(Math.abs(s.shortOver))}`,
          link: '/cash',
        });
      }
    });
    const relevantStores = storeId ? stores.filter(st => st.id === storeId) : stores;
    const missingToday = relevantStores.filter(st => !todaySales.find(r => r.store_id === st.id));
    if (missingToday.length > 0) {
      a.push({
        type: 'info',
        text: storeId
          ? `${missingToday[0].name} has no entry for today yet`
          : `${missingToday.length} store${missingToday.length > 1 ? 's' : ''} missing today's entry`,
        link: '/sales',
      });
    }
    // Scoped mode: surface this store's own short/over if material.
    if (storeId && stats && Math.abs(stats.totalShortOver) > 50) {
      // Positive short_over = SHORT (missing cash → danger).
      // Negative = OVER (extra cash → warning — still worth a review).
      const short = stats.totalShortOver > 0;
      a.push({
        type: short ? 'danger' : 'warning',
        text: `Short/over: ${short ? '−' : '+'}${fmt(Math.abs(stats.totalShortOver))}`,
        link: '/cash',
      });
    }
    return a;
  }, [storePerf, stores, todaySales, storeId, stats]);

  const sortedStores = useMemo(() => {
    const s = [...storePerf];
    if (storeSort === 'revenue') s.sort((a, b) => b.revenue - a.revenue);
    else if (storeSort === 'profit') s.sort((a, b) => b.profit - a.profit);
    else if (storeSort === 'margin') s.sort((a, b) => b.margin - a.margin);
    else if (storeSort === 'name') s.sort((a, b) => a.name.localeCompare(b.name));
    return s;
  }, [storePerf, storeSort]);

  // Only block the whole page on the very first load. Subsequent refetches
  // (e.g. when the user is mid-way through picking a custom date range)
  // keep the existing UI mounted so the Custom dropdown doesn't disappear.
  if (loading && !stats) return <Loading />;

  // Daily-avg denominator = days between the range start and the last
  // synced date (not today), so partial/un-synced days don't dilute it.
  const avgEnd = lastSync?.date && lastSync.date < range.end ? lastSync.date : range.end;
  const rangeDays = Math.max(1, Math.round((new Date(avgEnd + 'T12:00:00') - new Date(range.start + 'T12:00:00')) / 86400000) + 1);
  const dailyAvg = stats ? (stats.totalNet || 0) / rangeDays : 0;

  // Today totals + vs-last-week delta for the live status bar.
  const totalToday = todaySales.reduce((s, r) => s + (r.total_sales ?? r.gross_sales ?? 0), 0);
  const totalLastWeek = todayLastWeek.reduce((s, r) => s + (r.total_sales ?? r.gross_sales ?? 0), 0);
  const todayDeltaPct = totalLastWeek > 0 ? ((totalToday - totalLastWeek) / totalLastWeek) * 100 : null;

  // Month progress for the hero progress bar — a stand-in for a real
  // target until we wire per-store monthly goals into settings.
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - daysPassed);
  const monthProgressPct = Math.round((daysPassed / daysInMonth) * 100);
  const projectedNet = stats && daysPassed > 0 ? (stats.netProfit / daysPassed) * daysInMonth : 0;
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  const relativeTime = (iso) => {
    if (!iso) return '';
    const then = new Date(iso);
    const sec = Math.max(1, Math.round((Date.now() - then.getTime()) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 48) return `${hr}h ago`;
    return `${Math.round(hr / 24)}d ago`;
  };

  const netProfitPeriodLabel = PRESET_LABELS[preset] || (() => {
    const f = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${f(range.start)} – ${f(range.end)}`;
  })();

  return (
    <div>
      {/* 1. Greeting + consolidated live status */}
      <DashboardHeader
        dateStr={dayStr()}
        greeting={greeting(profile?.name)}
        isOwner={isOwner}
        nrsStatus={nrsStatus}
        syncedAgo={lastSync ? relativeTime(lastSync.time) : ''}
        todayLabel={fmt(totalToday)}
        todayDeltaPct={todayDeltaPct}
      />

      {loadError && <V2Alert type="danger" className="mb-4">{loadError}</V2Alert>}

      {/* 2. Filters */}
      <DashboardFilters
        stores={stores}
        selectedStore={selectedStore}
        onStoreChange={setSelectedStore}
        preset={preset}
        onPreset={selectPreset}
        rangeStart={range.start}
        rangeEnd={range.end}
        onStartChange={setStart}
        onEndChange={setEnd}
      />

      {/* 3. Net Profit hero + KPI grid */}
      {stats && (
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
          <NetProfitHero
            netProfit={stats.netProfit}
            margin={stats.margin}
            projectedNet={projectedNet}
            monthProgressPct={monthProgressPct}
            daysLeft={daysLeft}
            monthName={monthName}
            periodLabel={netProfitPeriodLabel}
          />
          <KpiGrid stats={stats} />
        </div>
      )}

      {/* 4. Weekly chart (+ Payment Mix) + Store performance */}
      {sortedStores.length > 0 ? (
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
          <WeeklyChartCard trends={trends} rangeStart={range.start} rangeEnd={range.end} paymentMix={paymentMix} />
          <StorePerformanceCard stores={sortedStores} storeSort={storeSort} onSortChange={setStoreSort} />
        </div>
      ) : (
        <div className="mb-4">
          <WeeklyChartCard trends={trends} rangeStart={range.start} rangeEnd={range.end} paymentMix={paymentMix} />
        </div>
      )}

      {/* 5. Buying vs Sales pacing (month-to-date — independent of the filters above) */}
      <BuyingPacingCard className="mb-4" />

      {/* 6. Attention needed */}
      {alerts.length > 0 ? (
        <AttentionAlerts alerts={alerts} onAction={(link) => link && router.push(link)} />
      ) : stats && (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-center text-[12px] font-medium"
          style={{ background: 'rgba(57,255,20,0.08)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.25)' }}
        >
          ✅ All systems healthy
        </div>
      )}

      {/* 7. Quick Actions */}
      <QuickActionsRow onNavigate={(href) => router.push(href)} />
    </div>
  );
}
