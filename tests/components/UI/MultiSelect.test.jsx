import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSelect } from '@/components/UI';

const options = [
  { value: 'a', label: 'Reno' },
  { value: 'b', label: 'Bells' },
  { value: 'c', label: 'Troup' },
];

describe('<MultiSelect />', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<MultiSelect options={options} value={[]} onChange={() => {}} placeholder="All Stores" />);
    expect(screen.getByText(/All Stores/i)).toBeInTheDocument();
  });

  it('renders individual chips when up to 3 values are selected', () => {
    render(<MultiSelect options={options} value={['a', 'b']} onChange={() => {}} unitLabel="store" placeholder="All Stores" />);
    // Each selected option is rendered as its own chip on the trigger.
    expect(screen.getByText('Reno')).toBeInTheDocument();
    expect(screen.getByText('Bells')).toBeInTheDocument();
  });

  it('collapses to "N <unit>s selected" once more than three are picked', () => {
    const many = [
      ...options,
      { value: 'd', label: 'Denison' },
    ];
    render(<MultiSelect options={many} value={['a', 'b', 'c', 'd']} onChange={() => {}} unitLabel="store" placeholder="All Stores" />);
    expect(screen.getByText('4 stores selected')).toBeInTheDocument();
  });

  it('opens the dropdown and toggles a selection on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MultiSelect options={options} value={[]} onChange={onChange} placeholder="All" />);
    await user.click(screen.getByRole('button'));               // open
    await user.click(screen.getByText('Reno'));
    expect(onChange).toHaveBeenLastCalledWith(['a']);
  });

  it('removes an already-selected value when its chip is clicked on the trigger', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MultiSelect options={options} value={['a', 'b']} onChange={onChange} placeholder="All" />);
    // Click the "Reno" chip (the one on the trigger, before opening) — it toggles off.
    await user.click(screen.getAllByText('Reno')[0]);
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MultiSelect options={options} value={[]} onChange={() => {}} placeholder="All" />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Reno')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Reno')).not.toBeInTheDocument();
  });
});
