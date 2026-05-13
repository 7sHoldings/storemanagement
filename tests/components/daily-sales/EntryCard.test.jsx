import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntryCard from '@/components/daily-sales/EntryCard';

const entry = (overrides = {}) => ({
  id: 'r1', date: '2026-05-12', store_id: 'a',
  stores: { name: '7s Vape Love - Bells', color: '#34D399' },
  total_sales: 1000, gross_sales: 1100, cash_sales: 400, card_sales: 600,
  cashapp_check: 0, credits: 0, short_over: 0, r2_net: 0, r1_canceled_basket: 0,
  r1_receipt_urls: [], r2_receipt_urls: [], credit_receipt_urls: [],
  ...overrides,
});
const store = { id: 'a', name: '7s Vape Love - Bells', color: '#34D399', has_register2: false };

describe('<EntryCard />', () => {
  it('renders store name + date + TOTAL + Cash/Card/Gross line', () => {
    render(<EntryCard entry={entry()} store={store} status="synced" />);
    expect(screen.getByText('Bells')).toBeInTheDocument();  // short name
    expect(screen.getByText(/May 12/i)).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText(/Cash \$400\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/Card \$600\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/Gross \$1,100\.00/i)).toBeInTheDocument();
  });

  it('renders a warning status pill with the orange left border', () => {
    const { container } = render(<EntryCard entry={entry()} store={store} status="warning" statusTitle="R2 mismatch" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(container.firstChild.getAttribute('style')).toMatch(/EF9F27|rgb\(239, 159, 39\)/i);
  });

  it('shows SHORT (red) for positive short_over and OVER (green) for negative', () => {
    render(<EntryCard entry={entry({ short_over: 50 })} store={store} status="synced" />);
    expect(screen.getByText(/S\/O −\$50\.00/i)).toBeInTheDocument();
    render(<EntryCard entry={entry({ short_over: -50 })} store={store} status="synced" />);
    expect(screen.getByText(/S\/O \+\$50\.00/i)).toBeInTheDocument();
  });

  it('renders Edit / Delete buttons for owners only', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const { rerender } = render(<EntryCard entry={entry()} store={store} status="synced" isOwner={false} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();

    rerender(<EntryCard entry={entry()} store={store} status="synced" isOwner onEdit={onEdit} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('opens the receipt viewer with the union of receipt urls', async () => {
    const onViewReceipts = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const e = entry({
      r1_receipt_urls: ['/r1-a.jpg'],
      r2_receipt_urls: ['/r2-a.jpg', '/r2-b.jpg'],
    });
    render(<EntryCard entry={e} store={store} status="synced" onViewReceipts={onViewReceipts} />);
    await user.click(screen.getByTitle('View 3 receipts'));
    expect(onViewReceipts).toHaveBeenCalledWith(expect.objectContaining({
      images: ['/r1-a.jpg', '/r2-a.jpg', '/r2-b.jpg'],
      idx: 0,
    }));
  });
});
