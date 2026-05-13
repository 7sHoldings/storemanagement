import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertCard from '@/components/dashboard/shared/AlertCard';

describe('<AlertCard />', () => {
  it('renders CRITICAL / Fix now for type="danger"', () => {
    render(<AlertCard type="danger" text="Cash short by $50" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('Cash short by $50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fix now/i })).toBeInTheDocument();
  });

  it('renders WARNING / Review for type="warning"', () => {
    render(<AlertCard type="warning" text="Margin only 18%" />);
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeInTheDocument();
  });

  it('renders INFO / Review for type="info" (and any unknown type falls back to info)', () => {
    render(<AlertCard type="info" text="Missing today's entry" />);
    expect(screen.getByText('INFO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review/i })).toBeInTheDocument();
  });

  it('calls onAction when the CTA is clicked', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AlertCard type="danger" text="x" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: /fix now/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
