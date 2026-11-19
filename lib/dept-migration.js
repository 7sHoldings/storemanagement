// ═══════════════════════════════════════════════════════════
// Department clean-up (Nov 2026): one short list of departments in every
// store, every product moved into one of them, every other department
// hidden from the register screen.
//
// NRS keeps a product's department on the product, and the department
// carries the tax. So a move is a re-save of the product with a new
// department, and the product then takes that department's tax.
//
// Old departments are matched loosely (case, spaces and punctuation
// ignored: "Pre rolls" = "pre rolls" = "Prerolls"). Most map whole to one
// new department. A few hold a mix of everything ("Thc", "TAXABLE",
// "DEFAULT"…); their products are sorted one by one from the product name.
// Every suggestion can be changed by the owner before anything moves.
//
// Pure functions only — no NRS calls here.
// ═══════════════════════════════════════════════════════════

import { similarKey } from '@/lib/department-sync';

/** The owner's departments (Nov 2026), in register order. */
export const TARGET_DEPARTMENTS = [
  'Prerolls', 'Kratom pills', 'Kratom', 'Cigars', 'Vapes', 'Syringes', 'Gummies', 'Glass pipes',
  'Coils & pods', 'E-Liquids', 'Vape Devices', 'Pills', 'Novelty', 'Cigarettes',
  'Soft drinks', 'CBD drinks', 'Taxable', 'Non-Tax',
];

const T = Object.fromEntries(TARGET_DEPARTMENTS.map(t => [similarKey(t), t]));

/** Whole-department moves, keyed by the old department's loose key. */
export const DEPARTMENT_MAP = {
  // Prerolls (flower and hash holes go here too)
  prerolls: 'Prerolls', preroll: 'Prerolls', flower: 'Prerolls', cone: 'Prerolls', cones: 'Prerolls',
  wraps: 'Prerolls', wrap: 'Prerolls', leaf: 'Prerolls',
  // 7-OH tablets (Limitless, Zourz, Tigers blood…)
  '7hydroxy': 'Kratom pills', hydroxy: 'Kratom pills', hydroxypills: 'Kratom pills',
  limitlesssingles: 'Kratom pills', limitlesssingle: 'Kratom pills', limitlessbottles: 'Kratom pills',
  limtlessbottels: 'Kratom pills', limitbottels: 'Kratom pills', limitless: 'Kratom pills',
  kratom: 'Kratom', kratompills: 'Kratom pills',
  cigars: 'Cigars', cigar: 'Cigars', tobacco: 'Cigars',
  vape: 'Vapes', vapes: 'Vapes',
  syringes: 'Syringes', syringe: 'Syringes',
  gummies: 'Gummies', cbd: 'Gummies',
  // Owner: candy and incense go to Taxable.
  candy: 'Taxable', incenses: 'Taxable', incense: 'Taxable',
  glass: 'Glass pipes', pipe: 'Glass pipes', pipes: 'Glass pipes', glasspipes: 'Glass pipes',
  waterpipes: 'Glass pipes',
  podscoils: 'Coils & pods', coilspods: 'Coils & pods', pods: 'Coils & pods', coils: 'Coils & pods',
  vapejuice: 'E-Liquids', eliquid: 'E-Liquids', eliquids: 'E-Liquids', liquid: 'E-Liquids',
  vapedevices: 'Vape Devices', vapordevices: 'Vape Devices', devices: 'Vape Devices',
  cartridges: 'Vape Devices', cartridge: 'Vape Devices', vapepen: 'Vape Devices', vapepens: 'Vape Devices',
  novelty: 'Novelty', lighters: 'Novelty', paper: 'Novelty', papers: 'Novelty', rollpapers: 'Novelty',
  butane: 'Novelty', candle: 'Novelty', scale: 'Novelty',
  keychain: 'Novelty', knife: 'Novelty', purfume: 'Novelty', cologneperfume: 'Novelty', detox: 'Novelty',
  grinders: 'Novelty', grinder: 'Novelty', hookah: 'Novelty',
  cigarettes: 'Cigarettes',
  // Owner (Nov 19): no Drinks department — drinks go to CBD drinks.
  drinks: 'CBD drinks', thcdrinks: 'CBD drinks',
  // Non-Tax is kept (water goes there); its products stay untaxed.
  nontax: 'Non-Tax', nontaxable: 'Non-Tax', water: 'Non-Tax',
  soda: 'Soft drinks', sodas: 'Soft drinks', softdrinks: 'Soft drinks', cbddrinks: 'CBD drinks',
  // Owner (Nov 18, second list): the whole THC department goes to Syringes.
  thc: 'Syringes',
};

/**
 * Departments that hold a mix of products: each product is sorted by name
 * (classifyProduct), falling back to the department's own default.
 */
export const MIXED_DEPARTMENTS = {
  thca: 'Syringes', pills: 'Pills',
  // Taxable is kept: its products that fit nowhere else stay in Taxable.
  taxable: 'Taxable', taxableitem: 'Taxable', default: 'Novelty', misc: 'Novelty',
};

// Product-name rules, first match wins. Order matters: pods before vapes,
// syringes before everything, 7-OH before generic pills.
const RULES = [
  [/syring|rezin|booster/, 'Syringes'],
  [/limit+le?s+|lemetlees|limless|zour\s*z|zourz|zours\b|7\s*-?\s*oh|tigers? blood|dozo|hydroxy/, 'Kratom pills'],
  [/cbd.*(drink|seltzer|soda|shot|tea)|(drink|seltzer|soda|shot)\b.*cbd/, 'CBD drinks'],
  [/\bwater\b(?!\s*pipe)/, 'Non-Tax'],
  [/red ?bull|dr\.? ?pep|sprite|sprit\b|coke\b|coca|pepsi|monster energy|gatorade|mountain dew|fanta/, 'Soft drinks'],
  [/slush|drink|soda|seltzer|uncle sk|ocho|hi(gh)? tide|liquid lava|looper|sherpa|spectral|habit\b|torch|zour pop/, 'CBD drinks'],
  [/kratom|maeng|opms|mit ?45|capsule.*(red|green|white)|super k/, 'Kratom'],
  [/coil|\bpods?\b|\bpod\b/, 'Coils & pods'],
  [/e-?\s?liquid|juice|salt nic|\bml\b.*nic/, 'E-Liquids'],
  [/gumm|rings\b|worms\b|silly dots/, 'Gummies'],
  [/flower|\bgrams?\b|hash ?hole|exotic|sticky green|delta pro|pre ?roll|hemp (smoke|cig)|lone ranger|cut ?leaf|\b3\.5\b/, 'Prerolls'],
  [/pipe|glass|bong|cleaner|formula 420|water pipe|seahorse/, 'Glass pipes'],
  [/device|\bkit\b|\bmod\b|smok|geekvape|yocan|lookah|trinity|\burb\b|voopoo|charging|cable|cartridge|\bcarts?\b|vape pen/, 'Vape Devices'],
  [/\bvape|disposable/, 'Vapes'],
  [/cigarette|newport|marlboro|camel|snus/, 'Cigarettes'],
  [/wrap|\bcones?\b|\bleaf\b/, 'Prerolls'],
  [/cigar|backwood|swisher|blunt|tobacco/, 'Cigars'],
  [/molly|royal honey|\bpill|pressed|fvkd|tablet/, 'Pills'],
  [/candy|chocolate|lollipop|\bgum\b|incense/, 'Taxable'],
];

/** Suggest a department for one product from its name (null if no rule fits). */
export function classifyProduct(name) {
  const n = String(name || '').toLowerCase();
  if (!n.trim()) return null;
  for (const [re, target] of RULES) if (re.test(n)) return target;
  return null;
}

/** Is this department one of the new ones (any spelling that matches loosely)? */
export const targetFor = (label) => T[similarKey(label)] || null;

/**
 * Suggested new department for every product of one old department.
 * @returns {{target: string|null, mixed: boolean}}
 */
export function departmentSuggestion(label) {
  const key = similarKey(label);
  // Mixed first: "Pills" is a new department AND holds 7-OH tablets that
  // belong in "Kratom pills", so it is sorted product by product.
  if (MIXED_DEPARTMENTS[key]) return { target: MIXED_DEPARTMENTS[key], mixed: true };
  if (T[key]) return { target: T[key], mixed: false };
  return { target: DEPARTMENT_MAP[key] || null, mixed: false };
}

/**
 * The new department for one product.
 * `overrides`: { departments: {oldKey: target}, products: {upc: target} } chosen by the owner.
 */
export function targetForProduct(item, overrides = {}) {
  const upc = String(item?.upc || '');
  if (overrides.products?.[upc]) return overrides.products[upc];
  const key = similarKey(item?.dept);
  const depOverride = overrides.departments?.[key];
  if (depOverride) return depOverride;
  const { target, mixed } = departmentSuggestion(item?.dept);
  if (mixed) return classifyProduct(item?.name) || target;
  return target;
}

/**
 * The moves for one store: every product whose department is not already
 * the exact new department it belongs in.
 * @param {Array<{upc, name, dept}>} items
 * @returns {{moves: Array<{upc, name, from, to}>, unassigned: Array<{upc, name, from}>, byPair: Array<{from, to, count}>}}
 */
export function planMoves(items, overrides = {}) {
  const moves = [];
  const unassigned = [];
  for (const it of items || []) {
    const to = targetForProduct(it, overrides);
    if (!to) { unassigned.push({ upc: it.upc, name: it.name, from: it.dept }); continue; }
    if (String(it.dept || '') === to) continue; // already in the exact department
    moves.push({ upc: it.upc, name: it.name, from: it.dept, to });
  }
  const pairs = new Map();
  for (const m of moves) {
    const k = `${m.from}→${m.to}`;
    pairs.set(k, { from: m.from, to: m.to, count: (pairs.get(k)?.count || 0) + 1 });
  }
  return { moves, unassigned, byPair: [...pairs.values()].sort((a, b) => b.count - a.count) };
}

/**
 * Which new departments a store is missing, and which existing department
 * to copy each one's settings (tax, age check) from: the store's own busiest
 * department that maps into it, else any other store's.
 * @param {Object} records   this store's NRS departments keyed by code
 * @param {Array<{store_id, records}>} others  other stores
 * @returns {Array<{name, template: {store_id, dept}|null}>}
 */
export function planCreates(records, others = [], storeId = null) {
  const own = Object.values(records || {}).filter(r => r?.dept);
  const has = new Set(own.map(r => String(r.label || r.dept)));
  const pool = [
    ...own.map(r => ({ store_id: storeId, record: r })),
    ...others.flatMap(o => Object.values(o.records || {}).filter(r => r?.dept).map(r => ({ store_id: o.store_id, record: r }))),
  ];
  const label = (r) => String(r.label || r.dept);
  return TARGET_DEPARTMENTS.filter(t => !has.has(t)).map(t => {
    const exact = pool.find(p => label(p.record) === t);
    const feeding = pool
      .filter(p => departmentSuggestion(label(p.record)).target === t)
      .sort((a, b) => (a.store_id === storeId ? -1 : 0) - (b.store_id === storeId ? -1 : 0)
        || (Number(b.record.item_count) || 0) - (Number(a.record.item_count) || 0));
    const pick = exact || feeding[0] || null;
    return { name: t, template: pick ? { store_id: pick.store_id, dept: pick.record.dept, label: label(pick.record) } : null };
  });
}

/** Total tax rate of a department record, in decibps (8250 = 8.25%). */
export const taxOf = (record) => (Array.isArray(record?.auth_totals) ? record.auth_totals : Array.isArray(record?.auths) ? record.auths : [])
  .reduce((s, a) => s + (Number(a?.rate_decibps) || 0), 0);
