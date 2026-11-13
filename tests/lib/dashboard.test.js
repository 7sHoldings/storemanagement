import { describe, it, expect } from 'vitest';
import { dayCount, eachDay, minusOneMonth, previousRange, dailySeries, pctChange } from '@/lib/dashboard';

describe('dashboard helpers', () => {
  it('counts days inclusively and lists them', () => {
    expect(dayCount('2026-11-01', '2026-11-11')).toBe(11);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('steps back a month, clamping short months', () => {
    expect(minusOneMonth('2026-11-11')).toBe('2026-10-11');
    expect(minusOneMonth('2026-03-31')).toBe('2026-02-28');
    expect(minusOneMonth('2026-01-15')).toBe('2025-12-15');
  });

  it('compares month-to-date with the same days of last month', () => {
    expect(previousRange('2026-11-01', '2026-11-11')).toEqual({ start: '2026-10-01', end: '2026-10-11' });
    expect(previousRange('2026-10-01', '2026-10-31')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('compares any other range with the same length just before it', () => {
    expect(previousRange('2026-11-09', '2026-11-15')).toEqual({ start: '2026-11-02', end: '2026-11-08' });
  });

  it('builds a zero-filled daily series summed across stores', () => {
    const rows = [
      { date: '2026-11-01', total_sales: 100 },
      { date: '2026-11-01', total_sales: 50.5 },
      { date: '2026-11-03', net_sales: 20 },
    ];
    expect(dailySeries(rows, '2026-11-01', '2026-11-03')).toEqual([
      { date: '2026-11-01', value: 150.5 },
      { date: '2026-11-02', value: 0 },
      { date: '2026-11-03', value: 20 },
    ]);
  });

  it('returns null change when the earlier period is empty', () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(44180.11, 49707.32)).toBeCloseTo(-11.12, 2);
  });
});
