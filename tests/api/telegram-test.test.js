import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/telegram', () => ({ sendTelegram: vi.fn() }));

import { POST } from '@/app/api/telegram/test/route';
import { createClient } from '@/lib/supabase-server';
import { sendTelegram } from '@/lib/telegram';

const req = () => ({});

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(sendTelegram).mockReset();
});

describe('POST /api/telegram/test', () => {
  it('401 when there is no signed-in user', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('400 when Telegram env vars are missing', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } });
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const res = await POST(req());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/TELEGRAM_BOT_TOKEN/i);
  });

  it('happy path: dispatches a test message and forwards the result', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } });
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = 'chat';
    vi.mocked(sendTelegram).mockResolvedValueOnce({ sent: true });
    const res = await POST(req());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(sendTelegram).toHaveBeenCalledTimes(1);
  });
});
