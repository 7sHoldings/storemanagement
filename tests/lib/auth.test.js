import { describe, it, expect, beforeEach, vi } from 'vitest';

// `@/lib/auth` reads `createClient` lazily inside its functions, so we mock
// the supabase-browser module to avoid hitting the real network in tests.
vi.mock('@/lib/supabase-browser', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase-browser';
import {
  signInWithEmail,
  signInWithOAuth,
  getRememberedEmail,
  setRememberedEmail,
} from '@/lib/auth';

describe('getRememberedEmail / setRememberedEmail', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty string when nothing has been remembered', () => {
    expect(getRememberedEmail()).toBe('');
  });

  it('round-trips a remembered email through localStorage', () => {
    setRememberedEmail('elias@7sstores.com');
    expect(getRememberedEmail()).toBe('elias@7sstores.com');
  });

  it('removes the entry when called with an empty string', () => {
    setRememberedEmail('elias@7sstores.com');
    setRememberedEmail('');
    expect(getRememberedEmail()).toBe('');
  });

  it('does not throw when localStorage is unavailable', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    expect(() => setRememberedEmail('a@b.com')).not.toThrow();
    window.localStorage.setItem = original;
  });
});

describe('signInWithEmail', () => {
  it('resolves on success and throws a friendly error on failure', async () => {
    const signInWithPassword = vi.fn().mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    createClient.mockReturnValue({ auth: { signInWithPassword } });

    await expect(signInWithEmail('a@b.com', 'pw123pw')).resolves.toEqual({ user: { id: 'u1' } });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw123pw' });

    const failing = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Invalid login credentials' } });
    createClient.mockReturnValue({ auth: { signInWithPassword: failing } });
    await expect(signInWithEmail('a@b.com', 'wrong')).rejects.toThrow('Invalid login credentials');
  });
});

describe('signInWithOAuth', () => {
  it('maps "microsoft" to the "azure" Supabase provider', async () => {
    const signInWithOAuthFn = vi.fn().mockResolvedValueOnce({ data: {}, error: null });
    createClient.mockReturnValue({ auth: { signInWithOAuth: signInWithOAuthFn } });

    await signInWithOAuth('microsoft');
    expect(signInWithOAuthFn).toHaveBeenCalledWith(expect.objectContaining({ provider: 'azure' }));
  });
});
