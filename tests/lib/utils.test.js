import { describe, it, expect } from 'vitest';
import { fmt, fK, today, startOfWeekMonday, getDateRange } from '@/lib/utils';

describe('fmt', () => {
  it('formats with two decimals + thousands separators', () => {
    expect(fmt(1234.567)).toBe('$1,234.57');
  });
  it('treats null / undefined as zero', () => {
    expect(fmt(null)).toBe('$0.00');
    expect(fmt(undefined)).toBe('$0.00');
  });
  it('renders negatives with the minus inside the prefix', () => {
    expect(fmt(-50)).toBe('$-50.00');
  });
});

describe('fK', () => {
  it('uses fmt for amounts under $1,000', () => {
    expect(fK(999)).toBe('$999.00');
  });
  it('switches to "K" between $1,000 and $1M', () => {
    expect(fK(1500)).toBe('$1.5K');
  });
  it('switches to "M" above $1M', () => {
    expect(fK(2_300_000)).toBe('$2.3M');
  });
});

describe('today', () => {
  it('returns the current date as YYYY-MM-DD', () => {
    // The vitest setup pins the clock to 2026-05-12 UTC.
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today()).toBe('2026-05-12');
  });
});

describe('startOfWeekMonday', () => {
  it('returns the same date when called with a Monday', () => {
    expect(startOfWeekMonday('2026-05-11')).toBe('2026-05-11'); // Mon
  });
  it('walks back to Monday when called with another weekday', () => {
    expect(startOfWeekMonday('2026-05-13')).toBe('2026-05-11'); // Wed → Mon
    expect(startOfWeekMonday('2026-05-17')).toBe('2026-05-11'); // Sun → Mon
  });
});

describe('getDateRange', () => {
  it('returns { start, end } strings for every preset', () => {
    for (const p of ['today', 'yesterday', 'thisweek', 'lastweek', 'thismonth', 'lastmonth']) {
      const r = getDateRange(p);
      expect(r.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.start <= r.end).toBe(true);
    }
  });

  it('today preset: start equals end equals today', () => {
    const r = getDateRange('today');
    expect(r.start).toBe(today());
    expect(r.end).toBe(today());
  });

  it('thisweek preset starts on a Monday', () => {
    const r = getDateRange('thisweek');
    expect(startOfWeekMonday(r.start)).toBe(r.start);
  });

  it('thismonth preset starts on the 1st', () => {
    const r = getDateRange('thismonth');
    expect(r.start.slice(-2)).toBe('01');
  });
});
