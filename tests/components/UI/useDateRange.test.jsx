import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDateRange } from '@/components/UI';
import { getDateRange, today, startOfWeekMonday } from '@/lib/utils';

// Clock pinned to 2026-05-12 by tests/setup.js.

describe('useDateRange', () => {
  it('initialises to the requested preset', () => {
    const { result } = renderHook(() => useDateRange('thisweek'));
    expect(result.current.preset).toBe('thisweek');
    const expected = getDateRange('thisweek');
    expect(result.current.range).toEqual(expected);
  });

  it('switches preset cleanly', () => {
    const { result } = renderHook(() => useDateRange('thisweek'));
    act(() => result.current.selectPreset('thismonth'));
    expect(result.current.preset).toBe('thismonth');
    expect(result.current.range.start.slice(-2)).toBe('01');
  });

  it('flips to "custom" when start is edited and keeps end intact', () => {
    const { result } = renderHook(() => useDateRange('thisweek'));
    const originalEnd = result.current.range.end;
    act(() => result.current.setStart('2026-04-01'));
    expect(result.current.preset).toBe('custom');
    expect(result.current.range.start).toBe('2026-04-01');
    expect(result.current.range.end).toBe(originalEnd);
  });

  it('flips to "custom" when end is edited and keeps start intact', () => {
    const { result } = renderHook(() => useDateRange('thismonth'));
    const originalStart = result.current.range.start;
    act(() => result.current.setEnd('2026-05-20'));
    expect(result.current.preset).toBe('custom');
    expect(result.current.range.end).toBe('2026-05-20');
    expect(result.current.range.start).toBe(originalStart);
  });
});

describe('getDateRange — extra presets', () => {
  it('lastweek ends on the Sunday before this Monday', () => {
    const r = getDateRange('lastweek');
    expect(startOfWeekMonday(r.start)).toBe(r.start);
    expect(new Date(r.end + 'T12:00:00').getUTCDay()).toBe(0); // Sunday in UTC noon ≈ Sunday CT
  });

  it('lastmonth: start is the 1st of the prior month, end is its last day', () => {
    const r = getDateRange('lastmonth');
    expect(r.start.slice(-2)).toBe('01');
    const [y, m] = r.end.split('-').map(Number);
    // last day of that month: build the 0th of next month
    const lastDay = new Date(y, m, 0).getDate();
    expect(r.end.slice(-2)).toBe(String(lastDay).padStart(2, '0'));
  });

  it('yesterday: start === end === today - 1 day', () => {
    const r = getDateRange('yesterday');
    expect(r.start).toBe(r.end);
    const t = today();
    const d = new Date(t + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(r.start).toBe(expected);
  });
});
