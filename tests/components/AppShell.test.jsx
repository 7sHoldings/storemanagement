import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the heavy children so this test focuses on AppShell's gating logic.
vi.mock('@/components/Sidebar', () => ({ default: () => <nav data-testid="sidebar" /> }));
vi.mock('@/components/NrsStatusBar', () => ({ default: () => <div data-testid="nrs-bar" /> }));

// Stub useRouter so the employee redirect effect doesn't blow up.
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

// useAuth — overridable per test.
let auth = {};
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => auth }));

import AppShell from '@/components/AppShell';

describe('<AppShell />', () => {
  it('renders a full-screen loader while loading', () => {
    auth = { loading: true, profile: null, user: null };
    render(<AppShell>child</AppShell>);
    expect(screen.getByText(/Loading 7S Stores/i)).toBeInTheDocument();
    expect(screen.queryByText('child')).not.toBeInTheDocument();
  });

  it('renders a "Redirecting to login" placeholder when there is no user', () => {
    auth = { loading: false, profile: null, user: null };
    render(<AppShell>child</AppShell>);
    expect(screen.getByText(/redirecting to login/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /click here if not redirected/i })).toBeInTheDocument();
  });

  it('renders sidebar + status bar + children for an authenticated user', () => {
    auth = {
      loading: false,
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'owner' },
      selectedStore: null,
      setSelectedStore: vi.fn(),
      effectiveStoreId: null,
    };
    render(<AppShell><div data-testid="page">page</div></AppShell>);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('nrs-bar')).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('shows the fallback profile warning when profile is missing or marked __fallback', () => {
    auth = {
      loading: false,
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'owner', __fallback: true },
      selectedStore: null,
      setSelectedStore: vi.fn(),
      effectiveStoreId: null,
    };
    render(<AppShell>x</AppShell>);
    expect(screen.getByText(/Profile data unavailable/i)).toBeInTheDocument();
  });

  it('supports children as a function (receives { selectedStore, setSelectedStore })', () => {
    const setSelectedStore = vi.fn();
    auth = {
      loading: false,
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'owner' },
      selectedStore: null,
      setSelectedStore,
      effectiveStoreId: 'store-1',
    };
    render(<AppShell>{({ selectedStore }) => <div data-testid="fn">{selectedStore}</div>}</AppShell>);
    expect(screen.getByTestId('fn')).toHaveTextContent('store-1');
  });
});
