import { describe, it, expect } from 'vitest';
import { similarKey, editDistance, groupDepartments, suggestSimilar, applyMerges, planSync, summarize } from '@/lib/department-sync';

const d = (label, item_count = 0, tax_decibps = 8250) => ({ dept: label, label, item_count, tax_decibps });
const perStore = [
  { store_id: 'k', store: 'Kerens', departments: [d('E liquid', 12), d('Hookah', 3), d('Coils', 5)] },
  { store_id: 'r', store: 'Reno', departments: [d('E-Liquid', 40), d('Hookah', 9)] },
  { store_id: 'd', store: 'Denison', departments: [d('Hookha', 2), d('E-Liquid', 4), d('e liquid', 1)] },
];
const stores = [
  { id: 'k', name: 'Kerens', loaded: true },
  { id: 'r', name: 'Reno', loaded: true },
  { id: 'd', name: 'Denison', loaded: true },
];

describe('similarKey / editDistance', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(similarKey("Drink's")).toBe(similarKey('Drinks'));
    expect(similarKey('E liquid')).toBe(similarKey('E-Liquid'));
  });
  it('counts an adjacent swap as one edit', () => {
    expect(editDistance('hookah', 'hookha')).toBe(1);
  });
});

describe('groupDepartments', () => {
  it('folds spellings that differ only in case and punctuation', () => {
    const g = groupDepartments(perStore).find(x => x.key === 'eliquid');
    expect(g.variants.map(v => v.name).sort()).toEqual(['E liquid', 'E-Liquid', 'e liquid']);
  });
});

describe('suggestSimilar', () => {
  it('asks about near-matches but not short or distant names', () => {
    const pairs = suggestSimilar(groupDepartments(perStore));
    expect(pairs).toContainEqual(['hookah', 'hookha']);
    expect(pairs.flat()).not.toContain('coils');
  });
});

describe('planSync', () => {
  const groups = applyMerges(groupDepartments(perStore), [['hookah', 'hookha']]);
  const plan = planSync(groups, stores);
  const row = (key) => plan.find(p => p.key === key);

  it('keeps the spelling with the most items', () => {
    expect(row('eliquid').name).toBe('E-Liquid');
  });

  it('marks each store ok, add, or move', () => {
    const e = row('eliquid').perStore;
    expect(e.r.status).toBe('ok');
    expect(e.k.status).toBe('merge');                 // only "E liquid"
    expect(e.d.status).toBe('merge');                 // "E-Liquid" plus a duplicate
    expect(e.d.have.map(h => h.name).sort()).toEqual(['E-Liquid', 'e liquid']);
    expect(row('coils').perStore.r.status).toBe('create');
  });

  it('copies a new department from the store that uses the kept name most', () => {
    expect(row('coils').source).toEqual({ store_id: 'k', name: 'Coils', dept: 'Coils' });
    expect(row('eliquid').source.store_id).toBe('r');
  });

  it('honours a chosen name and confirmed near-matches', () => {
    const p = planSync(groups, stores, { chosen: { hookah: 'Hookha' } });
    const h = p.find(x => x.key === 'hookah');
    expect(h.name).toBe('Hookha');
    expect(h.perStore.d.status).toBe('ok');
    expect(h.perStore.r.status).toBe('merge');
  });

  it('flags a department taxed differently in different stores', () => {
    const p = planSync(groupDepartments([
      { store_id: 'k', store: 'K', departments: [d('Snacks', 1, 8250)] },
      { store_id: 'r', store: 'R', departments: [d('Snacks', 1, 0)] },
    ]), stores.slice(0, 2));
    expect(p[0].taxDiffers).toBe(true);
  });

  it('never plans changes for a store that failed to load', () => {
    const p = planSync(groupDepartments(perStore), [...stores, { id: 'x', name: 'Troup', loaded: false }]);
    expect(p.every(r => r.perStore.x.status === 'unknown')).toBe(true);
  });

  it('summarizes adds and moves, leaving skipped departments out', () => {
    const p = planSync(groups, stores, { skipped: new Set(['coils']) });
    const s = summarize(p);
    expect(s.toCreate).toBe(0);
    expect(s.toMerge).toBeGreaterThan(0);
  });
});
