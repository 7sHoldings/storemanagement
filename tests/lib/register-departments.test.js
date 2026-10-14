import { describe, it, expect } from 'vitest';
import { planRegister, isShown, findTemplate, DEFAULT_REGISTER_DEPARTMENTS } from '@/lib/register-departments';

// A slice of Denison's departments as NRS returned them (names and item
// counts from the portal capture).
const rec = (label, item_count, donotshow = false) => ({ dept: label, label, item_count, donotshow });
const DENISON = Object.fromEntries([
  rec('Vape', 437), rec('Thc', 359), rec("Drink's", 69), rec('Drinks', 4), rec('pre rolls', 105),
  rec('Hookha', 0), rec('DEFAULT', 489), rec('BR Portal', 0, true), rec('Limitless Bottles', 11),
].map(r => [r.dept, r]));

describe('planRegister', () => {
  const plan = planRegister(DENISON, ['Vape', 'Thc', 'Drinks', 'pre rolls', 'Limitless Bottles', 'Kratom']);
  const after = (label) => plan.rows.find(r => r.label === label).shownAfter;

  it('shows exactly the chosen departments and hides the rest', () => {
    expect(plan.rows.filter(r => r.shownAfter).map(r => r.label))
      .toEqual(['Drinks', 'Limitless Bottles', 'pre rolls', 'Thc', 'Vape']);
    expect(after('DEFAULT')).toBe(false);
    expect(after('Hookha')).toBe(false);
  });

  it('takes the exact spelling and hides the second spelling of the same department', () => {
    expect(after('Drinks')).toBe(true);
    expect(after("Drink's")).toBe(false);
    expect(plan.duplicatesHidden).toEqual([{ wanted: 'Drinks', used: 'Drinks', hidden: ["Drink's"] }]);
  });

  it('falls back to a loose match when the exact spelling is missing', () => {
    const p = planRegister({ "Drink's": rec("Drink's", 69) }, ['Drinks']);
    expect(p.substituted).toEqual([{ wanted: 'Drinks', used: "Drink's" }]);
    expect(p.rows[0].shownAfter).toBe(true);
  });

  it('reports chosen names the store does not have', () => {
    expect(plan.missing).toEqual(['Kratom']);
  });

  it('only lists departments whose flag actually changes', () => {
    expect(plan.changes.map(c => c.label)).not.toContain('BR Portal');   // already hidden
    expect(plan.changes.map(c => c.label)).not.toContain('Vape');        // already shown
    expect(plan.changes.map(c => c.label)).toEqual(expect.arrayContaining(['DEFAULT', "Drink's", 'Hookha']));
  });

  it('reads the flag from either place NRS puts it', () => {
    expect(isShown({ extension: { donotshow: true } })).toBe(false);
    expect(isShown({ donotshow: null })).toBe(true);
  });

  it('keeps the agreed list of 20', () => {
    expect(DEFAULT_REGISTER_DEPARTMENTS).toHaveLength(20);
  });
});


describe('findTemplate', () => {
  const others = [
    { store_id: 'r', store: 'Reno', records: { 'Vapor devices': { dept: 'Vapor devices', label: 'Vapor devices', item_count: 90 } } },
    { store_id: 'd', store: 'Denison', records: { 'Vape Devices': { dept: 'Vape Devices', label: 'Vape Devices', item_count: 151 } } },
    { store_id: 't', store: 'Troup', records: null },
  ];
  it('copies from the store with the exact spelling', () => {
    expect(findTemplate(others, 'Vape Devices').store).toBe('Denison');
  });
  it('returns null when no store has it', () => {
    expect(findTemplate(others, 'Kratom')).toBeNull();
  });
});
