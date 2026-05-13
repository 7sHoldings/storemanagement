import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttentionAlerts from '@/components/dashboard/AttentionAlerts';

describe('<AttentionAlerts />', () => {
  it('uses singular wording for a single alert', () => {
    render(<AttentionAlerts alerts={[{ type: 'warning', text: 'one thing', link: '/x' }]} onAction={() => {}} />);
    expect(screen.getByText(/1 thing needs your attention/i)).toBeInTheDocument();
  });

  it('uses plural wording for multiple alerts and renders one card per alert', () => {
    const alerts = [
      { type: 'danger', text: 'Cash short $50', link: '/cash' },
      { type: 'warning', text: 'Bells margin low', link: '/reports' },
      { type: 'info', text: 'Missing today entry', link: '/sales' },
    ];
    render(<AttentionAlerts alerts={alerts} onAction={() => {}} />);
    expect(screen.getByText(/3 things need your attention/i)).toBeInTheDocument();
    expect(screen.getByText('Cash short $50')).toBeInTheDocument();
    expect(screen.getByText('Bells margin low')).toBeInTheDocument();
    expect(screen.getByText('Missing today entry')).toBeInTheDocument();
  });

  it('forwards the alert link to onAction when an item button is clicked', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AttentionAlerts
      alerts={[{ type: 'danger', text: 'fix it', link: '/cash' }]}
      onAction={onAction}
    />);
    await user.click(screen.getByRole('button', { name: /fix now/i }));
    expect(onAction).toHaveBeenCalledWith('/cash');
  });
});
