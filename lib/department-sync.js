// ═══════════════════════════════════════════════════════════
// Department sync planning — one department list for every store.
//
// Departments are compared by a loose key (case, spaces and punctuation
// ignored), so "E liquid", "E-Liquid" and "e-liquid" are one department and
// "Drink's"/"Drinks" are one. Names that are close but not identical
// ("Hookah"/"Hookha", "Vape Devices"/"Vapor devices") are only *suggested*;
// the owner confirms each one before they are treated as the same.
//
// For each department the plan says, per store:
//   ok      — the store has it under the chosen name, and nothing else
//   create  — the store has no version of it; copy it in
//   merge   — the store has it under another name (or several names); its
//             items need moving to the chosen name and the extras removing
//   unknown — the store's list could not be loaded
// The chosen name defaults to the spelling that holds the most items.
//
// Pure functions: planning only. Nothing here talks to NRS.
// ═══════════════════════════════════════════════════════════

/** Loose identity: lower-case letters and digits only. */
export const similarKey = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Edit distance (insert/delete/substitute, adjacent swap counts as one). */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/**
 * Group every store's departments by loose key.
 * @param {Array<{store_id, store, departments: Array<{dept,label,item_count,tax_decibps}>|null}>} perStore
 * @returns {Array<{key, variants: Array<{name, stores: Object<store_id,{dept,item_count,tax_decibps}>}>}>}
 */
export function groupDepartments(perStore) {
  const groups = new Map();
  (perStore || []).forEach(s => {
    (s.departments || []).forEach(d => {
      const name = String(d.label || d.dept || '').trim();
      const key = similarKey(name);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key, variants: [] });
      const g = groups.get(key);
      let v = g.variants.find(x => x.name === name);
      if (!v) { v = { name, stores: {} }; g.variants.push(v); }
      v.stores[s.store_id] = { dept: d.dept, item_count: Number(d.item_count) || 0, tax_decibps: Number(d.tax_decibps) || 0 };
    });
  });
  return [...groups.values()];
}

/**
 * Pairs of groups whose names are close enough to ask about. Short names are
 * left alone ("Can"/"Candy" are not the same thing).
 */
export function suggestSimilar(groups, { maxDistance = 2, minLength = 5 } = {}) {
  const out = [];
  const list = groups || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].key, b = list[j].key;
      if (Math.min(a.length, b.length) < minLength) continue;
      if (Math.abs(a.length - b.length) > maxDistance) continue;
      if (editDistance(a, b) <= maxDistance) out.push([a, b]);
    }
  }
  return out;
}

/** Fold confirmed pairs ([keyA, keyB]) into single groups. */
export function applyMerges(groups, merges) {
  const parent = new Map((groups || []).map(g => [g.key, g.key]));
  const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  (merges || []).forEach(([a, b]) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  });
  const out = new Map();
  (groups || []).forEach(g => {
    const root = find(g.key);
    if (!out.has(root)) out.set(root, { key: root, variants: [] });
    out.get(root).variants.push(...g.variants);
  });
  return [...out.values()];
}

const totalItems = (v) => Object.values(v.stores).reduce((s, x) => s + x.item_count, 0);

/**
 * The per-store plan for every department.
 * @param {Array} groups      from groupDepartments / applyMerges
 * @param {Array<{id, name, loaded: boolean}>} stores
 * @param {Object<string,string>} [chosen]  group key → chosen name
 * @param {Set<string>} [skipped]           group keys left out of the sync
 */
export function planSync(groups, stores, { chosen = {}, skipped = new Set() } = {}) {
  return (groups || []).map(g => {
    const variants = [...g.variants].sort((a, b) => totalItems(b) - totalItems(a) || a.name.localeCompare(b.name));
    const name = variants.some(v => v.name === chosen[g.key]) ? chosen[g.key] : variants[0].name;
    const taxRates = [...new Set(variants.flatMap(v => Object.values(v.stores).map(x => x.tax_decibps)))];
    const perStore = {};
    (stores || []).forEach(s => {
      if (!s.loaded) { perStore[s.id] = { status: 'unknown', have: [] }; return; }
      const have = variants
        .filter(v => v.stores[s.id])
        .map(v => ({ name: v.name, dept: v.stores[s.id].dept, item_count: v.stores[s.id].item_count }));
      let status = 'create';
      if (have.length === 1 && have[0].name === name) status = 'ok';
      else if (have.length > 0) status = 'merge';
      perStore[s.id] = { status, have };
    });
    // The copy source for creates: the chosen spelling in the store that
    // uses it most, else the busiest variant anywhere.
    const source = (() => {
      const pick = (v) => {
        const [storeId, x] = Object.entries(v.stores).sort((a, b) => b[1].item_count - a[1].item_count)[0];
        return { store_id: storeId, name: v.name, dept: x.dept };
      };
      const exact = variants.find(v => v.name === name);
      return pick(exact || variants[0]);
    })();
    return {
      key: g.key,
      name,
      names: variants.map(v => v.name),
      total: variants.reduce((s, v) => s + totalItems(v), 0),
      taxDiffers: taxRates.length > 1,
      taxRates,
      skipped: skipped.has(g.key),
      source,
      perStore,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Counts for the summary line. Skipped departments are left out. */
export function summarize(plan) {
  const active = (plan || []).filter(p => !p.skipped);
  const cells = active.flatMap(p => Object.values(p.perStore));
  return {
    departments: active.length,
    toCreate: cells.filter(c => c.status === 'create').length,
    toMerge: cells.filter(c => c.status === 'merge').length,
    inSync: active.filter(p => Object.values(p.perStore).every(c => c.status === 'ok')).length,
  };
}
