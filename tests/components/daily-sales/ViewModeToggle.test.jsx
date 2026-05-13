import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewModeToggle from '@/components/daily-sales/ViewModeToggle';

describe('<ViewModeToggle />', () => {
  it('renders two buttons (Table + Cards) with aria-pressed reflecting the mode', () => {
    render(<ViewModeToggle mode="table" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /table view/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /card view/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange("cards") when the cards button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ViewModeToggle mode="table" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /card view/i }));
    expect(onChange).toHaveBeenCalledWith('cards');
  });

  it('calls onChange("table") when the table button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ViewModeToggle mode="cards" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /table view/i }));
    expect(onChange).toHaveBeenCalledWith('table');
  });
});
