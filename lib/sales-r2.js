// ═══════════════════════════════════════════════════════════
// Register 2 sales — the one place the rule is written in JS.
//
// Bells and Kerens run a second, cash-only till that the POS knows nothing
// about. Every R2 sale is rung into NRS and then CANCELLED, so the day's
// cancelled-basket total (the figure the Telegram register feed shows) is
// what R2 took:
//
//     R2 = canceled basket
//
// The safe drop holds the cash from both tills, so it reconciles against
// both:  short_over = R1 cash received + R2 cash − safe drop.
//
// Before November 2026 R2 was worked out from the drop instead
// (drop − R1 cash). That spent the whole drop on R2 sales, so these two
// stores could never show short — Bells on Nov 6 rang 127.77 on R2 but only
// 50.66 was booked, and the 77.11 that never reached the safe disappeared.
// The drop rule is now only the fallback for a day with no canceled-basket
// figure (nothing synced yet).
//
// `override` is the owner's correction for the odd day the basket figure is
// wrong. An empty override is NOT the same as zero — empty hands the day
// back to the rules above, while a typed 0 asserts the register took nothing.
//
// House accounts: a cashier rings an employee's credit as CASH, so the cash
// figures overstate what reached the drawer by that amount. The credit comes
// out of R1's POS cash first, max(POS cash − credit, 0); whatever R1's cash
// cannot cover was rung on R2 and comes out of R2's cash.
//
// The authoritative copy of this rule is the calc_sales_totals() trigger in
// supabase/migrations/with-r2-from-canceled-basket.sql. This module exists so
// the entry form can show the figure the database is going to store, and so
// the rule can be tested without a Postgres. If you change one, change both.
// ═══════════════════════════════════════════════════════════

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The day's house-account total. The per-employee array wins; the single
 * amount column and legacy `credits` cover older rows.
 */
export function houseAccountTotal(row) {
  const list = row?.house_accounts;
  if (Array.isArray(list) && list.length) {
    return Math.max(list.reduce((s, e) => s + toNum(e?.amount), 0), 0);
  }
  return Math.max(toNum(row?.r1_house_account_amount) || toNum(row?.credits), 0);
}

/** POS cash that actually reached the drawer: credit rung as cash removed. */
export function cashReceived(row) {
  return Math.max(toNum(row?.cash_sales) - houseAccountTotal(row), 0);
}

/** True when `value` is a real entry rather than a blank/absent one. */
export function hasOverride(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/** R2 sales worked out from the safe drop, tax included. Never negative. */
export function derivedR2(row) {
  return Math.max(toNum(row?.r1_safe_drop) - cashReceived(row), 0);
}

/** The day's canceled-basket total — what R2 rang. */
export function basketR2(row) {
  return Math.max(toNum(row?.r1_canceled_basket), 0);
}

/**
 * The R2 figure that will actually be stored for a day.
 *
 * @param {object} row       { r1_safe_drop, cash_sales, r1_canceled_basket, r2_override, r2_net }
 * @param {object} opts      { usesRegister2 }
 * @returns {{ amount: number, estimated: boolean, overridden: boolean, source: string }}
 *   source: 'override' (owner's figure), 'basket' (canceled basket), or
 *   'drop' (fallback, no basket figure). Only 'drop' is an estimate.
 */
export function effectiveR2(row, { usesRegister2 = false } = {}) {
  if (!usesRegister2) {
    const amount = hasOverride(row?.r2_override)
      ? toNum(row.r2_override)
      : toNum(row?.r2_net);
    return { amount, estimated: false, overridden: false, source: 'none' };
  }
  if (hasOverride(row?.r2_override)) {
    // Clamped: a negative R2 would eat into R1's real sales.
    return { amount: Math.max(toNum(row.r2_override), 0), estimated: false, overridden: true, source: 'override' };
  }
  const basket = basketR2(row);
  if (basket > 0) return { amount: basket, estimated: false, overridden: false, source: 'basket' };
  const amount = derivedR2(row);
  return { amount, estimated: amount > 0, overridden: false, source: 'drop' };
}

/**
 * The part of a day's house account that R1's POS cash cannot cover. At the
 * R2 stores (Kerens, Bells) R1 is often card-only and the credit is rung on
 * the cash-only Register 2 instead, so this is credit that sits inside the
 * R2 figure rather than inside R1's cash.
 */
export function houseOnR2(row) {
  return Math.max(houseAccountTotal(row) - Math.max(toNum(row?.cash_sales), 0), 0);
}

/**
 * Short/over the database will store for a day. Positive = SHORT.
 *   Single register: cash received − safe drop
 *   R2 stores:       cash received + R2 cash − safe drop
 * where R2 cash is the R2 figure less any credit rung on R2. A drop-derived
 * R2 already comes from the drop, so it never contains the credit (and its
 * short is zero by construction).
 */
export function shortOver(row, { usesRegister2 = false } = {}) {
  const drop = toNum(row?.r1_safe_drop);
  if (!usesRegister2) return cashReceived(row) - drop;
  const r2 = effectiveR2(row, { usesRegister2 });
  const r2Cash = r2.source === 'drop' ? r2.amount : Math.max(r2.amount - houseOnR2(row), 0);
  return cashReceived(row) + r2Cash - drop;
}
