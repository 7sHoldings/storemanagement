import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));

import { POST } from '@/app/api/auth/delete/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';

const req = (body) => ({ json: async () => body });

function ownerCaller(id = 'caller') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) }) }),
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.mocked(createAdminClient).mockReset();
});

describe('POST /api/auth/delete', () => {
  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const res = await POST(req({ userId: 'x' }));
    expect(res.status).toBe(401);
  });

  it('403 when caller is not an owner', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'c' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'employee' } }) }) }) }),
    });
    const res = await POST(req({ userId: 'someone' }));
    expect(res.status).toBe(403);
  });

  it('400 when userId is missing', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller('caller'));
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('refuses to delete the caller themselves', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller('caller'));
    const res = await POST(req({ userId: 'caller' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cannot delete your own account/i);
  });

  it('happy path: deletes profile then auth user and returns success', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller('caller'));
    const eqDelete = vi.fn().mockResolvedValue({ error: null });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ delete: () => ({ eq: eqDelete }) })),
      auth: { admin: { deleteUser } },
    });
    const res = await POST(req({ userId: 'target' }));
    expect(res.status).toBe(200);
    expect(eqDelete).toHaveBeenCalledWith('id', 'target');
    expect(deleteUser).toHaveBeenCalledWith('target');
  });

  it('returns 400 with the auth error message if deleteUser fails', async () => {
    vi.mocked(createClient).mockReturnValue(ownerCaller('caller'));
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: { message: 'not found' } }) } },
    });
    const res = await POST(req({ userId: 'target' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('not found');
  });
});
