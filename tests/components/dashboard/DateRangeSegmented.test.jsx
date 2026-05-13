import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DateRangeSegmented from '@/components/dashboard/shared/DateRangeSegmented';

const baseProps = {
  preset: 'thisweek',
  onPreset: () => {},
  startDate: '2026-05-11',
  endDate: '2026-05-17',
  onStartChange: () => {},
  onEndChange: () => {},
};

describe('<DateRangeSegmented />', () => {
  it('renders the four primary preset buttons + a "Custom ▼" trigger', () => {
    render(<DateRangeSegmented {...baseProps} />);
    for (const label of ['Yesterday', 'This Week', 'This Month', 'Last Month']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Custom/i })).toBeInTheDocument();
  });

  it('calls onPreset with the picked id', async () => {
    const onPreset = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangeSegmented {...baseProps} onPreset={onPreset} />);
    await user.click(screen.getByRole('button', { name: 'This Month' }));
    expect(onPreset).toHaveBeenCalledWith('thismonth');
  });

  it('toggles the active preset back to "custom" on a second click', async () => {
    const onPreset = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangeSegmented {...baseProps} onPreset={onPreset} />);
    await user.click(screen.getByRole('button', { name: 'This Week' }));
    expect(onPreset).toHaveBeenCalledWith('custom');
  });

  it('opens the Custom dropdown with two date inputs and an overflow grid', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangeSegmented {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /Custom/i }));
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Last 2 Weeks/i })).toBeInTheDocument();
  });

  it('picking an overflow preset fires onPreset with its id and closes the dropdown', async () => {
    const onPreset = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangeSegmented {...baseProps} onPreset={onPreset} />);
    await user.click(screen.getByRole('button', { name: /Custom/i }));
    await user.click(screen.getByRole('button', { name: /Last 2 Weeks/i }));
    expect(onPreset).toHaveBeenLastCalledWith('last2weeks');
    // Dropdown closed: the date-input label is gone.
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
  });

  it('debounces the custom start-date input to ~500ms', async () => {
    const onStartChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateRangeSegmented {...baseProps} onStartChange={onStartChange} />);
    await user.click(screen.getByRole('button', { name: /Custom/i }));
    const start = screen.getByLabelText('Start date');
    await user.clear(start);
    await user.type(start, '2026-04-01');
    expect(onStartChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(onStartChange).toHaveBeenCalledWith('2026-04-01'));
  });

  it('renders the active overflow preset on the Custom trigger label', () => {
    render(<DateRangeSegmented {...baseProps} preset="last3months" />);
    expect(screen.getByRole('button', { name: /Last 3 Months/i })).toBeInTheDocument();
  });
});
