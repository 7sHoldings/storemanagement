// Auth helpers for the login screen. Wraps the existing Supabase browser
// client so the UI components don't have to know about Supabase directly.
import { createClient } from '@/lib/supabase-browser';

const REMEMBERED_EMAIL_KEY = '7svl.rememberedEmail';

// Map the friendly provider names used in the UI to Supabase provider ids.
const OAUTH_PROVIDERS = { google: 'google', microsoft: 'azure', azure: 'azure' };

export async function signInWithEmail(email, password) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'Unable to sign in.');
  return data;
}

export async function signInWithOAuth(provider) {
  const supabase = createClient();
  const mapped = OAUTH_PROVIDERS[provider] || provider;
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: mapped,
    options: { redirectTo },
  });
  // Supabase performs a full-page redirect on success, so we only get here on error.
  if (error) throw new Error(error.message || 'That sign-in provider is not available right now.');
  return data;
}

export function getRememberedEmail() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function setRememberedEmail(email) {
  if (typeof window === 'undefined') return;
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies) — non-fatal.
  }
}
