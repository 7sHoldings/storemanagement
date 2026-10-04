import { describe, it, expect } from 'vitest';
import { chargesFromSales, buildLedger, resolveEmployee } from '@/lib/house-accounts';

const profiles = [
  { id: 'p1', name: 'Bobby', nrs_employee_name: 'Dylan', store_id: 's1' },
  { id: 'p2', name: 'Ana', store_id: 's2' },
];

describe('chargesFromSales', () => {
  it('flattens per-employee entries and skips zero amounts', () => {
    const out = chargesFromSales([
      { id: 'd1', date: '2026-09-01', store_id: 's1', house_accounts: [
        { name: 'Bobby', amount: 50, employee_id: 'p1' }, { name: 'X', amount: 0 },
      ] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ employee_id: 'p1', amount: 50, date: '2026-09-01' });
  });

  it('falls back to the single name/amount columns on old rows', () => {
    const out = chargesFromSales([
      { id: 'd2', date: '2026-08-01', store_id: 's1', r1_house_account_name: 'Dylan', r1_house_account_amount: 25 },
    ]);
    expect(out).toEqual([expect.objectContaining({ name: 'Dylan', amount: 25, employee_id: null })]);
  });
});

describe('resolveEmployee', () => {
  it('matches a name-only entry to a profile by NRS alias at the same store', () => {
    expect(resolveEmployee({ name: 'dylan', store_id: 's1' }, profiles).employee_id).toBe('p1');
  });
  it('does not match the same name at a different store', () => {
    expect(resolveEmployee({ name: 'Ana', store_id: 's1' }, profiles).employee_id).toBeNull();
  });
});

describe('buildLedger', () => {
  const charges = [
    { date: '2026-09-02', store_id: 's1', employee_id: 'p1', name: 'Bobby', amount: 50, receipts: [] },
    { date: '2026-08-20', store_id: 's1', employee_id: null, name: 'Dylan', amount: 30, receipts: [] },
    { date: '2026-09-05', store_id: 's2', employee_id: 'p2', name: 'Ana', amount: 10, receipts: [] },
  ];
  const deductions = [
    { id: 'x', date: '2026-09-15', employee_id: 'p1', employee_name: 'Bobby', store_id: 's1', amount: '50' },
  ];
  const range = { start: '2026-09-01', end: '2026-09-30' };

  it('nets payroll deductions against all-time credit per employee', () => {
    const led = buildLedger({ charges, deductions, profiles, range });
    const bobby = led.find(e => e.employee_id === 'p1');
    expect(bobby.chargedAll).toBe(80);   // alias entry lands on the same person
    expect(bobby.deductedAll).toBe(50);
    expect(bobby.balance).toBe(30);
    expect(bobby.chargedRange).toBe(50);
    expect(bobby.deductedRange).toBe(50);
  });

  it('sorts the largest open balance first', () => {
    const led = buildLedger({ charges, deductions, profiles, range });
    expect(led.map(e => e.name)).toEqual(['Bobby', 'Ana']);
  });
});
