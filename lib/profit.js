// ═══════════════════════════════════════════════════════════
// The money chain, in the order the owner thinks about it:
//
//     GROSS SALES        what customers handed over, tax included
//   − SALES TAX          the state's share, never revenue
//   ─────────────────
//   = TOTAL SALES        what the business earned
//   − PRODUCT BUYING     stock bought in
//   − EXPENSES           rent, wages, utilities, everything else
//   ─────────────────
//   = PROFIT
//
// Every figure is derived from stored rows on each load rather than cached,
// so correcting a day by hand — a sale, a purchase, an expense — is
// reflected the next time the page is read.
//
// The chain closes exactly: daily_sales.gross_sales − tax_collected equals
// daily_sales.total_sales for every row, because the totals trigger builds
// both from the same inputs. checkSalesIdentity below asserts that rather
// than trusting it, since a divergence would mean the two halves of the
// page disagree and the owner would have no way to tell which to believe.
// ═══════════════════════════════════════════════════════════

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// ── Dates ──────────────────────────────────────────────────
// All date handling is on 'YYYY-MM-DD' strings. Constructing a Date and
// reading getMonth() would shift the day in any timezone behind UTC, which
// silently moves a purchase into the wrong period.

/** Days in the month of a 'YYYY-MM' key. */
export function daysInMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return 0;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const toUTC = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
};

/**
 * How many days of the month `ym` fall inside [start, end], inclusive.
 * This is what lets a monthly expense be charged fairly to a shorter view:
 * a week of September should carry a week of September's rent, not all of it.
 */
export function monthOverlapDays(ym, start, end) {
  const total = daysInMonth(ym);
  if (!total) return 0;
  const monthStart = toUTC(`${ym}-01`);
  const monthEnd = toUTC(`${ym}-${String(total).padStart(2, '0')}`);
  const rangeStart = toUTC(start);
  const rangeEnd = toUTC(end);
  if (monthStart == null || rangeStart == null || rangeEnd == null) return 0;
  if (rangeEnd < rangeStart) return 0;

  const from = Math.max(monthStart, rangeStart);
  const to = Math.min(monthEnd, rangeEnd);
  if (to < from) return 0;
  return Math.round((to - from) / 86400000) + 1;
}

/**
 * Expenses are recorded as one figure per month, so a view shorter than a
 * month gets that month's share of them. Without this a single day subtracts
 * a whole month of rent and reports a catastrophic loss.
 */
export function proratedExpenses(rows, start, end) {
  let total = 0;
  for (const row of rows || []) {
    const days = daysInMonth(row?.month);
    if (!days) continue;
    const overlap = monthOverlapDays(row.month, start, end);
    if (!overlap) continue;
    total += num(row.amount) * (overlap / days);
  }
  return round2(total);
}

/** True when the range covers every day of every month it touches. */
export function coversWholeMonths(rows, start, end) {
  for (const row of rows || []) {
    const days = daysInMonth(row?.month);
    if (!days) continue;
    const overlap = monthOverlapDays(row.month, start, end);
    if (overlap > 0 && overlap < days) return false;
  }
  return true;
}

// ── The chain ──────────────────────────────────────────────

/**
 * Gross − tax must equal total sales for every sales row. Returns the rows
 * where it does not, so the page can say so rather than quietly showing a
 * chain that does not add up.
 */
export function checkSalesIdentity(sales) {
  const off = [];
  for (const r of sales || []) {
    const expected = round2(num(r.gross_sales) - num(r.tax_collected));
    const actual = round2(num(r.total_sales));
    // A cent of rounding is not a discrepancy worth reporting.
    if (Math.abs(expected - actual) > 0.011) {
      off.push({ date: r.date, store_id: r.store_id, expected, actual });
    }
  }
  return off;
}

/**
 * @param sales      daily_sales rows in range
 * @param purchases  purchases rows in range (week_of is the purchase date)
 * @param expenses   expenses rows for every month the range touches
 * @param collections cash_collections rows in range
 * @param games      game_machine_collections rows in range
 */
export function profitSummary({
  sales = [], purchases = [], expenses = [], collections = [], games = [],
  start, end,
} = {}) {
  const sum = (rows, pick) => round2((rows || []).reduce((t, r) => t + num(pick(r)), 0));

  const grossSales = sum(sales, r => r.gross_sales);
  const tax = sum(sales, r => r.tax_collected);
  const totalSales = sum(sales, r => r.total_sales);
  const productBuying = sum(purchases, r => r.total_cost || r.unit_cost);
  const expensesTotal = proratedExpenses(expenses, start, end);
  const otherIncome = sum(games, r => r.amount);

  // Sales less what it cost to buy the stock and run the stores. Game-machine
  // money is income the stores earned but did not sell, so it is added here
  // rather than folded into sales, where it would distort every sales figure.
  const profit = round2(totalSales + otherIncome - productBuying - expensesTotal);
  const income = round2(totalSales + otherIncome);

  // R2 is a cash-only till, so its takings are cash alongside R1's drawer.
  const cashSales = round2((sales || []).reduce(
    (t, r) => t + num(r.cash_sales) + num(r.r2_net), 0));
  const cardSales = sum(sales, r => num(r.card_sales) + num(r.register2_card));
  const safeDrop = sum(sales, r => num(r.r1_safe_drop) + num(r.r2_safe_drop));

  return {
    grossSales,
    tax,
    totalSales,
    productBuying,
    expenses: expensesTotal,
    otherIncome,
    profit,
    margin: income > 0 ? round2((profit / income) * 100) : 0,
    cash: {
      sales: cashSales,
      card: cardSales,
      safeDrop,
      collected: sum(collections, r => r.cash_collected),
      shortOver: sum(sales, r => r.short_over),
    },
    expensesProrated: !coversWholeMonths(expenses, start, end),
    discrepancies: checkSalesIdentity(sales),
    days: new Set((sales || []).map(r => r.date)).size,
  };
}

// ── Cash ───────────────────────────────────────────────────
//
// Cash sits in two places, and each is a running balance that carries
// forward. Treating either as a per-month figure is wrong: money dropped
// in August is still in the safe in September, and money collected in
// August is still in hand in September.
//
//   THE SAFES, at the stores
//     brought forward + put in − collected by the owner = in the safes
//
//   YOUR HAND, once collected
//     brought forward + collected + game cash − taken out − paid in cash
//       = in hand
//
// Collections move money from the first pile to the second, which is why
// the same figure appears in both, with opposite signs.
//
// Separately, and about the period alone, is whether the cash the
// registers rang actually reached a safe. That is an integrity check, not
// a balance, and it is kept apart so a shortfall cannot hide inside a
// running total.

const sumBy = (rows, pick) => (rows || []).reduce((t, r) => t + num(pick(r)), 0);

const dropOf = (r) => num(r.r1_safe_drop) + num(r.r2_safe_drop);

/**
 * Balance of the stores' safes: everything ever dropped, less everything
 * ever collected from them.
 */
export function safeBalance({ sales = [], collections = [] } = {}) {
  return round2(sumBy(sales, dropOf) - sumBy(collections, r => r.cash_collected));
}

/**
 * Balance in the owner's hand: everything collected and earned in cash,
 * less everything taken out or spent from it.
 */
export function handBalance({
  collections = [], games = [], takeouts = [], cashExpenses = [],
} = {}) {
  return round2(
    sumBy(collections, r => r.cash_collected)
    + sumBy(games, r => r.amount)
    - sumBy(takeouts, r => r.cash_amount)
    - sumBy(cashExpenses, r => r.amount)
  );
}

/**
 * @param opening  { safe, hand } balances brought into the period, from
 *                 safeBalance/handBalance over everything dated before it
 */
export function cashSummary({
  sales = [], collections = [], takeouts = [], cashExpenses = [], games = [],
  opening = { safe: 0, hand: 0 },
} = {}) {
  const openSafe = round2(num(opening?.safe));
  const openHand = round2(num(opening?.hand));

  // Register 2 is a cash-only till, so its takings are cash too.
  const salesCash = round2(sumBy(sales, r => num(r.cash_sales) + num(r.r2_net)));
  const putInSafe = round2(sumBy(sales, dropOf));
  const collected = round2(sumBy(collections, r => r.cash_collected));
  // Game machines pay out in cash, but nothing left the shelves for it, so
  // it is counted beside sales cash and never inside it.
  const gameCash = round2(sumBy(games, r => r.amount));
  const takenOut = round2(sumBy(takeouts, r => r.cash_amount));
  const paidInCash = round2(sumBy(cashExpenses, r => r.amount));

  const safeChange = round2(putInSafe - collected);
  const handChange = round2(collected + gameCash - takenOut - paidInCash);

  return {
    // ── Pile 1: the stores' safes
    safe: {
      opening: openSafe,
      putIn: putInSafe,
      collected,
      change: safeChange,
      closing: round2(openSafe + safeChange),
    },
    // ── Pile 2: the owner's hand
    hand: {
      opening: openHand,
      collected,
      gameCash,
      takenOut,
      paidInCash,
      change: handChange,
      closing: round2(openHand + handChange),
    },
    // ── This period on its own, mixed with nothing
    //
    // "Came in" is what actually landed: cash that reached a safe, plus
    // game money. Cash the tills rang but nobody dropped is NOT in here —
    // it is not held anywhere, and counting it would make the total claim
    // money that cannot be found. It is reported separately as missing.
    period: {
      cameIn: round2(putInSafe + gameCash),
      wentOut: round2(takenOut + paidInCash),
      left: round2(putInSafe + gameCash - takenOut - paidInCash),
    },

    // ── Brought in from everything before this period
    broughtForward: round2(openSafe + openHand),

    // ── Everything held, wherever it sits
    totalHeld: round2(openSafe + safeChange + openHand + handChange),

    // ── Check, about this period only
    salesCash,
    gameCash,
    totalCashTaken: round2(salesCash + gameCash),
    putInSafe,
    // Positive means cash the registers rang never reached a safe.
    notDropped: round2(salesCash - putInSafe),
  };
}

/**
 * Cash movement for each month in `months`, so a year can be read at a
 * glance instead of one range at a time.
 *
 * "Came in" is cash that reached a safe plus game money — not what the tills
 * rang, for the same reason as everywhere else: cash nobody dropped is not
 * anywhere, and counting it would make a month claim money it cannot find.
 *
 * Takeouts are bucketed by for_month when it is set, since a withdrawal
 * belongs to the month whose cash it came out of rather than the day it was
 * recorded. Everything else buckets by its own date.
 *
 * @param months  [{ key: 'YYYY-MM', label }]
 */
export function monthlyCashRows({
  months = [], drops = [], games = [], takeouts = [], cashExpenses = [],
} = {}) {
  const bucket = new Map(months.map(m => [m.key, { ...m, cameIn: 0, wentOut: 0, net: 0 }]));
  const add = (key, field, amount) => {
    const row = bucket.get(key);
    if (row) row[field] += num(amount);
  };
  const monthOf = (d) => String(d ?? '').slice(0, 7);

  for (const r of drops || []) add(monthOf(r.date), 'cameIn', dropOf(r));
  for (const r of games || []) add(monthOf(r.date), 'cameIn', r.amount);
  // for_month is the attribution; fall back to the record date for rows
  // written before the column existed.
  for (const r of takeouts || []) add(r.for_month || monthOf(r.date), 'wentOut', r.cash_amount);
  for (const r of cashExpenses || []) add(monthOf(r.expense_date), 'wentOut', r.amount);

  return months.map(m => {
    const row = bucket.get(m.key);
    const cameIn = round2(row.cameIn);
    const wentOut = round2(row.wentOut);
    return { key: m.key, label: m.label, cameIn, wentOut, net: round2(cameIn - wentOut) };
  });
}
