import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

import { POST } from '@/app/api/auth/register/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';

function makeReq(body) {
  return { json: async () => body, headers: new Headers() };
}

function callerProfile(role) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } } }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }),
    })),
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
});

describe('POST /api/auth/register', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('403 when the caller is not an owner', async () => {
    vi.mocked(createClient).mockReturnValue(callerProfile('employee'));
    const res = await POST(makeReq({ email: 'a@b.com', password: 'pw1234', name: 'A' }));
    expect(res.status).toBe(403);
  });

  it('400 when required fields are missing', async () => {
    vi.mocked(createClient).mockReturnValue(callerProfile('owner'));
    const res = await POST(makeReq({ email: '', password: '', name: '' }));
    expect(res.status).toBe(400);
  });

  it('happy path: creates an auth user + profile row and returns success', async () => {
    vi.mocked(createClient).mockReturnValue(callerProfile('owner'));

    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
      from: vi.fn(() => ({ insert })),
    });

    const res = await POST(makeReq({ email: 'a@b.com', password: 'pw12345', name: 'Alice', role: 'employee', store_id: 's1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com', password: 'pw12345', email_confirm: true }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'new-user', name: 'Alice', role: 'employee', store_id: 's1',
    }));
  });

  it('returns 400 with the supabase error message when createUser fails', async () => {
    vi.mocked(createClient).mockReturnValue(callerProfile('owner'));
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'duplicate email' } }) } },
      from: vi.fn(),
    });
    const res = await POST(makeReq({ email: 'dup@x', password: 'pw12345', name: 'A' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('duplicate email');
  });
});
