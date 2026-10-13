// ═══════════════════════════════════════════════════════════
// Departments across stores.
//
// Each store has its own NRS department list. The same department can carry
// a different code in each store ("THC" in one, "thc" or "D12" in another),
// and some stores lack a department entirely. An item created with a code
// its store does not know is rejected by NRS, so the Add-item form needs:
//   • one merged list to pick from (every department in any store)
//   • the right code for each store
//   • which stores do not have the department at all
//
// Departments are merged by name (label, else code), ignoring case and
// spacing. Pure functions so the matching can be tested without NRS.
// ═══════════════════════════════════════════════════════════

export const normDept = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * @param {Array<{store_id: string, store: string, departments: Array<{dept: string, label: string}>|null}>} perStore
 *   `departments: null` marks a store whose list could not be loaded.
 * @returns {Array<{key, dept, label, codes: Object<string,string>, items: number, missing: string[], missingIds: string[]}>}
 *   sorted by label. `codes` maps store_id → that store's department code;
 *   `items` is how many items it holds across all stores.
 *   `missing`/`missingIds` list loaded stores without the department; stores
 *   that failed to load are never reported as missing.
 */
export function mergeDepartments(perStore) {
  const rows = new Map();
  const loaded = (perStore || []).filter(s => Array.isArray(s.departments));
  loaded.forEach(s => {
    s.departments.forEach(d => {
      const key = normDept(d.label || d.dept);
      if (!key) return;
      if (!rows.has(key)) rows.set(key, { key, dept: d.dept, label: d.label || d.dept, codes: {}, items: 0 });
      const row = rows.get(key);
      row.items += Number(d.item_count) || 0;
      if (!row.codes[s.store_id]) row.codes[s.store_id] = d.dept;
    });
  });
  return [...rows.values()]
    .map(r => {
      const absent = loaded.filter(s => !r.codes[s.store_id]);
      return { ...r, missing: absent.map(s => s.store), missingIds: absent.map(s => s.store_id) };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The merged department matching an item's department, by code or name. */
export function findMergedDepartment(merged, { dept, label } = {}) {
  const wanted = [normDept(dept), normDept(label)].filter(Boolean);
  if (!wanted.length) return null;
  return (merged || []).find(r => wanted.includes(r.key))
    || (merged || []).find(r => Object.values(r.codes || {}).some(c => wanted.includes(normDept(c))))
    || null;
}

/**
 * The departments used most — the busiest `limit` by item count across all
 * stores (empty ones never count) — in alphabetical order, for the top of
 * the Department dropdown. `rest` is everything else, also alphabetical.
 */
export function splitFrequentDepartments(merged, { limit = 15 } = {}) {
  const frequent = new Set(
    [...(merged || [])]
      .filter(d => d.items > 0)
      .sort((a, b) => b.items - a.items || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map(d => d.key),
  );
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  return {
    frequent: (merged || []).filter(d => frequent.has(d.key)).sort(byLabel),
    rest: (merged || []).filter(d => !frequent.has(d.key)).sort(byLabel),
  };
}
