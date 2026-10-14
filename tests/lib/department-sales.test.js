import { describe, it, expect } from 'vitest';
import { aggregateDepartmentSales, dateChunks, lastNDays } from '@/lib/department-sales';

describe('lastNDays / dateChunks', () => {
  it('covers the last N days ending yesterday', () => {
    expect(lastNDays('2026-10-14', 60)).toEqual(['2026-08-15', '2026-10-13']);
  });
  it('splits a range into short chunks with no gaps or overlap', () => {
    expect(dateChunks('2026-08-30', '2026-09-05', 3)).toEqual([
      ['2026-08-30', '2026-09-01'], ['2026-09-02', '2026-09-04'], ['2026-09-05', '2026-09-05'],
    ]);
  });
});

describe('aggregateDepartmentSales', () => {
  const lines = [
    { dept: 'Vape', qty: 1, amount_cents: 2999 },
    { dept: 'Vape', qty: 2, amount_cents: 4000 },
    { dept: 'Flower', qty: 1, amount_cents: 2500 },
    { dept: 'Flower', qty: 1, amount_cents: 2500, refund: true },
    { dept: '', qty: 1, amount_cents: 501 },
  ];
  const rows = aggregateDepartmentSales(lines);

  it('adds up sales per department, busiest first', () => {
    expect(rows.map(r => [r.dept, r.sales_cents, r.qty])).toEqual([
      ['Vape', 6999, 3], ['Flower', 2500, 1], ['(no department)', 501, 1],
    ]);
  });

  it('keeps refunds out of sales and counts them separately', () => {
    expect(rows.find(r => r.dept === 'Flower').refund_cents).toBe(2500);
  });

  it('gives each department its share and running share of sales', () => {
    expect(rows[0].share).toBeCloseTo(6999 / 10000, 4);
    expect(rows[2].cumulative).toBeCloseTo(1, 6);
  });
});
