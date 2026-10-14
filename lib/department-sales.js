// ═══════════════════════════════════════════════════════════
// Sales by department, from individual register lines.
//
// Used to decide which departments earn a button on each register: the
// ones a store actually sells from. Every NRS sale line carries its
// department, so adding lines up per department gives the picture
// straight from the till, per store.
//
// Refund lines are left out of sales and counted separately, so a busy
// refund day doesn't pull a department down. Pure functions.
// ═══════════════════════════════════════════════════════════

/** YYYY-MM-DD ranges of at most `chunkDays`, covering [from, to] inclusive. */
export function dateChunks(from, to, chunkDays = 3) {
  const out = [];
  const day = (s) => new Date(`${s}T12:00:00Z`);
  const fmt = (d) => d.toISOString().slice(0, 10);
  let start = day(from);
  const end = day(to);
  while (start <= end) {
    const stop = new Date(start);
    stop.setUTCDate(stop.getUTCDate() + chunkDays - 1);
    out.push([fmt(start), fmt(stop > end ? end : stop)]);
    start = new Date(stop);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return out;
}

/** The last `days` days ending yesterday, as [from, to], given today's date. */
export function lastNDays(today, days) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

/**
 * @param {Array<{dept, qty, amount_cents, refund}>} lines
 * @returns {Array<{dept, sales_cents, qty, lines, refund_cents, share, cumulative}>}
 *   busiest first; `share` and `cumulative` are fractions of all sales.
 */
export function aggregateDepartmentSales(lines) {
  const map = new Map();
  (lines || []).forEach(l => {
    const dept = String(l?.dept ?? '').trim() || '(no department)';
    if (!map.has(dept)) map.set(dept, { dept, sales_cents: 0, qty: 0, lines: 0, refund_cents: 0 });
    const r = map.get(dept);
    const cents = Number(l?.amount_cents) || 0;
    if (l?.refund) { r.refund_cents += Math.abs(cents); return; }
    r.sales_cents += cents;
    r.qty += Number(l?.qty) || 0;
    r.lines += 1;
  });
  const rows = [...map.values()].sort((a, b) => b.sales_cents - a.sales_cents || a.dept.localeCompare(b.dept));
  const total = rows.reduce((s, r) => s + Math.max(r.sales_cents, 0), 0);
  let running = 0;
  return rows.map(r => {
    running += Math.max(r.sales_cents, 0);
    return { ...r, share: total ? Math.max(r.sales_cents, 0) / total : 0, cumulative: total ? running / total : 0 };
  });
}
