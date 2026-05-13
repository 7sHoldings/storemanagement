import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SidebarHeader from '@/components/layout/SidebarHeader';
import SidebarItem from '@/components/layout/SidebarItem';
import SidebarSection from '@/components/layout/SidebarSection';
import MobileTopBar from '@/components/layout/MobileTopBar';

const dashboardIcon = <svg data-testid="icon" />;

describe('<SidebarHeader />', () => {
  it('renders the brand wordmark and subtitle when expanded', () => {
    render(<SidebarHeader subtitle="owner" />);
    expect(screen.getByText(/vape/i)).toBeInTheDocument();
    expect(screen.getByText(/owner/i)).toBeInTheDocument();
  });
  it('hides the text portion when collapsed', () => {
    render(<SidebarHeader subtitle="owner" collapsed />);
    expect(screen.queryByText(/owner/i)).not.toBeInTheDocument();
  });
});

describe('<SidebarItem />', () => {
  it('renders the label and icon when expanded', () => {
    render(<SidebarItem icon={dashboardIcon} label="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
  it('hides the label and adds aria-label/title when collapsed', () => {
    render(<SidebarItem icon={dashboardIcon} label="Dashboard" collapsed />);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /dashboard/i });
    expect(btn).toHaveAttribute('title', 'Dashboard');
  });
  it('sets aria-current="page" when active', () => {
    render(<SidebarItem icon={dashboardIcon} label="Dashboard" active />);
    expect(screen.getByRole('button', { name: /dashboard/i })).toHaveAttribute('aria-current', 'page');
  });
  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SidebarItem icon={dashboardIcon} label="Dashboard" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /dashboard/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('<SidebarSection />', () => {
  const items = [
    { path: '/a', icon: dashboardIcon, label: 'A' },
    { path: '/b', icon: dashboardIcon, label: 'B' },
  ];
  it('renders the title and one item per entry', () => {
    render(<SidebarSection title="Overview" items={items} currentPath="/a" onNavigate={() => {}} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^A$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^B$/ })).toBeInTheDocument();
  });
  it('marks the matching path as active', () => {
    render(<SidebarSection title="Overview" items={items} currentPath="/b" onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: /^A$/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /^B$/ })).toHaveAttribute('aria-current', 'page');
  });
  it('passes the item path to onNavigate when clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SidebarSection title={null} items={items} currentPath="/a" onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /^B$/ }));
    expect(onNavigate).toHaveBeenCalledWith('/b');
  });
  it('hides the title when collapsed', () => {
    render(<SidebarSection title="Overview" items={items} currentPath="/a" collapsed onNavigate={() => {}} />);
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });
});

describe('<MobileTopBar />', () => {
  it('renders the hamburger, brand fallback, and a page title when provided', () => {
    render(<MobileTopBar pageTitle="Daily Sales" onOpenMenu={() => {}} />);
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    expect(screen.getByText('Daily Sales')).toBeInTheDocument();
  });
  it('falls back to "Vape L♥ve" when no pageTitle', () => {
    render(<MobileTopBar onOpenMenu={() => {}} />);
    expect(screen.getByText(/vape/i)).toBeInTheDocument();
  });
  it('calls onOpenMenu when the hamburger is tapped', async () => {
    const onOpenMenu = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MobileTopBar onOpenMenu={onOpenMenu} />);
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });
});
