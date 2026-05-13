import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateBar } from '@/components/UI';

describe('<DateBar />', () => {
  it('renders the preset row and two date inputs', () => {
    render(<DateBar preset="thisweek" startDate="2026-05-11" endDate="2026-05-17" onPreset={() => {}} onStartChange={() => {}} onEndChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument();
    const inputs = screen.getAllByDisplayValue(/2026-05-(11|17)/);
    expect(inputs.length).toBe(2);
  });

  it('reflects upstream date changes into the inputs', () => {
    const { rerender } = render(
      <DateBar preset="thisweek" startDate="2026-05-11" endDate="2026-05-17" onPreset={() => {}} onStartChange={() => {}} onEndChange={() => {}} />
    );
    rerender(<DateBar preset="custom" startDate="2026-04-01" endDate="2026-04-30" onPreset={() => {}} onStartChange={() => {}} onEndChange={() => {}} />);
    expect(screen.getByDisplayValue('2026-04-01')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-04-30')).toBeInTheDocument();
  });

  it('debounces onStartChange so it fires once after the user pauses (~500ms)', async () => {
    const onStartChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateBar preset="thisweek" startDate="2026-05-11" endDate="2026-05-17" onPreset={() => {}} onStartChange={onStartChange} onEndChange={() => {}} />);
    const start = screen.getAllByDisplayValue(/2026-05-/)[0];

    // Programmatic change to simulate the user picking a new date.
    await user.clear(start);
    await user.type(start, '2026-05-01');
    expect(onStartChange).not.toHaveBeenCalled();

    // Fast-forward past the debounce window.
    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(onStartChange).toHaveBeenCalled());
    // Final committed value is what was typed.
    expect(onStartChange).toHaveBeenLastCalledWith('2026-05-01');
  });

  it('flushes pending onEndChange on blur', async () => {
    const onEndChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DateBar preset="thisweek" startDate="2026-05-11" endDate="2026-05-17" onPreset={() => {}} onStartChange={() => {}} onEndChange={onEndChange} />);
    const end = screen.getAllByDisplayValue(/2026-05-/)[1];
    await user.clear(end);
    await user.type(end, '2026-05-31');
    end.blur();
    expect(onEndChange).toHaveBeenLastCalledWith('2026-05-31');
  });
});
