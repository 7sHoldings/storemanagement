import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ThemeToggle reads the ThemeContext; stub it so we can render the footer
// in isolation.
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', changeTheme: () => {} }),
}));

import SidebarFooter from '@/components/layout/SidebarFooter';

const base = { name: 'Alice', email: 'a@7sstores.com', initial: 'A', onSignOut: () => {} };

describe('<SidebarFooter />', () => {
  it('renders the user row + theme toggle + Sign Out when expanded', () => {
    render(<SidebarFooter {...base} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('a@7sstores.com')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('hides the name + email + theme toggle when collapsed', () => {
    render(<SidebarFooter {...base} collapsed />);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('a@7sstores.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /theme/i })).not.toBeInTheDocument();
  });

  it('fires onSignOut when the Sign Out button is clicked', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SidebarFooter {...base} onSignOut={onSignOut} />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
