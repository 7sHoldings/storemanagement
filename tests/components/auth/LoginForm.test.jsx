import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock auth lib so we can assert calls without touching Supabase.
vi.mock('@/lib/auth', () => ({
  signInWithEmail: vi.fn(),
  signInWithOAuth: vi.fn(),
  getRememberedEmail: vi.fn(() => ''),
  setRememberedEmail: vi.fn(),
}));

// Mock next/navigation so useRouter doesn't blow up outside the app router.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(''),
}));

import LoginForm from '@/components/auth/LoginForm';
import { signInWithEmail, getRememberedEmail, setRememberedEmail } from '@/lib/auth';

beforeEach(() => {
  vi.mocked(signInWithEmail).mockReset();
  vi.mocked(setRememberedEmail).mockReset();
  vi.mocked(getRememberedEmail).mockReturnValue('');
  pushMock.mockReset();
});

describe('<LoginForm /> — validation', () => {
  it('shows "Email is required" when submitting empty', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it('rejects a too-short password', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });
});

describe('<LoginForm /> — happy path', () => {
  it('calls signInWithEmail with the trimmed email and navigates to /dashboard', async () => {
    vi.mocked(signInWithEmail).mockResolvedValueOnce({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), '  a@b.com  ');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('a@b.com', 'longenough'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('persists the email when "Remember me" is checked, clears otherwise', async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(setRememberedEmail).toHaveBeenCalledWith('a@b.com'));
  });
});

describe('<LoginForm /> — failure & UX', () => {
  it('renders an alert banner with the auth error', async () => {
    vi.mocked(signInWithEmail).mockRejectedValueOnce(new Error('Invalid login credentials'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/^password$/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
  });

  it('toggles the password field between password and text', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LoginForm />);
    const pw = screen.getByLabelText(/^password$/i);
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(pw).toHaveAttribute('type', 'password');
  });

  it('pre-fills the email from getRememberedEmail() on mount', async () => {
    vi.mocked(getRememberedEmail).mockReturnValue('saved@7sstores.com');
    render(<LoginForm />);
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toHaveValue('saved@7sstores.com');
    });
  });
});
