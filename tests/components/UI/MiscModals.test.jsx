import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmartDatePicker, StoreRequiredModal, TrendChart } from '@/components/UI';

describe('<SmartDatePicker />', () => {
  it('renders month + day + year selects from the value', () => {
    render(<SmartDatePicker value="2026-05-12" onChange={() => {}} />);
    expect(screen.getAllByRole('combobox').length).toBe(3);
    expect(screen.getAllByRole('combobox')[0]).toHaveDisplayValue('May');
  });

  it('fires onChange when the user picks a different month', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SmartDatePicker value="2026-05-12" onChange={onChange} />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], '6');
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^2026-06-/));
  });

  it('clamps the day when the month has fewer days (Feb has only 28/29)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SmartDatePicker value="2026-03-31" onChange={onChange} />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], '2');
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^2026-02-(28|29)$/));
  });
});

describe('<StoreRequiredModal />', () => {
  const stores = [
    { id: 'a', name: 'Bells', color: '#34D399' },
    { id: 'b', name: 'Troup', color: '#FF1493' },
  ];

  it('renders a button per store and a Cancel action', () => {
    render(<StoreRequiredModal stores={stores} onSelectStore={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: /Select Bells/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select Troup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();
  });

  it('calls onSelectStore with the chosen store', async () => {
    const onSelectStore = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StoreRequiredModal stores={stores} onSelectStore={onSelectStore} onCancel={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Select Bells/i }));
    expect(onSelectStore).toHaveBeenCalledWith(stores[0]);
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StoreRequiredModal stores={stores} onSelectStore={() => {}} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('<TrendChart />', () => {
  it('renders a "No data" placeholder for an empty dataset', () => {
    render(<TrendChart data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders bars + labels for a populated dataset', () => {
    const data = [
      { week: '2026-05-04', sales: 100, purchases: 50, label: 'May 4 – 10' },
      { week: '2026-05-11', sales: 200, purchases: 0,  label: 'May 11 – 17' },
    ];
    render(<TrendChart data={data} />);
    expect(screen.getByText('May 4 – 10')).toBeInTheDocument();
    expect(screen.getByText('May 11 – 17')).toBeInTheDocument();
    // Legend entries are always rendered.
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
  });
});
