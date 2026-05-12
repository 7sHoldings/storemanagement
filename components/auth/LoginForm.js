'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import {
  signInWithEmail,
  signInWithOAuth,
  getRememberedEmail,
  setRememberedEmail,
} from '@/lib/auth';
import styles from './login.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleIcon({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.73.13-1.43.36-2.09V7.07H2.18A11.02 11.02 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function MicrosoftIcon({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

const inputIconLeft =
  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F5E5A]';
const fieldLabel = 'mb-1.5 block text-[11px] font-medium uppercase tracking-[1px] text-[#888780]';
const fieldError = 'mt-1.5 text-[11px] text-[#FF6BB5]';
const socialButton =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2C2C2A] bg-[#0A0A0A] px-3 py-2.5 text-[12px] text-white transition hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] disabled:cursor-not-allowed disabled:opacity-60';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState('');

  useEffect(() => {
    const saved = getRememberedEmail();
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  const clearFieldError = (field) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const validate = () => {
    const next = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(trimmedEmail)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    const trimmedEmail = email.trim();
    try {
      await signInWithEmail(trimmedEmail, password);
      setRememberedEmail(remember ? trimmedEmail : '');
      // Prefer the client router, but fall back to a hard navigation so we
      // never get stuck on the login form after a successful sign-in.
      try {
        router.push('/dashboard');
        router.refresh();
      } catch {
        /* ignore — handled by the fallback below */
      }
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
          window.location.href = '/dashboard';
        }
      }, 600);
    } catch (err) {
      setFormError(err?.message || 'Unable to sign in. Please check your details and try again.');
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    if (oauthLoading || loading) return;
    setFormError('');
    setOauthLoading(provider);
    try {
      await signInWithOAuth(provider);
      // On success Supabase redirects the browser; nothing left to do here.
    } catch (err) {
      const name = provider === 'microsoft' ? 'Microsoft' : 'Google';
      setFormError(err?.message || `${name} sign-in is not available right now.`);
      setOauthLoading('');
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={`${styles.form} mt-7`}>
      {formError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[#FF1493]/40 bg-[#FF1493]/10 px-3 py-2 text-[12px] text-[#FF6BB5]"
        >
          {formError}
        </div>
      )}

      {/* Email */}
      <div className="mb-3.5">
        <label htmlFor="login-email" className={fieldLabel}>
          Email
        </label>
        <div className="relative">
          <Mail aria-hidden="true" className={inputIconLeft} />
          <input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            placeholder="you@7svapelove.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError('email');
            }}
            aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className={errors.email ? styles.error : undefined}
          />
        </div>
        {errors.email && (
          <p id="login-email-error" className={fieldError}>
            {errors.email}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="mb-3.5">
        <label htmlFor="login-password" className={fieldLabel}>
          Password
        </label>
        <div className="relative">
          <Lock aria-hidden="true" className={inputIconLeft} />
          <input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearFieldError('password');
            }}
            aria-invalid={errors.password ? 'true' : undefined}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            className={errors.password ? styles.error : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#5F5E5A] transition hover:text-[#888780] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p id="login-password-error" className={fieldError}>
            {errors.password}
          </p>
        )}
      </div>

      {/* Remember me / forgot password */}
      <div className="mb-6 mt-4 flex items-center justify-between text-[12px]">
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-[#888780]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[#39FF14]"
          />
          Remember me
        </label>
        <a href="/forgot-password" className="font-medium text-[#FF1493] hover:underline">
          Forgot password?
        </a>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#39FF14] px-4 py-[13px] text-[14px] font-medium text-[#0A0A0A] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </>
        )}
      </button>

      {/* Divider */}
      <div className="my-5 flex items-center gap-2.5">
        <span className="h-px flex-1 bg-[#2C2C2A]" />
        <span className="text-[11px] uppercase tracking-[1px] text-[#5F5E5A]">Or use</span>
        <span className="h-px flex-1 bg-[#2C2C2A]" />
      </div>

      {/* Social login */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={!!oauthLoading || loading}
          className={socialButton}
        >
          {oauthLoading === 'google' ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="h-4 w-4" />
          )}
          Google
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('microsoft')}
          disabled={!!oauthLoading || loading}
          className={socialButton}
        >
          {oauthLoading === 'microsoft' ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <MicrosoftIcon className="h-4 w-4" />
          )}
          Microsoft
        </button>
      </div>

      <p className="mt-6 text-center text-[11px] text-[#5F5E5A]">
        Authorized staff only · Must be 21+
      </p>
    </form>
  );
}
