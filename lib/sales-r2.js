// ═══════════════════════════════════════════════════════════
// Register 2 sales — the one place the rule is written in JS.
//
// Bells and Kerens run a second, cash-only till that the POS knows nothing
// about, so its sales have to be inferred: whatever went into the safe
// above the cash R1 itself rang must have come from R2.
//
//     R2 = max(safe drop − R1 cash sales, 0)
//
// The clamp matters. A drop that comes in under R1's own cash is missing
// cash, not a negative sale, so it must not be allowed to reduce the day's
// revenue — it surfaces as short instead.
//
// This is inferred, not measured, and some days it is simply wrong: a drop
// counted after midnight, cash in the safe that was never a sale, a
// miscount. `override` is the owner's correction for those days. An empty
// override is NOT the same as zero — empty hands the day back to the rule
// above, while a typed 0 asserts the register genuinely took nothing.
//
// House accounts: a cashier rings an employee's credit as CASH in NRS, so
// POS cash overstates what reached the drawer by that amount. Every rule
// here works from the cash actually received, max(POS cash − credit, 0),
// so a credit is never mistaken for a short or for missing R2 sales.
//
// The authoritative copy of this rule is the calc_sales_totals() trigger in
// supabase/migrations/with-house-account-r2-cash.sql. This module exists so the
// entry form can show the figure the database is going to store, and so the
// rule can be tested without a Postgres. If you change one, change both.
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

/**
 * The R2 figure that will actually be stored for a day.
 *
 * @param {object} row       { r1_safe_drop, cash_sales, r2_override, r2_net }
 * @param {object} opts      { usesRegister2 }
 * @returns {{ amount: number, estimated: boolean, overridden: boolean }}
 *   `estimated` is false for an overridden day: someone stands behind that
 *   number. It is also false when there is nothing to estimate (a zero R2).
 */
export function effectiveR2(row, { usesRegister2 = false } = {}) {
  if (!usesRegister2) {
    const amount = hasOverride(row?.r2_override)
      ? toNum(row.r2_override)
      : toNum(row?.r2_net);
    return { amount, estimated: false, overridden: false };
  }
  if (hasOverride(row?.r2_override)) {
    // Clamped for the same reason the derivation is: a negative R2 would
    // eat into R1's real sales.
    return { amount: Math.max(toNum(row.r2_override), 0), estimated: false, overridden: true };
  }
  const amount = derivedR2(row);
  return { amount, estimated: amount > 0, overridden: false };
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
 * where R2 cash is the R2 figure less any credit rung on R2. A derived R2
 * already comes from the drop, so it never contains the credit; only an
 * owner's override (the register's full takings) needs it taken back out.
 */
export function shortOver(row, { usesRegister2 = false } = {}) {
  const drop = toNum(row?.r1_safe_drop);
  if (!usesRegister2) return cashReceived(row) - drop;
  const r2 = effectiveR2(row, { usesRegister2 });
  const r2Cash = r2.overridden ? Math.max(r2.amount - houseOnR2(row), 0) : r2.amount;
  return cashReceived(row) + r2Cash - drop;
}
