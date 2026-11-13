// Pure helpers for the Dashboard: the comparison period and the daily series
// the chart draws. Kept here so the date maths can be tested without React.

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromISO = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const daysInMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Inclusive number of days from start to end. */
export function dayCount(start, end) {
  return Math.round((fromISO(end) - fromISO(start)) / 86400000) + 1;
}

/** Every ISO date from start to end, inclusive. */
export function eachDay(start, end) {
  const out = [];
  const d = fromISO(start);
  const last = fromISO(end);
  while (d <= last) { out.push(toISO(d)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Shift a date back one calendar month, clamping the day (Mar 31 → Feb 28). */
export function minusOneMonth(iso) {
  const d = fromISO(iso);
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m0 = (d.getUTCMonth() + 11) % 12;
  return toISO(new Date(Date.UTC(y, m0, Math.min(d.getUTCDate(), daysInMonth(y, m0)))));
}

/**
 * The period a range is compared with.
 *  - A range starting on the 1st (month to date, last month): the same days
 *    of the month before — Nov 1–11 is compared with Oct 1–11.
 *  - Anything else: the same number of days immediately before it.
 */
export function previousRange(start, end) {
  if (fromISO(start).getUTCDate() === 1) {
    return { start: minusOneMonth(start), end: minusOneMonth(end) };
  }
  const n = dayCount(start, end);
  const s = fromISO(start); s.setUTCDate(s.getUTCDate() - n);
  const e = fromISO(start); e.setUTCDate(e.getUTCDate() - 1);
  return { start: toISO(s), end: toISO(e) };
}

/** Net sales per day for [start, end], zero-filled. */
export function dailySeries(rows, start, end) {
  const byDay = {};
  (rows || []).forEach((r) => {
    byDay[r.date] = (byDay[r.date] || 0) + Number(r.total_sales ?? r.net_sales ?? 0);
  });
  return eachDay(start, end).map((date) => ({ date, value: Math.round((byDay[date] || 0) * 100) / 100 }));
}

/** Percent change, or null when there is nothing to compare with. */
export function pctChange(now, before) {
  return before > 0 ? ((now - before) / before) * 100 : null;
}
