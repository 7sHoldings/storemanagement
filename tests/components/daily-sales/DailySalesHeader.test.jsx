import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailySalesHeader from '@/components/daily-sales/DailySalesHeader';

const baseProps = {
  subtitle: 'All Stores · 5 entries',
  viewMode: 'table',
  onViewModeChange: () => {},
  isOwner: true,
};

describe('<DailySalesHeader />', () => {
  it('renders the title, subtitle, and view toggle', () => {
    render(<DailySalesHeader {...baseProps} onExportCsv={() => {}} onSyncNrs={() => {}} onAdd={() => {}} />);
    expect(screen.getByRole('heading', { name: /daily sales/i })).toBeInTheDocument();
    expect(screen.getByText('All Stores · 5 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /card view/i })).toBeInTheDocument();
  });

  it('renders Sync NRS and + Add only for owners', () => {
    const onAdd = vi.fn();
    const onSyncNrs = vi.fn();
    render(<DailySalesHeader {...baseProps} isOwner={false} onExportCsv={() => {}} onSyncNrs={onSyncNrs} onAdd={onAdd} />);
    expect(screen.queryByRole('button', { name: /sync nrs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
  });

  it('fires onExportCsv / onSyncNrs / onAdd when their buttons are clicked', async () => {
    const onExportCsv = vi.fn();
    const onSyncNrs = vi.fn();
    const onAdd = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DailySalesHeader {...baseProps} onExportCsv={onExportCsv} onSyncNrs={onSyncNrs} onAdd={onAdd} />);
    await user.click(screen.getByRole('button', { name: /csv/i }));
    expect(onExportCsv).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /sync nrs/i }));
    expect(onSyncNrs).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalled();
  });
});
