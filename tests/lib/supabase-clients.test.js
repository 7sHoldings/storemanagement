import { describe, it, expect, vi } from 'vitest';

// Mock the SSR helpers so we can verify the wrappers call them with the
// right env vars and a sensible cookies shim.
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((url, key) => ({ url, key, type: 'server' })),
  createBrowserClient: vi.fn((url, key) => ({ url, key, type: 'browser' })),
}));
vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

import { createServerClient, createBrowserClient } from '@supabase/ssr';
import { createClient as createServer, createAdminClient } from '@/lib/supabase-server';
import { createClient as createBrowser } from '@/lib/supabase-browser';

describe('supabase-server', () => {
  it('createClient uses the anon key and a cookie store', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const client = createServer();
    expect(client.url).toBe('https://x.supabase.co');
    expect(client.key).toBe('anon-key');
    expect(createServerClient).toHaveBeenCalled();
  });

  it('createAdminClient uses the service role key and no-op cookies', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    const client = createAdminClient();
    expect(client.key).toBe('service-key');
  });

  it('falls back to placeholders when env vars are missing (no crash)', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const c = createServer();
    expect(c.url).toBe('http://localhost');
    expect(c.key).toBe('missing-key');
  });
});

describe('supabase-browser', () => {
  it('createClient delegates to createBrowserClient with the env values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const c = createBrowser();
    expect(c.type).toBe('browser');
    expect(createBrowserClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon-key');
  });

  it('falls back to placeholders when env vars are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const c = createBrowser();
    expect(c.url).toBe('http://localhost');
  });
});
