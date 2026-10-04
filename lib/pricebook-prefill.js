// ═══════════════════════════════════════════════════════════
// Add-item price prefill.
//
// When a UPC is added, every store is checked for it first:
//   has     — the store already carries it; shown with its price, never
//             added again
//   missing — the store lacks it; its price box is pre-filled with the
//             price most stores already charge, so all stores line up
//   unknown — the store could not be checked (NRS error); left for the
//             owner to decide, pre-filled like a missing store
// A UPC no store carries gets no prefill — every price box starts at 0.
// ═══════════════════════════════════════════════════════════

/** True when an NRS item lookup failed because the item is not there. */
export function isNotFoundError(err) {
  return /not found in pricebook/i.test(String(err?.message || err || ''));
}

/**
 * The price most stores carrying the item charge, in cents. A tie goes to
 * the price seen first in store order. Null when no store has a price.
 * @param {Array<{status: string, cents: number|null}>} storeResults
 */
export function suggestedCents(storeResults) {
  const counts = new Map();
  (storeResults || []).forEach(r => {
    if (r?.status !== 'has' || !Number.isFinite(r.cents)) return;
    counts.set(r.cents, (counts.get(r.cents) || 0) + 1);
  });
  let best = null;
  let bestCount = 0;
  for (const [cents, n] of counts) {
    if (n > bestCount) { best = cents; bestCount = n; }
  }
  return best;
}

/** The distinct prices stores already charge, most common first. */
export function existingPrices(storeResults) {
  const map = new Map();
  (storeResults || []).forEach(r => {
    if (r?.status !== 'has' || !Number.isFinite(r.cents)) return;
    const e = map.get(r.cents) || { cents: r.cents, stores: [] };
    e.stores.push(r.store);
    map.set(r.cents, e);
  });
  return [...map.values()].sort((a, b) => b.stores.length - a.stores.length);
}

/**
 * The dropdown department matching an item's NRS department. Codes and
 * labels are compared loosely (case, spacing) because the list comes from
 * one store and the item may come from another.
 * @returns {string|null} the option's `dept` value, or null when none match
 */
export function matchDepartment(departments, { dept, label } = {}) {
  const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const wanted = [norm(dept), norm(label)].filter(Boolean);
  if (!wanted.length) return null;
  const hit = (departments || []).find(d => wanted.includes(norm(d.dept)))
    || (departments || []).find(d => wanted.includes(norm(d.label)));
  return hit ? hit.dept : null;
}

/** Stores that already carry the item whose price the owner has changed. */
export function priceChanges(storeStatus, prices) {
  return Object.entries(storeStatus || {})
    .filter(([, st]) => st?.status === 'has')
    .map(([storeId, st]) => {
      const raw = String(prices?.[storeId] ?? '').trim();
      const cents = raw === '' ? NaN : Math.round(parseFloat(raw) * 100);
      return { store_id: storeId, from: st.cents, cents };
    })
    .filter(c => Number.isInteger(c.cents) && c.cents >= 0 && c.cents !== c.from);
}
