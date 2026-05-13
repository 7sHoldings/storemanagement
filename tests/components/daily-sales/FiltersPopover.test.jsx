import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FiltersPopover from '@/components/daily-sales/FiltersPopover';

const stores = [{ id: 'a', name: 'Bells' }, { id: 'b', name: 'Troup' }];
const employeeOptions = [{ value: 'u1', label: 'Alice' }];

const base = {
  open: true,
  onClose: () => {},
  stores,
  pageStoreIds: [],
  setPageStoreIds: () => {},
  employeeOptions,
  employeeFilter: [],
  setEmployeeFilter: () => {},
  mismatchFilter: '',
  setMismatchFilter: () => {},
};

describe('<FiltersPopover />', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<FiltersPopover {...base} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Store / Employee / Status labels when open', () => {
    render(<FiltersPopover {...base} />);
    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('omits the Employee section when there are no employee options', () => {
    render(<FiltersPopover {...base} employeeOptions={[]} />);
    expect(screen.queryByText('Employee')).not.toBeInTheDocument();
  });

  it('fires setMismatchFilter when the Status select changes', async () => {
    const setMismatchFilter = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FiltersPopover {...base} setMismatchFilter={setMismatchFilter} />);
    await user.selectOptions(screen.getByRole('combobox'), 'mismatch');
    expect(setMismatchFilter).toHaveBeenCalledWith('mismatch');
  });

  it('renders a "Clear filters" button when onClear is provided', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FiltersPopover {...base} onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(onClear).toHaveBeenCalled();
  });
});
