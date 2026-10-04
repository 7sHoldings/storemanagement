// ═══════════════════════════════════════════════════════════
// House account ledger — what each employee owes the store.
//
// A house account is goods an employee took on credit. The cashier rings it
// as cash in NRS, the database takes it back out of cash before reconciling
// the drop (so it is never a short), and the amount stays owed until it is
// deducted from a paycheck or paid back in cash.
//
//   charges    — daily_sales.house_accounts entries (one per credit taken)
//   deductions — house_account_deductions rows (payroll or cash repayments)
//   balance    — all charges − all deductions, per employee
//
// Pure functions so the arithmetic can be tested without a database.
// ═══════════════════════════════════════════════════════════

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const norm = (s) => String(s || '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Flatten daily_sales rows into one charge per employee credit.
 * Rows saved before the per-employee array existed fall back to the single
 * name/amount columns.
 */
export function chargesFromSales(salesRows) {
  const out = [];
  (salesRows || []).forEach(r => {
    const list = Array.isArray(r.house_accounts) ? r.house_accounts : [];
    const receipts = Array.isArray(r.credit_receipt_urls) ? r.credit_receipt_urls : [];
    if (list.length) {
      list.forEach(e => {
        const amount = toNum(e?.amount);
        if (amount <= 0) return;
        out.push({
          sales_id: r.id, date: r.date, store_id: r.store_id,
          employee_id: e?.employee_id || null,
          name: String(e?.name || '').trim() || 'Unnamed',
          amount, receipts,
        });
      });
      return;
    }
    const amount = toNum(r.r1_house_account_amount) || toNum(r.credits);
    if (amount <= 0) return;
    out.push({
      sales_id: r.id, date: r.date, store_id: r.store_id,
      employee_id: null,
      name: String(r.r1_house_account_name || '').trim() || 'Unnamed',
      amount, receipts,
    });
  });
  return out;
}

/**
 * Who an entry belongs to. A profile id wins; a bare name is matched to a
 * profile at the same store (by name or NRS alias) so old name-only entries
 * land on the same person as new ones. Anyone left over is keyed by store
 * + name ("Other…" entries, ex-employees).
 */
export function resolveEmployee(entry, profiles) {
  const byId = entry.employee_id && (profiles || []).find(p => p.id === entry.employee_id);
  if (byId) return { key: `id:${byId.id}`, employee_id: byId.id, name: byId.name || byId.username || entry.name, store_id: byId.store_id || entry.store_id };
  const n = norm(entry.name || entry.employee_name);
  const byName = n && (profiles || []).find(p =>
    p.store_id === entry.store_id && (norm(p.name) === n || norm(p.username) === n || norm(p.nrs_employee_name) === n));
  if (byName) return { key: `id:${byName.id}`, employee_id: byName.id, name: byName.name || byName.username, store_id: byName.store_id || entry.store_id };
  return {
    key: `name:${entry.store_id || ''}:${n}`,
    employee_id: entry.employee_id || null,
    name: String(entry.name || entry.employee_name || '').trim() || 'Unnamed',
    store_id: entry.store_id || null,
  };
}

/**
 * Per-employee ledger.
 * @param {object} p
 * @param {Array} p.charges     from chargesFromSales (all time)
 * @param {Array} p.deductions  house_account_deductions rows (all time)
 * @param {Array} p.profiles    profiles (id, name, username, nrs_employee_name, store_id)
 * @param {{start: string, end: string}} [p.range]  period for the in-range columns
 * @returns {Array} sorted by open balance, largest first
 */
export function buildLedger({ charges, deductions, profiles, range }) {
  const inRange = (d) => !range || (d >= range.start && d <= range.end);
  const map = new Map();
  const bucket = (who) => {
    if (!map.has(who.key)) {
      map.set(who.key, {
        key: who.key, employee_id: who.employee_id, name: who.name, store_id: who.store_id,
        charges: [], deductions: [],
        chargedAll: 0, deductedAll: 0, chargedRange: 0, deductedRange: 0,
      });
    }
    return map.get(who.key);
  };
  (charges || []).forEach(c => {
    const b = bucket(resolveEmployee(c, profiles));
    b.charges.push(c);
    b.chargedAll += c.amount;
    if (inRange(c.date)) b.chargedRange += c.amount;
  });
  (deductions || []).forEach(d => {
    const b = bucket(resolveEmployee({ ...d, name: d.employee_name }, profiles));
    const amount = toNum(d.amount);
    b.deductions.push(d);
    b.deductedAll += amount;
    if (inRange(d.date)) b.deductedRange += amount;
  });
  return [...map.values()].map(b => ({
    ...b,
    chargedAll: round2(b.chargedAll),
    deductedAll: round2(b.deductedAll),
    chargedRange: round2(b.chargedRange),
    deductedRange: round2(b.deductedRange),
    balance: round2(b.chargedAll - b.deductedAll),
    charges: b.charges.sort((x, y) => (y.date || '').localeCompare(x.date || '')),
    deductions: b.deductions.sort((x, y) => (y.date || '').localeCompare(x.date || '')),
  })).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}
