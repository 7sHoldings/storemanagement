import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the admin supabase client and the telegram sender.
vi.mock('@/lib/supabase-server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/telegram', () => ({
  sendTelegram: vi.fn().mockResolvedValue({ sent: true }),
  buildBuyingPacingMessage: vi.fn(() => 'message'),
}));

import { GET, POST } from '@/app/api/cron/wednesday-buying-report/route';
import { createAdminClient } from '@/lib/supabase-server';
import { sendTelegram, buildBuyingPacingMessage } from '@/lib/telegram';

// Build a chain-able stub that mimics `supabase.from(...).select(...).gte(...).lte(...)`.
function fakeFrom(rowsByTable) {
  return (table) => {
    const rows = rowsByTable[table] ?? [];
    const chain = {
      select: () => chain,
      order: () => Promise.resolve({ data: rows }),
      gte: () => chain,
      lte: () => chain,
      then: (resolve) => Promise.resolve({ data: rows }).then(resolve),
    };
    return chain;
  };
}

function makeRequest({ auth = 'Bearer test-secret' } = {}) {
  return new Request('http://x/api/cron/wednesday-buying-report', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(sendTelegram).mockReset();
  vi.mocked(buildBuyingPacingMessage).mockReset();
  vi.mocked(sendTelegram).mockResolvedValue({ sent: true });
  vi.mocked(buildBuyingPacingMessage).mockReturnValue('msg');
  process.env.CRON_SECRET = 'test-secret';
  process.env.NODE_ENV = 'production';
});

describe('POST /api/cron/wednesday-buying-report', () => {
  it('returns 401 when the Authorization header is missing in production', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: fakeFrom({}) });
    const res = await POST(makeRequest({ auth: null }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the bearer secret does not match', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: fakeFrom({}) });
    const res = await POST(makeRequest({ auth: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('runs the report, builds a message, and dispatches the Telegram call when authorised', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: fakeFrom({
        stores: [{ id: 'a', name: 'A', color: '#fff', buying_target_pct: 50, is_active: true }],
        daily_sales: [{ store_id: 'a', total_sales: 100 }],
        purchases: [{ store_id: 'a', total_cost: 30 }],
      }),
    });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stores).toBe(1);
    expect(buildBuyingPacingMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegram).toHaveBeenCalledWith('msg');
  });

  it('GET is an alias for POST (same auth + behavior)', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: fakeFrom({}) });
    const res = await GET(makeRequest({ auth: null }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when the underlying client throws', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('db down'); });
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('db down');
  });
});
