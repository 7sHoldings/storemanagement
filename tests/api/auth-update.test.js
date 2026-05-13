import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { POST } from '@/app/api/auth/update/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';

const req = (body) => ({ json: async () => body });

function ownerCaller() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } } }) },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) }),
    })),
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
});

describe('POST /api/auth/update', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it('403 when caller is not an owner', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'employee' } }) }) }) }),
    });
    const res = await POST(req({ userId: 'x', name: 'A' }));
    expect(res.status).toBe(403);
  });

  it('400 when userId is missing', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller());
    const res = await POST(req({ name: 'no-id' }));
    expect(res.status).toBe(400);
  });

  it('updates only the fields that were provided', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller());
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ update })),
      auth: { admin: { updateUserById: vi.fn() } },
    });
    const res = await POST(req({ userId: 'u1', name: 'Bob', is_active: false }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bob', is_active: false }));
  });

  it('rejects passwords shorter than 6 chars', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller());
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      auth: { admin: { updateUserById: vi.fn() } },
    });
    const res = await POST(req({ userId: 'u1', password: '123' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/at least 6 characters/i);
  });

  it('calls auth.admin.updateUserById when a password is supplied', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller());
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      auth: { admin: { updateUserById } },
    });
    const res = await POST(req({ userId: 'u1', password: 'longenough' }));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith('u1', { password: 'longenough' });
  });
});
