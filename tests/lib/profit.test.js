import { describe, it, expect } from 'vitest';
import {
  daysInMonth, monthOverlapDays, proratedExpenses,
  coversWholeMonths, checkSalesIdentity, profitSummary,
} from '@/lib/profit';

describe('daysInMonth', () => {
  it('knows the length of each month', () => {
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
  });
  it('handles a leap February', () => {
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('returns zero for rubbish rather than NaN', () => {
    expect(daysInMonth('')).toBe(0);
    expect(daysInMonth('2026-13')).toBe(0);
    expect(daysInMonth(null)).toBe(0);
  });
});

describe('monthOverlapDays', () => {
  it('counts a whole month when the range covers it', () => {
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-30')).toBe(30);
  });
  it('counts a part month', () => {
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-26')).toBe(26);
  });
  it('counts a single day as one', () => {
    expect(monthOverlapDays('2026-09', '2026-09-26', '2026-09-26')).toBe(1);
  });
  it('counts only the overlapping part when the range spans months', () => {
    expect(monthOverlapDays('2026-09', '2026-09-20', '2026-10-10')).toBe(11);
    expect(monthOverlapDays('2026-10', '2026-09-20', '2026-10-10')).toBe(10);
  });
  it('counts nothing for a month outside the range', () => {
    expect(monthOverlapDays('2026-08', '2026-09-01', '2026-09-30')).toBe(0);
  });
  it('does not shift a day in a timezone behind UTC', () => {
    // Built from Date parts rather than parsing, so the first of the month
    // cannot land on the previous month for a US-based viewer.
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-01')).toBe(1);
    expect(monthOverlapDays('2026-08', '2026-09-01', '2026-09-01')).toBe(0);
  });
  it('counts nothing when the range is inverted', () => {
    expect(monthOverlapDays('2026-09', '2026-09-30', '2026-09-01')).toBe(0);
  });
});

describe('proratedExpenses', () => {
  const sept = [{ month: '2026-09', amount: 3000 }];

  it('charges the whole month when the whole month is shown', () => {
    expect(proratedExpenses(sept, '2026-09-01', '2026-09-30')).toBe(3000);
  });

  it('charges one day of rent to a one-day view, not a month of it', () => {
    // The bug this replaces: a single day subtracted all $3,000 and reported
    // a loss that never happened.
    expect(proratedExpenses(sept, '2026-09-26', '2026-09-26')).toBe(100);
  });

  it('charges a part month its share', () => {
    expect(proratedExpenses(sept, '2026-09-01', '2026-09-26')).toBe(2600);
  });

  it('splits correctly across a month boundary', () => {
    const rows = [{ month: '2026-09', amount: 3000 }, { month: '2026-10', amount: 3100 }];
    // 11 of 30 September days + 10 of 31 October days
    expect(proratedExpenses(rows, '2026-09-20', '2026-10-10')).toBeCloseTo(1100 + 1000, 2);
  });

  it('ignores months the range never reaches', () => {
    const rows = [{ month: '2026-09', amount: 3000 }, { month: '2026-01', amount: 9999 }];
    expect(proratedExpenses(rows, '2026-09-01', '2026-09-30')).toBe(3000);
  });

  it('survives rows with a broken month or missing amount', () => {
    expect(proratedExpenses([{ month: 'nope', amount: 500 }], '2026-09-01', '2026-09-30')).toBe(0);
    expect(proratedExpenses([{ month: '2026-09' }], '2026-09-01', '2026-09-30')).toBe(0);
    expect(proratedExpenses(null, '2026-09-01', '2026-09-30')).toBe(0);
  });
});

describe('coversWholeMonths', () => {
  it('is true for a full calendar month', () => {
    expect(coversWholeMonths([{ month: '2026-09', amount: 1 }], '2026-09-01', '2026-09-30')).toBe(true);
  });
  it('is false for a partial month, so the page can say figures are shared out', () => {
    expect(coversWholeMonths([{ month: '2026-09', amount: 1 }], '2026-09-01', '2026-09-26')).toBe(false);
  });
  it('is true when there are no expenses at all', () => {
    expect(coversWholeMonths([], '2026-09-05', '2026-09-06')).toBe(true);
  });
});

describe('checkSalesIdentity', () => {
  it('accepts a row where gross minus tax equals total sales', () => {
    // Kerens, 26 Sep: gross 1151.05 (R1 754.23 + R2 396.82), tax 56.14.
    expect(checkSalesIdentity([
      { date: '2026-09-26', gross_sales: 1151.05, tax_collected: 56.14, total_sales: 1094.91 },
    ])).toEqual([]);
  });
  it('tolerates a cent of rounding', () => {
    expect(checkSalesIdentity([
      { date: 'd', gross_sales: 100, tax_collected: 8.25, total_sales: 91.76 },
    ])).toEqual([]);
  });
  it('reports a row where the chain does not close', () => {
    const off = checkSalesIdentity([
      { date: '2026-09-26', store_id: 's', gross_sales: 1000, tax_collected: 80, total_sales: 950 },
    ]);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ date: '2026-09-26', expected: 920, actual: 950 });
  });
});

describe('profitSummary', () => {
  const base = {
    sales: [
      // Kerens 26 Sep
      { date: '2026-09-26', store_id: 'k', gross_sales: 1151.05, tax_collected: 56.14, total_sales: 1094.91, cash_sales: 0.18, r2_net: 396.82, card_sales: 754.05, r1_safe_drop: 397, short_over: 0 },
      // Reno 26 Sep
      { date: '2026-09-26', store_id: 'r', gross_sales: 607.85, tax_collected: 46.30, total_sales: 561.55, cash_sales: 221.92, r2_net: 0, card_sales: 385.93, r1_safe_drop: 0, short_over: 221.92 },
    ],
    purchases: [{ total_cost: 400 }, { unit_cost: 100 }],
    expenses: [{ month: '2026-09', amount: 3000 }],
    collections: [{ cash_collected: 380 }],
    games: [{ amount: 50 }],
    start: '2026-09-26', end: '2026-09-26',
  };

  it('walks the chain the owner described', () => {
    const s = profitSummary(base);
    expect(s.grossSales).toBe(1758.90);
    expect(s.tax).toBe(102.44);
    expect(s.totalSales).toBe(1656.46);
    // gross − tax must land exactly on total sales
    expect(s.grossSales - s.tax).toBeCloseTo(s.totalSales, 2);
  });

  it('subtracts buying and expenses to reach profit', () => {
    const s = profitSummary(base);
    expect(s.productBuying).toBe(500);
    expect(s.expenses).toBe(100);          // one day of a $3,000 month
    // 1656.46 sales + 50 games − 500 buying − 100 expenses
    expect(s.profit).toBe(1106.46);
  });

  it('counts R2 takings as cash', () => {
    const s = profitSummary(base);
    // Kerens (0.18 drawer + 396.82 second till) + Reno (221.92, one till).
    // Counting cash_sales alone would report 222.10 and lose most of it.
    expect(s.cash.sales).toBe(618.92);
    expect(s.cash.card).toBe(1139.98);
  });

  it('reports margin against sales plus other income', () => {
    const s = profitSummary(base);
    expect(s.margin).toBeCloseTo(1106.46 / 1706.46 * 100, 1);
  });

  it('flags that expenses were shared out for a part month', () => {
    expect(profitSummary(base).expensesProrated).toBe(true);
    expect(profitSummary({ ...base, start: '2026-09-01', end: '2026-09-30' }).expensesProrated).toBe(false);
  });

  it('returns zeroes rather than NaN when there is nothing to show', () => {
    const s = profitSummary({ start: '2026-09-01', end: '2026-09-30' });
    expect(s.grossSales).toBe(0);
    expect(s.profit).toBe(0);
    expect(s.margin).toBe(0);
    expect(s.days).toBe(0);
  });

  it('can report a loss without clamping it to zero', () => {
    const s = profitSummary({
      sales: [{ date: 'd', gross_sales: 100, tax_collected: 8, total_sales: 92 }],
      purchases: [{ total_cost: 500 }], expenses: [], start: '2026-09-01', end: '2026-09-30',
    });
    expect(s.profit).toBe(-408);
  });
});
