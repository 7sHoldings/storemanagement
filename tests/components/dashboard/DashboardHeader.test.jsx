import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardHeader from '@/components/dashboard/DashboardHeader';

const baseProps = {
  dateStr: 'Tuesday, May 12',
  greeting: 'Good evening, Owner',
  isOwner: true,
  syncedAgo: '1s ago',
  todayLabel: '$0.00',
};

describe('<DashboardHeader />', () => {
  it('renders the greeting, date and Live pill', () => {
    render(<DashboardHeader {...baseProps} nrsStatus={true} todayDeltaPct={null} />);
    expect(screen.getByText('Tuesday, May 12')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Good evening, Owner/i })).toBeInTheDocument();
    expect(screen.getByText(/^Live$/)).toBeInTheDocument();
    expect(screen.getByText('NRS Connected')).toBeInTheDocument();
    expect(screen.getByText('1s ago')).toBeInTheDocument();
  });

  it('shows "NRS Invalid" in danger color when nrsStatus is false', () => {
    render(<DashboardHeader {...baseProps} nrsStatus={false} todayDeltaPct={null} />);
    expect(screen.getByText('NRS Invalid')).toBeInTheDocument();
  });

  it('omits the NRS chip entirely for non-owners or when status is null', () => {
    render(<DashboardHeader {...baseProps} isOwner={false} nrsStatus={true} todayDeltaPct={null} />);
    expect(screen.queryByText('NRS Connected')).not.toBeInTheDocument();
    render(<DashboardHeader {...baseProps} nrsStatus={null} todayDeltaPct={null} />);
    expect(screen.queryByText('NRS Connected')).not.toBeInTheDocument();
  });

  it('renders the Today stat chip with a positive delta in green', () => {
    render(<DashboardHeader {...baseProps} nrsStatus={true} todayDeltaPct={5.4} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('+5.4%')).toBeInTheDocument();
  });

  it('renders a negative delta as -X.X%', () => {
    render(<DashboardHeader {...baseProps} nrsStatus={true} todayDeltaPct={-100} />);
    expect(screen.getByText('-100.0%')).toBeInTheDocument();
  });
});
