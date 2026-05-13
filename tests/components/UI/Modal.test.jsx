import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ConfirmModal } from '@/components/UI';

describe('<Modal />', () => {
  it('renders the title and children', () => {
    render(<Modal title="Add" onClose={() => {}}><p>body</p></Modal>);
    expect(screen.getByRole('heading', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('calls onClose when the ✕ button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Modal title="x" onClose={onClose}>y</Modal>);
    await user.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when the panel itself is clicked (stopPropagation)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Modal title="x" onClose={onClose}><p data-testid="body">y</p></Modal>);
    await user.click(screen.getByTestId('body'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('<ConfirmModal />', () => {
  it('fires onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ConfirmModal title="Delete?" message="Sure?" onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Yes" />);
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ConfirmModal title="Delete?" message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
