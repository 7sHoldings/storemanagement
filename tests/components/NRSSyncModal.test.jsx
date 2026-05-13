import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NRSSyncModal from '@/components/NRSSyncModal';

const stores = [
  { id: 'a', name: 'Bells', nrs_store_id: 'NRS-1' },
  { id: 'b', name: 'No NRS', nrs_store_id: null },
];

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('<NRSSyncModal />', () => {
  it('renders only the stores that have an nrs_store_id', () => {
    const { container } = render(<NRSSyncModal stores={stores} onClose={() => {}} onSuccess={() => {}} />);
    // The first <select> is the store picker.
    const select = container.querySelector('select');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toContain('Bells');
    expect(options).not.toContain('No NRS');
  });

  it('clicking Fetch hits /api/nrs/fetch', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ preview: { r1_gross: 1100, r1_net: 1000 }, existing_sale_id: null }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NRSSyncModal stores={stores} onClose={() => {}} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/nrs/fetch',
      expect.objectContaining({ method: 'POST' })
    ));
  });

  it('displays the error message when /api/nrs/fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'NRS down' }) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NRSSyncModal stores={stores} onClose={() => {}} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: /fetch/i }));
    await waitFor(() => expect(screen.getByText(/NRS down/)).toBeInTheDocument());
  });

  it('fires onClose when the ✕ is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NRSSyncModal stores={stores} onClose={onClose} onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalled();
  });
});
