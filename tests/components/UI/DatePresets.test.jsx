import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePresets } from '@/components/UI';

describe('<DatePresets />', () => {
  it('renders the four primary preset buttons + the More dropdown trigger', () => {
    render(<DatePresets active="thisweek" onChange={() => {}} />);
    for (const label of ['Yesterday', 'This Week', 'This Month', 'Last Month']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /More/i })).toBeInTheDocument();
  });

  it('fires onChange with the preset id when a primary button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DatePresets active="thisweek" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'This Month' }));
    expect(onChange).toHaveBeenCalledWith('thismonth');
  });

  it('toggles back to "custom" when the active preset is clicked again', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DatePresets active="thisweek" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'This Week' }));
    expect(onChange).toHaveBeenCalledWith('custom');
  });

  it('opens the overflow dropdown and picks "Last 2 Weeks"', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DatePresets active="thisweek" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /More/i }));
    await user.click(screen.getByRole('button', { name: /Last 2 Weeks/i }));
    expect(onChange).toHaveBeenCalledWith('last2weeks');
  });

  it('shows the active overflow preset on the More button label', () => {
    render(<DatePresets active="last3months" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Last 3 Months/i })).toBeInTheDocument();
  });
});
