// Smoke tests that the three other cron endpoints share the same
// CRON_SECRET bearer gate in production. Each route's deeper logic is
// covered in its own test (or left for a future PR); here we just make
// sure no one accidentally removes the auth gate.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/telegram', () => ({
  sendTelegram: vi.fn().mockResolvedValue({ sent: true }),
  buildInventoryPlanningMessage: vi.fn(() => 'msg'),
  buildBuyingPacingMessage: vi.fn(() => 'msg'),
  buildSyncSummaryMessage: vi.fn(() => 'msg'),
  buildStoreDailySummary: vi.fn(() => 'msg'),
  formatCurrency: (n) => `$${n}`,
}));

import { GET as weeklyInventoryGET } from '@/app/api/cron/weekly-inventory-report/route';
import { GET as weeklyReportGET } from '@/app/api/cron/weekly-report/route';

const reqNoAuth = () => new Request('http://x/');
const reqBadAuth = () => new Request('http://x/', { headers: { authorization: 'Bearer wrong' } });

beforeEach(() => {
  process.env.CRON_SECRET = 'real-secret';
  process.env.NODE_ENV = 'production';
});

describe('cron auth gates (production)', () => {
  it('GET /api/cron/weekly-inventory-report → 401 with no auth header', async () => {
    const res = await weeklyInventoryGET(reqNoAuth());
    expect(res.status).toBe(401);
  });

  it('GET /api/cron/weekly-inventory-report → 401 with the wrong bearer', async () => {
    const res = await weeklyInventoryGET(reqBadAuth());
    expect(res.status).toBe(401);
  });

  it('GET /api/cron/weekly-report → 401 without the secret', async () => {
    const res = await weeklyReportGET(reqNoAuth());
    expect(res.status).toBe(401);
  });
});
