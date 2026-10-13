import { describe, it, expect } from 'vitest';
import { mergeDepartments, findMergedDepartment, splitFrequentDepartments } from '@/lib/pricebook-departments';

const perStore = [
  { store_id: 'k', store: 'Kerens', departments: [{ dept: 'THC', label: 'THC' }, { dept: 'VAPE', label: 'Vape' }] },
  { store_id: 'r', store: 'Reno', departments: [{ dept: 'thc', label: 'thc ' }, { dept: 'VAPE', label: 'Vape' }] },
  { store_id: 't', store: 'Troup', departments: [{ dept: 'VAPE', label: 'Vape' }] },
  { store_id: 'd', store: 'Denison', departments: null }, // failed to load
];

describe('mergeDepartments', () => {
  const merged = mergeDepartments(perStore);
  const thc = merged.find(d => d.key === 'thc');

  it('merges the same department across stores by name, ignoring case and spacing', () => {
    expect(merged.map(d => d.label)).toEqual(['THC', 'Vape']);
    expect(thc.codes).toEqual({ k: 'THC', r: 'thc' });
  });

  it('lists the stores that lack a department', () => {
    expect(thc.missing).toEqual(['Troup']);
    expect(thc.missingIds).toEqual(['t']);
    expect(merged.find(d => d.key === 'vape').missing).toEqual([]);
  });

  it('never reports a store whose list failed to load as missing', () => {
    expect(thc.missing).not.toContain('Denison');
  });
});

describe('findMergedDepartment', () => {
  const merged = mergeDepartments(perStore);

  it('finds a department by any store’s code', () => {
    expect(findMergedDepartment(merged, { dept: 'thc' }).key).toBe('thc');
  });

  it('finds a department by name when the code is unknown', () => {
    expect(findMergedDepartment(merged, { dept: 'D99', label: 'VAPE' }).key).toBe('vape');
  });

  it('returns null when nothing matches', () => {
    expect(findMergedDepartment(merged, { dept: 'Kratom' })).toBeNull();
    expect(findMergedDepartment(merged, {})).toBeNull();
  });
});


describe('splitFrequentDepartments', () => {
  const dept = (label, items) => ({ key: label.toLowerCase(), label, items, missing: [] });
  const merged = [dept('Alcohol', 9), dept('Vape', 412), dept('THC', 150), dept('Flower', 133), dept('Calling Card', 0), dept('Candy', 53)];

  it('puts the busiest departments first, in alphabetical order', () => {
    const { frequent, rest } = splitFrequentDepartments(merged, { limit: 3 });
    expect(frequent.map(d => d.label)).toEqual(['Flower', 'THC', 'Vape']);
    expect(rest.map(d => d.label)).toEqual(['Alcohol', 'Calling Card', 'Candy']);
  });

  it('never counts an empty department as frequent', () => {
    const { frequent } = splitFrequentDepartments([dept('Calling Card', 0)], { limit: 3 });
    expect(frequent).toEqual([]);
  });

  it('adds up item counts across stores when merging', () => {
    const m = mergeDepartments([
      { store_id: 'a', store: 'A', departments: [{ dept: 'Vape', label: 'Vape', item_count: 10 }] },
      { store_id: 'b', store: 'B', departments: [{ dept: 'vape', label: 'vape', item_count: 5 }] },
    ]);
    expect(m[0].items).toBe(15);
  });
});
