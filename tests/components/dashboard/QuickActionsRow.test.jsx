import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickActionsRow from '@/components/dashboard/QuickActionsRow';

describe('<QuickActionsRow />', () => {
  it('renders all six action buttons by label', () => {
    render(<QuickActionsRow onNavigate={() => {}} />);
    for (const label of [
      'Daily Sales',
      'P&L Report',
      'Cash Collection',
      'Employee Tracking',
      'Sync NRS',
      'Inventory Report',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('calls onNavigate with the right href for each button', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QuickActionsRow onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /daily sales/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('/sales');

    await user.click(screen.getByRole('button', { name: /cash collection/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('/cash');

    await user.click(screen.getByRole('button', { name: /sync nrs/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('/nrs-sync-history');

    await user.click(screen.getByRole('button', { name: /inventory report/i }));
    expect(onNavigate).toHaveBeenLastCalledWith('/nrs-backfill');
  });
});
