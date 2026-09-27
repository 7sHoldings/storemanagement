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
// Cash is a BALANCE that carries forward, not a figure that belongs to a
// month. Money collected in August is still sitting there in September,
// and taking $500 out in September does not mean September's trading
// produced it.
//
// So a period shows movement against a balance brought forward:
//
//     OPENING BALANCE    everything collected before this period,
//                        less everything taken out or spent before it
//   + COLLECTED          picked up from the safe during the period
//   − TAKEN OUT          withdrawn during the period
//   − PAID IN CASH       expenses settled in cash during the period
//   = IN HAND            what should be there at the end
//
// Treating each period as a closed box was wrong: a September withdrawal
// of August's money made September look like it had lost cash it never
// held. With a balance carried forward, the withdrawal simply reduces the
// running total and September's own collections are untouched.
//
// Separately, and only about the period itself, is what the stores took:
// cash rung up versus cash put in the safe. That gap is missing cash, and
// it is kept apart from the balance so it cannot hide inside it.

/**
 * Cash collected, less what has left, for every record on or before `upTo`.
 * This is the balance brought into a period.
 *
 * @param collections  cash_collections rows dated on or before `upTo`
 * @param takeouts     profit_takeouts rows dated on or before `upTo`
 * @param cashExpenses expenses paid from cash, dated on or before `upTo`
 */
export function runningCashBalance({ collections = [], takeouts = [], cashExpenses = [] } = {}) {
  const sum = (rows, pick) => (rows || []).reduce((t, r) => t + num(pick(r)), 0);
  return round2(
    sum(collections, r => r.cash_collected)
    - sum(takeouts, r => r.cash_amount)
    - sum(cashExpenses, r => r.amount)
  );
}

/**
 * @param sales        daily_sales rows in the period
 * @param collections  cash_collections rows in the period
 * @param takeouts     profit_takeouts rows in the period (cross-store: the
 *                     table has no store_id, so these belong to the group)
 * @param cashExpenses expenses paid from cash, dated in the period
 * @param opening      balance carried in, from runningCashBalance on
 *                     everything dated before the period
 */
export function cashSummary({
  sales = [], collections = [], takeouts = [], cashExpenses = [], opening = 0,
} = {}) {
  const sum = (rows, pick) => round2((rows || []).reduce((t, r) => t + num(pick(r)), 0));

  // R2 is a cash-only till, so its takings are cash alongside R1's drawer.
  const salesCash = round2((sales || []).reduce(
    (t, r) => t + num(r.cash_sales) + num(r.r2_net), 0));
  const safeDrop = sum(sales, r => num(r.r1_safe_drop) + num(r.r2_safe_drop));
  const collected = sum(collections, r => r.cash_collected);
  const takenOut = sum(takeouts, r => r.cash_amount);
  const paidInCash = sum(cashExpenses, r => r.amount);
  const openingBalance = round2(opening);

  return {
    // This period's trading
    salesCash,
    safeDrop,
    // Rung up but not in the safe. Positive means cash is unaccounted for;
    // negative means a drop covered more than this period.
    notDropped: round2(salesCash - safeDrop),
    awaitingPickup: round2(safeDrop - collected),

    // The running balance
    openingBalance,
    collected,
    takenOut,
    paidInCash,
    inHand: round2(openingBalance + collected - takenOut - paidInCash),
    // Movement in the period alone, which is what changed the balance.
    netChange: round2(collected - takenOut - paidInCash),
  };
}
