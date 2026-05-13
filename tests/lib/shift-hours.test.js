import { describe, it, expect } from 'vitest';
import { clampShiftHours, ctDayOfWeek } from '@/lib/shift-hours';

describe('ctDayOfWeek', () => {
  it('returns lowercase 3-letter weekday in CT', () => {
    // 2026-05-11 is a Monday in Chicago.
    expect(ctDayOfWeek('2026-05-11')).toBe('mon');
    expect(ctDayOfWeek('2026-05-12')).toBe('tue');
    expect(ctDayOfWeek('2026-05-17')).toBe('sun');
  });
  it('returns null when the date is falsy', () => {
    expect(ctDayOfWeek(null)).toBeNull();
    expect(ctDayOfWeek('')).toBeNull();
  });
});

// All ISO timestamps below are converted to CT wall time before clamping.
// 2026-05-12 Tuesday is during CDT (UTC-5), so 11:00 CT = 16:00 UTC.
const iso = (yy, mm, dd, hh, mn) => new Date(Date.UTC(yy, mm - 1, dd, hh + 5, mn, 0)).toISOString();

describe('clampShiftHours', () => {
  const opts = { shiftDate: '2026-05-12', storeOpen: '11:00', storeClose: '22:00' };

  it('returns null when the shift is still open (no closedAt)', () => {
    expect(clampShiftHours({ openedAt: iso(2026, 5, 12, 11, 0), closedAt: null, ...opts })).toBeNull();
    expect(clampShiftHours({ openedAt: null, closedAt: iso(2026, 5, 12, 12, 0), ...opts })).toBeNull();
  });

  it('clamps an early-clock-in to the store open time', () => {
    // opened 09:00, store opens 11:00 → counted from 11:00.
    const hrs = clampShiftHours({ openedAt: iso(2026, 5, 12, 9, 0), closedAt: iso(2026, 5, 12, 15, 0), ...opts });
    expect(hrs).toBe(4);
  });

  it('clamps a late-clock-out to the store close time', () => {
    // closed 23:30, store closes 22:00 → counted to 22:00.
    const hrs = clampShiftHours({ openedAt: iso(2026, 5, 12, 18, 0), closedAt: iso(2026, 5, 12, 23, 30), ...opts });
    expect(hrs).toBe(4);
  });

  it('counts hours as-is when within the window', () => {
    const hrs = clampShiftHours({ openedAt: iso(2026, 5, 12, 12, 0), closedAt: iso(2026, 5, 12, 18, 0), ...opts });
    expect(hrs).toBe(6);
  });

  it('returns 0 when the shift is entirely outside the window', () => {
    // 02:00–04:00 CT, store opens 11:00 → no overlap.
    const hrs = clampShiftHours({ openedAt: iso(2026, 5, 12, 2, 0), closedAt: iso(2026, 5, 12, 4, 0), ...opts });
    expect(hrs).toBe(0);
  });

  it('returns 0 when the matching day is marked closed in hoursByDay', () => {
    const hrs = clampShiftHours({
      openedAt: iso(2026, 5, 12, 12, 0),
      closedAt: iso(2026, 5, 12, 18, 0),
      shiftDate: '2026-05-12',
      hoursByDay: { tue: null },
    });
    expect(hrs).toBe(0);
  });

  it('uses per-day hours when provided', () => {
    // tue: open 13:00, close 20:00 → only 13:00–18:00 counts (5 hours).
    const hrs = clampShiftHours({
      openedAt: iso(2026, 5, 12, 11, 0),
      closedAt: iso(2026, 5, 12, 18, 0),
      shiftDate: '2026-05-12',
      hoursByDay: { tue: { open: '13:00', close: '20:00' } },
    });
    expect(hrs).toBe(5);
  });
});
