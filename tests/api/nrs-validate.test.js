import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/nrs-client', () => ({ validateNRSAuth: vi.fn() }));

import { GET } from '@/app/api/nrs/validate/route';
import { validateNRSAuth } from '@/lib/nrs-client';

beforeEach(() => { vi.mocked(validateNRSAuth).mockReset(); });

describe('GET /api/nrs/validate', () => {
  it('returns the result of validateNRSAuth verbatim', async () => {
    vi.mocked(validateNRSAuth).mockResolvedValueOnce({ valid: true, status: 'ok' });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true, status: 'ok' });
  });

  it('passes through a failing validation result', async () => {
    vi.mocked(validateNRSAuth).mockResolvedValueOnce({ valid: false, reason: 'auth' });
    const res = await GET();
    expect(await res.json()).toEqual({ valid: false, reason: 'auth' });
  });
});
