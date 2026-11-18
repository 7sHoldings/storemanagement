import { describe, it, expect } from 'vitest';
import {
  TARGET_DEPARTMENTS, classifyProduct, departmentSuggestion, targetForProduct, planMoves, planCreates, targetFor,
} from '@/lib/dept-migration';

describe('departmentSuggestion', () => {
  it('maps whole departments loosely', () => {
    expect(departmentSuggestion('pre rolls').target).toBe('Prerolls');
    expect(departmentSuggestion('Pre rolls').target).toBe('Prerolls');
    expect(departmentSuggestion('Vape').target).toBe('Vapes');
    expect(departmentSuggestion('Vape juice').target).toBe('E-Liquids');
    expect(departmentSuggestion('E liquid').target).toBe('E-Liquids');
    expect(departmentSuggestion('Pods/coils').target).toBe('Coils & pods');
    expect(departmentSuggestion('Vapor devices').target).toBe('Vape Devices');
    expect(departmentSuggestion('Glass').target).toBe('Glass pipes');
    expect(departmentSuggestion('Flower').target).toBe('Prerolls');
    expect(departmentSuggestion('7-hydroxy').target).toBe('Kratom pills');
    expect(departmentSuggestion('Limitless singles').target).toBe('Kratom pills');
    expect(departmentSuggestion("Drink's").target).toBe('Drinks');
    expect(departmentSuggestion('Tobacco').target).toBe('Cigarettes');
    expect(departmentSuggestion('Lighters').target).toBe('Novelty');
  });

  it('marks mixed departments', () => {
    expect(departmentSuggestion('Thc')).toEqual({ target: 'Prerolls', mixed: false }); // owner: whole THC → Prerolls
    expect(departmentSuggestion('THC Drinks').target).toBe('Drinks');
    expect(departmentSuggestion('Incenses').target).toBe('Novelty');
    expect(departmentSuggestion('TAXABLE').mixed).toBe(true);
    expect(departmentSuggestion('Non-Tax').mixed).toBe(true);
    expect(departmentSuggestion('DEFAULT').mixed).toBe(true);
  });

  it('knows the new departments themselves', () => {
    for (const t of TARGET_DEPARTMENTS) expect(targetFor(t)).toBe(t);
    expect(targetFor('coils & pods')).toBe('Coils & pods');
  });

  it('leaves unknown departments unassigned', () => {
    expect(departmentSuggestion('Something odd').target).toBe(null);
  });
});

describe('classifyProduct (real names)', () => {
  const cases = [
    ['Booster syringe', 'Syringes'],
    ['Hidden hills syringe', 'Syringes'],
    ['Limitless 2pk 50mg', 'Kratom pills'],
    ['ZOURZ 7OH FRUIT PUNCH', 'Kratom pills'],
    ['Tigers blood blood orange', 'Kratom pills'],
    ['16oz slushie', 'Drinks'],
    ['Uncle skunks 100mg rootbeer', 'Drinks'],
    ['Red Bull Total Zero Energy Drink 12 oz', 'Drinks'],
    ['Remarkable Herbs Kratom Red Maeng Da 3oz', 'Kratom'],
    ['OPMS Silver Capsules Bag of 60ct | Green Vein Thai', 'Kratom'],
    ['Smok Novo 3 pod mesh 0.8 ohm pods', 'Coils & pods'],
    ['GeekVape B0.4 coil 25-35w', 'Coils & pods'],
    ['SPACE GODS 900MG GUMMIES 60MG D9THC+CBD 15CT | WILD BERRY', 'Gummies'],
    ['Just CBD 500mg Peach Rings', 'Gummies'],
    ['3.5 gram flower', 'Prerolls'],
    ['ZOUR HASH HOLE ELECTRIC LEMONADE', 'Prerolls'],
    ['formula 420 cleaner 12oz pipe pyrex metal glass', 'Glass pipes'],
    ['Smok Morph 2 Kit | Black Carbon Fiber', 'Vape Devices'],
    ['trinity 4ml devices', 'Vape Devices'],
    ['Camel Snus Frost', 'Cigarettes'],
    ['HH vegan wraps', 'Cigars'],
    ['Molly watermelon mushroom', 'Pills'],
    ['royal honey', 'Pills'],
  ];
  it.each(cases)('%s → %s', (name, target) => expect(classifyProduct(name)).toBe(target));

  it('returns null when nothing fits', () => {
    expect(classifyProduct('Trippy socks')).toBe(null);
    expect(classifyProduct('')).toBe(null);
  });
});

describe('targetForProduct', () => {
  it('sorts products of a mixed department by name, falling back to its default', () => {
    expect(targetForProduct({ upc: '1', dept: 'THCA', name: 'Booster syringe' })).toBe('Syringes');
    expect(targetForProduct({ upc: '2', dept: 'DEFAULT', name: 'Remarkable Herbs Kratom Bali 8oz' })).toBe('Kratom');
    expect(targetForProduct({ upc: '6', dept: 'Thc', name: 'Booster syringe' })).toBe('Prerolls'); // whole dept
    expect(targetForProduct({ upc: '3', dept: 'TAXABLE', name: 'Trippy socks' })).toBe('Novelty');
  });

  it('sorts the existing Pills department: 7-OH tablets to Kratom pills, the rest stay in Pills', () => {
    expect(targetForProduct({ upc: 'p1', dept: 'Pills', name: 'Limitless 2pk 50mg' })).toBe('Kratom pills');
    expect(targetForProduct({ upc: 'p2', dept: 'Pills', name: 'Molly watermelon mushroom' })).toBe('Pills');
    const p = planMoves([{ upc: 'p1', dept: 'Pills', name: 'Limitless 2pk 50mg' }, { upc: 'p2', dept: 'Pills', name: 'Molly' }]);
    expect(p.moves.map(m => m.upc)).toEqual(['p1']);
  });

  it('uses whole-department moves for normal departments, even if the name says otherwise', () => {
    expect(targetForProduct({ upc: '4', dept: 'Vape juice', name: 'Some pod juice' })).toBe('E-Liquids');
  });

  it('applies owner overrides: product first, then department', () => {
    const o = { departments: { flower: 'Novelty' }, products: { '9': 'Drinks' } };
    expect(targetForProduct({ upc: '5', dept: 'Flower', name: 'x' }, o)).toBe('Novelty');
    expect(targetForProduct({ upc: '9', dept: 'Flower', name: 'x' }, o)).toBe('Drinks');
  });
});

describe('planMoves', () => {
  it('skips products already in the exact department and reports unassigned ones', () => {
    const items = [
      { upc: 'a', name: 'x', dept: 'Vapes' },
      { upc: 'b', name: 'x', dept: 'Vape' },
      { upc: 'c', name: 'x', dept: 'Vape' },
      { upc: 'd', name: 'x', dept: 'Mystery' },
    ];
    const p = planMoves(items);
    expect(p.moves.map(m => m.upc)).toEqual(['b', 'c']);
    expect(p.unassigned.map(u => u.upc)).toEqual(['d']);
    expect(p.byPair).toEqual([{ from: 'Vape', to: 'Vapes', count: 2 }]);
  });

  it('moves a loose spelling of a new department to the exact one', () => {
    const p = planMoves([{ upc: 'e', name: 'x', dept: 'Coils/Pods' }]);
    expect(p.moves[0].to).toBe('Coils & pods');
  });
});

describe('planCreates', () => {
  const recs = (list) => Object.fromEntries(list.map(([dept, n]) => [dept, { dept, label: dept, item_count: n }]));

  it('copies a missing department from the busiest department that feeds it in the same store', () => {
    const own = recs([['Vape', 900], ['Vape pen', 3], ['Gummies', 50]]);
    const plan = planCreates(own, [], 'S1');
    const vapes = plan.find(p => p.name === 'Vapes');
    expect(vapes.template).toEqual({ store_id: 'S1', dept: 'Vape', label: 'Vape' });
    expect(plan.find(p => p.name === 'Gummies')).toBeUndefined(); // already there
  });

  it('prefers another store’s exact department over a feeding one', () => {
    const own = recs([['Vape', 900]]);
    const other = { store_id: 'S2', records: recs([['Vapes', 10]]) };
    expect(planCreates(own, [other], 'S1').find(p => p.name === 'Vapes').template.store_id).toBe('S2');
  });

  it('has no template when nothing anywhere feeds it', () => {
    expect(planCreates({}, [], 'S1').find(p => p.name === 'Syringes').template).toBe(null);
  });
});
