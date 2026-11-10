// "Buying vs sales" pacing for a period. Shared by the UI card and the
// Wednesday Telegram cron so they always agree.
//
//   sales  = net sales        — total_sales ?? net_sales
//   buying = product purchases — total_cost  ?? unit_cost
//   target = per store's `buying_target_pct` (default 50%)
//   projection = linear extrapolation by elapsed days of the period
//
// The period defaults to the calendar month containing `today` (the cron's
// month-to-date report). Pages pass the date range the user picked, so
// choosing "Last Month" shows last month — a finished period has nothing
// left to project, so its projection is simply its actual figures.

export const DEFAULT_TARGET_PCT = 50;

const EPS = 0.005;
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS) + 1; // inclusive

function periodLabel(start, end) {
  const s = new Date(toUTC(start));
  const e = new Date(toUTC(end));
  const month = (d) => d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const short = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${month(s)} ${s.getUTCDate()}–${e.getUTCDate()}`;
  }
  return `${short(s)} – ${short(e)}`;
}

export function computeBuyingPacing({ stores, salesRows, purchaseRows, today, start, end }) {
  const d = new Date(`${today}T12:00:00`);
  const year = d.getFullYear();
  const month0 = d.getMonth(); // 0-based
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const periodStart = start || `${year}-${pad(month0 + 1)}-01`;
  const periodEnd = end || `${year}-${pad(month0 + 1)}-${pad(daysInMonth)}`;

  const daysInPeriod = Math.max(1, daysBetween(periodStart, periodEnd));
  // Days of the period that have actually happened so far.
  const lastSeen = today < periodEnd ? today : periodEnd;
  const daysElapsed = Math.max(1, Math.min(daysBetween(periodStart, lastSeen), daysInPeriod));
  const inProgress = today < periodEnd && today >= periodStart;
  const monthName = new Date(toUTC(periodStart)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  // Label covers what the figures cover: an unfinished period stops at today.
  const label = periodLabel(periodStart, inProgress ? today : periodEnd);
  const project = (v) => (inProgress ? (v / daysElapsed) * daysInPeriod : v);

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
    const projTargetBuying = projSales * targetPct / 100;
    return {
      mtdSales,
      mtdBuying,
      pct: mtdSales > 0 ? (mtdBuying / mtdSales) * 100 : null,
      targetPct,
      targetBuying,                       // $ of buying allowed this period at current sales
      overBudget: mtdSales > 0 && mtdBuying > targetBuying + EPS,
      headroom: targetBuying - mtdBuying,  // $ left to spend at target; negative = over
      projSales,
      projBuying,
      projTargetBuying,
      projPct: projSales > 0 ? (projBuying / projSales) * 100 : null,
      projOverBudget: projSales > 0 && projBuying > projTargetBuying + EPS,
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
    start: periodStart,
    end: periodEnd,
    label,
    inProgress,
    monthName,
    daysElapsed,
    daysInPeriod,
    // Kept for the month-to-date callers (cron report): the period's length.
    daysInMonth: daysInPeriod,
    overall: line(mtdSales, mtdBuying, weightedTargetPct),
    perStore,
  };
}
