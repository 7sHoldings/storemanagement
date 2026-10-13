import { describe, it, expect } from 'vitest';
import { mergeDepartments, findMergedDepartment } from '@/lib/pricebook-departments';

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
