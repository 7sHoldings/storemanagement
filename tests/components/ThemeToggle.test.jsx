import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the theme context — same surface, dummy state.
const changeTheme = vi.fn();
let currentTheme = 'dark';
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: currentTheme, changeTheme }),
}));

import ThemeToggle from '@/components/ThemeToggle';

describe('<ThemeToggle />', () => {
  it('renders three buttons (Light / Dark / Auto)', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /light mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auto mode/i })).toBeInTheDocument();
  });

  it('aria-pressed reflects the current theme', () => {
    currentTheme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /dark mode/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /light mode/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls changeTheme with the selected id when a button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /auto mode/i }));
    expect(changeTheme).toHaveBeenCalledWith('auto');
  });
});
