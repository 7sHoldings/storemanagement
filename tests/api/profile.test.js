import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

import { GET } from '@/app/api/profile/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
});

describe('GET /api/profile', () => {
  it('returns 401 when there is no authenticated user', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('not_authenticated');
  });

  it('returns the profile row when found', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }) },
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'u1', name: 'Alice', role: 'owner' }, error: null }),
          }),
        }),
      }),
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile).toEqual({ id: 'u1', name: 'Alice', role: 'owner' });
  });

  it('returns a fallback profile (marked __fallback) when the profile row is missing', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }) },
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    });
    const res = await GET();
    const body = await res.json();
    expect(body.profile.__fallback).toBe(true);
    expect(body.warning).toBe('no_profile_row');
  });

  it('returns 500 on unexpected exceptions', async () => {
    vi.mocked(createClient).mockImplementation(() => { throw new Error('boom'); });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
