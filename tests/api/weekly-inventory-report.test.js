import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/telegram', () => ({
  sendTelegram: vi.fn().mockResolvedValue({ sent: true }),
  buildInventoryPlanningMessage: vi.fn(() => 'inventory-msg'),
}));

import { GET, POST } from '@/app/api/cron/weekly-inventory-report/route';
import { createAdminClient } from '@/lib/supabase-server';
import { sendTelegram, buildInventoryPlanningMessage } from '@/lib/telegram';

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

const req = (auth = 'Bearer s') => new Request('http://x/', { method: 'POST', headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(sendTelegram).mockReset().mockResolvedValue({ sent: true });
  vi.mocked(buildInventoryPlanningMessage).mockReset().mockReturnValue('inventory-msg');
  process.env.CRON_SECRET = 's';
  process.env.NODE_ENV = 'production';
});

describe('POST /api/cron/weekly-inventory-report', () => {
  it('401 without the matching bearer secret', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: fakeFrom({}) });
    const res = await POST(req('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('happy path: aggregates per-store rows, builds the message, sends telegram', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: fakeFrom({
        stores: [{ id: 'a', name: 'Bells', color: '#fff' }, { id: 'b', name: 'Troup', color: '#fff' }],
        daily_sales: [
          { store_id: 'a', net_sales: 1000 },
          { store_id: 'b', net_sales: 800 },
        ],
        purchases: [
          { store_id: 'a', total_cost: 200 },
          { store_id: 'b', total_cost: 1000 },
        ],
      }),
    });
    const res = await POST(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stores_count).toBe(2);
    expect(buildInventoryPlanningMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegram).toHaveBeenCalledWith('inventory-msg');
  });

  it('GET aliases POST', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: fakeFrom({}) });
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 500 when the admin client throws', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error('db down'); });
    const res = await POST(req());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('db down');
  });
});
