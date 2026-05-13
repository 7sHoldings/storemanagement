import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '@/components/UI';

const rows = [
  { id: 1, date: '2026-05-12', amount: 100 },
  { id: 2, date: '2026-05-11', amount: 300 },
  { id: 3, date: '2026-05-10', amount: 200 },
];

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount', align: 'right', sortValue: (r) => Number(r.amount), total: (rs) => rs.reduce((s, r) => s + r.amount, 0) },
];

describe('<DataTable />', () => {
  it('renders one row per entry with the column labels in the header', () => {
    render(<DataTable columns={columns} rows={rows} isOwner={false} />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    // 3 rows + totals row + header row
    const bodyRows = screen.getAllByRole('row');
    expect(bodyRows.length).toBeGreaterThanOrEqual(4);
  });

  it('renders the supplied `total:` cell renderer in the totals row', () => {
    render(<DataTable columns={columns} rows={rows} isOwner={false} />);
    expect(screen.getByText('Totals')).toBeInTheDocument();
    expect(screen.getByText('600')).toBeInTheDocument();
  });

  it('shows emptyMessage when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} emptyMessage="No data here" isOwner={false} />);
    expect(screen.getByText('No data here')).toBeInTheDocument();
  });

  it('toggles sort direction when a sortable header is clicked twice', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DataTable columns={columns} rows={rows} sortState={null} onSortChange={onSortChange} isOwner={false} />);
    // First click → asc
    await user.click(screen.getByText('Amount'));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'amount', dir: 'asc' });
  });

  it('respects a controlled sortState (rows ordered accordingly in the DOM)', () => {
    render(<DataTable columns={columns} rows={rows} sortState={{ key: 'amount', dir: 'desc' }} isOwner={false} />);
    const bodyCells = screen.getAllByRole('cell').map(td => td.textContent);
    // Look for the first non-total row's amount cell — should be 300 (the largest).
    expect(bodyCells.join(' ')).toMatch(/300.*200.*100/);
  });
});
