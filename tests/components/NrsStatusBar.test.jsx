import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// useAuth — owner flag flippable per test.
let isOwner = true;
const supabase = { from: vi.fn() };
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ supabase, isOwner }),
}));

import NrsStatusBar from '@/components/NrsStatusBar';

beforeEach(() => {
  isOwner = true;
  supabase.from.mockReset();
  global.fetch = vi.fn();
});

function chain(data) {
  const c = {
    select: () => c,
    order: () => c,
    limit: () => Promise.resolve({ data }),
    then: (resolve) => Promise.resolve({ data }).then(resolve),
  };
  return c;
}

describe('<NrsStatusBar />', () => {
  it('renders nothing for non-owners', () => {
    isOwner = false;
    const { container } = render(<NrsStatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Live badge for owners', () => {
    global.fetch.mockResolvedValue({ json: async () => ({ valid: true }) });
    supabase.from.mockImplementation(() => chain([]));
    render(<NrsStatusBar />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders "NRS Connected" when /api/nrs/validate returns valid=true', async () => {
    global.fetch.mockResolvedValueOnce({ json: async () => ({ valid: true }) });
    supabase.from.mockImplementation(() => chain([]));
    render(<NrsStatusBar />);
    await waitFor(() => expect(screen.getByText('NRS Connected')).toBeInTheDocument());
  });

  it('renders "NRS Invalid" when /api/nrs/validate fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('boom'));
    supabase.from.mockImplementation(() => chain([]));
    render(<NrsStatusBar />);
    await waitFor(() => expect(screen.getByText('NRS Invalid')).toBeInTheDocument());
  });

  it('renders the last-sync date when nrs_sync_log returns rows', async () => {
    global.fetch.mockResolvedValueOnce({ json: async () => ({ valid: true }) });
    supabase.from.mockImplementation(() => chain([
      { sync_date: '2026-05-12', status: 'success', created_at: '2026-05-12T10:00:00Z' },
    ]));
    render(<NrsStatusBar />);
    await waitFor(() => expect(screen.getByText('2026-05-12')).toBeInTheDocument());
    expect(screen.getByText(/Last sync/i)).toBeInTheDocument();
  });
});
