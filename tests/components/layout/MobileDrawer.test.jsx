import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MobileDrawer from '@/components/layout/MobileDrawer';

describe('<MobileDrawer />', () => {
  it('renders aria-hidden when closed', () => {
    render(<MobileDrawer open={false} onClose={() => {}}>child</MobileDrawer>);
    const container = screen.getByRole('dialog', { hidden: true });
    // The outermost wrapper has aria-hidden when not open.
    expect(container.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders role="dialog" with aria-modal when open', () => {
    render(<MobileDrawer open onClose={() => {}}>child</MobileDrawer>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MobileDrawer open onClose={onClose}>x</MobileDrawer>);
    await user.click(screen.getByRole('button', { name: /close menu/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<MobileDrawer open onClose={onClose}>x</MobileDrawer>);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('locks body scroll while open and restores on close', () => {
    const { rerender, unmount } = render(<MobileDrawer open onClose={() => {}}>x</MobileDrawer>);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<MobileDrawer open={false} onClose={() => {}}>x</MobileDrawer>);
    // when open flips to false the effect cleanup restores the prior value (empty string in tests)
    expect(document.body.style.overflow).toBe('');
    unmount();
  });
});
