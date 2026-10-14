// ═══════════════════════════════════════════════════════════
// Which department buttons each register shows.
//
// NRS shows a button on the register's Departments screen for every
// department whose "Do not show" flag is off, in A–Z order. After every
// store was given every department, the screens filled up with dozens of
// buttons, some of them the same department spelled two ways. The owner
// picks the short list worth a button; every other department is hidden.
// Hidden departments keep their items, which still scan and sell.
//
// Matching a chosen name to a store's department:
//   1. the exact spelling,
//   2. else the same name ignoring case,
//   3. else the busiest department whose name matches loosely
//      (spaces/punctuation ignored, e.g. "Drink's" for "Drinks").
// Only one department is shown per chosen name, so a second spelling of
// the same department ("Drink's" next to "Drinks") is hidden.
//
// Pure functions: planning only.
// ═══════════════════════════════════════════════════════════

import { similarKey } from '@/lib/department-sync';

/** The owner's list of departments on the register screens (Oct 2026). */
export const DEFAULT_REGISTER_DEPARTMENTS = [
  'Vape', 'Vape Devices', 'Vape juice', 'Pods/coils', 'Thc', 'Flower', 'Gummies', 'pre rolls',
  'THC Drinks', '7-hydroxy', 'Kratom', 'Tobacco', 'Cigars', 'Glass', 'Incenses',
  'Limitless singles', 'Limitless Bottles', 'Drinks', 'Taxable', 'Non-Tax',
];

/** Whether NRS currently shows this department's button. */
export const isShown = (record) => !(record?.donotshow ?? record?.extension?.donotshow ?? false);

const labelOf = (r) => String(r?.label || r?.dept || '').trim();

/**
 * @param {Object<string, object>} records  a store's departments, as NRS returns them (keyed by code)
 * @param {string[]} wanted                 names to show
 * @returns {{
 *   rows: Array<{dept, label, item_count, shownNow, shownAfter, forName}>,
 *   changes: Array<{dept, label, item_count, shownNow, shownAfter}>,
 *   missing: string[],
 *   substituted: Array<{wanted, used}>,
 *   duplicatesHidden: Array<{wanted, used, hidden: string[]}>,
 * }}
 */
export function planRegister(records, wanted) {
  const list = Object.values(records || {}).filter(r => r?.dept);
  const chosen = new Map(); // dept code -> wanted name
  const missing = [];
  const substituted = [];
  const duplicatesHidden = [];

  (wanted || []).map(w => String(w || '').trim()).filter(Boolean).forEach(w => {
    const loose = list.filter(r => similarKey(labelOf(r)) === similarKey(w));
    const pick = loose.find(r => labelOf(r) === w)
      || loose.find(r => labelOf(r).toLowerCase() === w.toLowerCase())
      || [...loose].sort((a, b) => (Number(b.item_count) || 0) - (Number(a.item_count) || 0))[0];
    if (!pick) { missing.push(w); return; }
    if (chosen.has(pick.dept)) return;
    chosen.set(pick.dept, w);
    if (labelOf(pick) !== w) substituted.push({ wanted: w, used: labelOf(pick) });
    const others = loose.filter(r => r !== pick).map(labelOf);
    if (others.length) duplicatesHidden.push({ wanted: w, used: labelOf(pick), hidden: others });
  });

  const rows = list
    .map(r => ({
      dept: r.dept,
      label: labelOf(r),
      item_count: Number(r.item_count) || 0,
      shownNow: isShown(r),
      shownAfter: chosen.has(r.dept),
      forName: chosen.get(r.dept) || null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    rows,
    changes: rows.filter(r => r.shownNow !== r.shownAfter),
    missing,
    substituted,
    duplicatesHidden,
  };
}

/**
 * Another store's copy of a department to create a missing one from:
 * the exact spelling first, then the same name ignoring case, then the
 * busiest loose match. Stores are searched in the order given.
 * @param {Array<{store_id, store, records: Object|null}>} others
 * @returns {{store_id, store, record}|null}
 */
export function findTemplate(others, name) {
  const w = String(name || '').trim();
  const all = (others || []).flatMap(o => Object.values(o.records || {})
    .filter(r => r?.dept)
    .map(record => ({ store_id: o.store_id, store: o.store, record })));
  const loose = all.filter(x => similarKey(labelOf(x.record)) === similarKey(w));
  return loose.find(x => labelOf(x.record) === w)
    || loose.find(x => labelOf(x.record).toLowerCase() === w.toLowerCase())
    || [...loose].sort((a, b) => (Number(b.record.item_count) || 0) - (Number(a.record.item_count) || 0))[0]
    || null;
}
