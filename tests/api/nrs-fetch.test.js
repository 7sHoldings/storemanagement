import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-client', () => ({
  fetchNRSDailyStats: vi.fn(),
  parseNRSStatsToDailySales: vi.fn(),
}));

import { POST } from '@/app/api/nrs/fetch/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { fetchNRSDailyStats, parseNRSStatsToDailySales } from '@/lib/nrs-client';

const req = (body) => ({ json: async () => body });

function authed(userId = 'u1') {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) } };
}

function adminWith({ store, existing = null }) {
  return {
    from: vi.fn((table) => {
      if (table === 'stores') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: store }) }) }) };
      }
      if (table === 'daily_sales') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }) }) };
      }
      return {};
    }),
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(fetchNRSDailyStats).mockReset();
  vi.mocked(parseNRSStatsToDailySales).mockReset();
});

describe('POST /api/nrs/fetch', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const res = await POST(req({ store_id: 'a', date: '2026-05-12' }));
    expect(res.status).toBe(401);
  });

  it('400 when store_id or date is missing', async () => {
    vi.mocked(createClient).mockReturnValue(authed());
    vi.mocked(createAdminClient).mockReturnValue(adminWith({ store: null }));
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ store_id: 'a' }))).status).toBe(400);
    expect((await POST(req({ date: '2026-05-12' }))).status).toBe(400);
  });

  it('400 when the store has no NRS id configured', async () => {
    vi.mocked(createClient).mockReturnValue(authed());
    vi.mocked(createAdminClient).mockReturnValue(adminWith({ store: { id: 'a', name: 'Bells', nrs_store_id: null } }));
    const res = await POST(req({ store_id: 'a', date: '2026-05-12' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/NRS ID configured/);
  });

  it('happy path: returns the parsed preview and an existing_sale_id when present', async () => {
    vi.mocked(createClient).mockReturnValue(authed());
    vi.mocked(createAdminClient).mockReturnValue(adminWith({
      store: { id: 'a', name: 'Bells', nrs_store_id: 'NRS-1' },
      existing: { id: 'ds1' },
    }));
    vi.mocked(fetchNRSDailyStats).mockResolvedValueOnce({ raw: true });
    vi.mocked(parseNRSStatsToDailySales).mockReturnValueOnce({ r1_gross: 1000, r1_net: 900, cash_sales: 500, card_sales: 400 });
    const res = await POST(req({ store_id: 'a', date: '2026-05-12' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.preview.r1_net).toBe(900);
    expect(body.existing_sale_id).toBe('ds1');
    expect(body.store_name).toBe('Bells');
  });

  it('returns 500 when the NRS fetch throws', async () => {
    vi.mocked(createClient).mockReturnValue(authed());
    vi.mocked(createAdminClient).mockReturnValue(adminWith({ store: { id: 'a', name: 'Bells', nrs_store_id: 'X' } }));
    vi.mocked(fetchNRSDailyStats).mockRejectedValueOnce(new Error('NRS down'));
    const res = await POST(req({ store_id: 'a', date: '2026-05-12' }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('NRS down');
  });
});
