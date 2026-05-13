import { describe, it, expect, vi } from 'vitest';
import { fmtMoney, shortDate, logActivity } from '@/lib/activity';

describe('fmtMoney', () => {
  it('formats with USD currency style', () => {
    expect(fmtMoney(1234.5)).toBe('$1,234.50');
  });
  it('treats null / undefined / NaN as zero', () => {
    expect(fmtMoney(null)).toBe('$0.00');
    expect(fmtMoney(undefined)).toBe('$0.00');
    expect(fmtMoney(Number.NaN)).toBe('$0.00');
  });
});

describe('shortDate', () => {
  it('formats YYYY-MM-DD strings as "Month Day, Year"', () => {
    expect(shortDate('2026-05-12')).toBe('May 12, 2026');
  });
  it('returns an empty string for falsy input', () => {
    expect(shortDate(null)).toBe('');
    expect(shortDate('')).toBe('');
  });
  it('handles full ISO timestamps too', () => {
    expect(shortDate('2026-05-12T15:00:00Z')).toMatch(/May 12, 2026/);
  });
});

describe('logActivity', () => {
  const profile = { id: 'u1', name: 'Owner One', role: 'owner' };

  it('inserts a row with the expected shape on success', async () => {
    const insert = vi.fn().mockResolvedValueOnce({ error: null });
    const supabase = { from: vi.fn(() => ({ insert })) };
    await logActivity(supabase, profile, {
      action: 'create',
      entityType: 'daily_sale',
      entityId: 's1',
      description: 'created sale',
      storeName: 'Bells',
    });
    expect(supabase.from).toHaveBeenCalledWith('activity_log');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      user_name: 'Owner One',
      user_role: 'owner',
      action: 'create',
      entity_type: 'daily_sale',
      entity_id: 's1',
      description: 'created sale',
      store_name: 'Bells',
    }));
  });

  it('silently skips when supabase or profile is missing', async () => {
    await expect(logActivity(null, profile, { action: 'x' })).resolves.toBeUndefined();
    await expect(logActivity({}, null, { action: 'x' })).resolves.toBeUndefined();
  });

  it('does not throw when the underlying insert rejects', async () => {
    const insert = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const supabase = { from: vi.fn(() => ({ insert })) };
    await expect(logActivity(supabase, profile, { action: 'x', entityType: 'y' })).resolves.toBeUndefined();
  });
});
