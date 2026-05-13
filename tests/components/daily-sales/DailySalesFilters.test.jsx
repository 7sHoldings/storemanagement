import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailySalesFilters from '@/components/daily-sales/DailySalesFilters';

const stores = [
  { id: 'a', name: '7s Vape Love - Bells', color: '#34D399' },
  { id: 'b', name: '7s Vape Love - Troup', color: '#FF1493' },
];
const salesSortOptions = [
  { label: 'Date (newest)', key: 'date', dir: 'desc' },
  { label: 'Total (high)',  key: 'total_sales', dir: 'desc' },
];

const base = {
  stores,
  pageStoreIds: [],
  setPageStoreIds: () => {},
  preset: 'thisweek',
  onPreset: () => {},
  rangeStart: '2026-05-11',
  rangeEnd: '2026-05-17',
  onStartChange: () => {},
  onEndChange: () => {},
  search: '',
  setSearch: () => {},
  employeeOptions: [{ value: 'u1', label: 'Alice' }],
  employeeFilter: [],
  setEmployeeFilter: () => {},
  mismatchFilter: '',
  setMismatchFilter: () => {},
  sortState: salesSortOptions[0],
  setSortState: () => {},
  salesSortOptions,
  onClearAll: () => {},
};

describe('<DailySalesFilters />', () => {
  it('renders the store pills, search, Filters trigger, and Sort trigger', () => {
    render(<DailySalesFilters {...base} />);
    expect(screen.getByRole('button', { name: 'All Stores' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Date \(newest\)/i })).toBeInTheDocument();
  });

  it('opens the Filters popover when its button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DailySalesFilters {...base} />);
    await user.click(screen.getByRole('button', { name: /Filters/i }));
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  it('shows a count badge when one or more advanced filters are active', () => {
    render(<DailySalesFilters {...base} pageStoreIds={['a']} mismatchFilter="mismatch" />);
    // badge text is the count "2"
    expect(screen.getByText('2', { selector: 'span' })).toBeInTheDocument();
  });

  it('opens the Sort dropdown and fires setSortState with the picked option', async () => {
    const setSortState = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DailySalesFilters {...base} setSortState={setSortState} />);
    await user.click(screen.getByRole('button', { name: /Date \(newest\)/i }));
    await user.click(screen.getByRole('button', { name: /Total \(high\)/i }));
    expect(setSortState).toHaveBeenCalledWith({ key: 'total_sales', dir: 'desc' });
  });

  it('fires setSearch as the user types in the search box', async () => {
    const setSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DailySalesFilters {...base} setSearch={setSearch} />);
    await user.type(screen.getByPlaceholderText(/Search/i), 'a');
    expect(setSearch).toHaveBeenCalled();
  });
});
