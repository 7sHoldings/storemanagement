// Month-to-date "buying vs sales" pacing. Shared by the UI card and the
// Wednesday Telegram cron so they always agree.
//
//   sales  = net sales        — total_sales ?? net_sales
//   buying = product purchases — total_cost  ?? unit_cost
//   target = per store's `buying_target_pct` (default 50%)
//   projection = linear extrapolation by elapsed days of the month

export const DEFAULT_TARGET_PCT = 50;

const EPS = 0.005;

export function computeBuyingPacing({ stores, salesRows, purchaseRows, today }) {
  const d = new Date(`${today}T12:00:00`);
  const year = d.getFullYear();
  const month0 = d.getMonth(); // 0-based
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const daysElapsed = Math.max(1, Math.min(d.getDate(), daysInMonth));
  const monthName = d.toLocaleDateString('en-US', { month: 'long' });
  const project = (v) => (v / daysElapsed) * daysInMonth;

  const salesOf = (sid) => (salesRows || [])
    .filter(r => r.store_id === sid)
    .reduce((s, r) => s + Number(r.total_sales ?? r.net_sales ?? 0), 0);
  const buyOf = (sid) => (purchaseRows || [])
    .filter(r => r.store_id === sid)
    .reduce((s, r) => s + Number(r.total_cost ?? r.unit_cost ?? 0), 0);

  const line = (mtdSales, mtdBuying, targetPct) => {
    const targetBuying = mtdSales * targetPct / 100;
    const projSales = project(mtdSales);
    const projBuying = project(mtdBuying);
    return {
      mtdSales,
      mtdBuying,
      pct: mtdSales > 0 ? (mtdBuying / mtdSales) * 100 : null,
      targetPct,
      overBudget: mtdSales > 0 && mtdBuying > targetBuying + EPS,
      headroom: targetBuying - mtdBuying, // $ of buying left this month at current sales; negative = over
      projSales,
      projBuying,
      projPct: projSales > 0 ? (projBuying / projSales) * 100 : null,
      projOverBudget: projSales > 0 && projBuying > projSales * targetPct / 100 + EPS,
    };
  };

  const perStore = (stores || []).map(st => {
    const targetPct = Number.isFinite(Number(st.buying_target_pct)) ? Number(st.buying_target_pct) : DEFAULT_TARGET_PCT;
    return { id: st.id, name: st.name, color: st.color, ...line(salesOf(st.id), buyOf(st.id), targetPct) };
  }).sort((a, b) => b.mtdSales - a.mtdSales);

  const mtdSales = perStore.reduce((s, x) => s + x.mtdSales, 0);
  const mtdBuying = perStore.reduce((s, x) => s + x.mtdBuying, 0);
  // Company target = sales-weighted average of per-store targets.
  const weightedTargetPct = mtdSales > 0
    ? perStore.reduce((s, x) => s + x.mtdSales * x.targetPct, 0) / mtdSales
    : DEFAULT_TARGET_PCT;

  return {
    asOf: today,
    monthName,
    daysElapsed,
    daysInMonth,
    overall: line(mtdSales, mtdBuying, weightedTargetPct),
    perStore,
  };
}
