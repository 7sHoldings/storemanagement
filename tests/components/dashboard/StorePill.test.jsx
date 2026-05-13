import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorePill from '@/components/dashboard/shared/StorePill';

describe('<StorePill />', () => {
  it('renders the label and a colored dot when a color is provided', () => {
    const { container } = render(<StorePill label="Bells" color="#34D399" onClick={() => {}} />);
    expect(screen.getByText('Bells')).toBeInTheDocument();
    expect(container.querySelector('span[style*="rgb(52, 211, 153)"]')).not.toBeNull();
  });

  it('omits the dot for "All Stores" (no color prop)', () => {
    const { container } = render(<StorePill label="All Stores" onClick={() => {}} />);
    // Only the button is rendered, no inner color dot span.
    expect(container.querySelectorAll('span').length).toBe(0);
  });

  it('uses the brand-green active state for the All-Stores variant', () => {
    render(<StorePill label="All Stores" active onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'All Stores' });
    expect(btn.getAttribute('style')).toMatch(/#39FF14|rgb\(57, 255, 20\)/i);
  });

  it('uses the store color as background when active with a color', () => {
    render(<StorePill label="Bells" color="#34D399" active onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: /bells/i });
    expect(btn.getAttribute('style')).toMatch(/#34D399|rgb\(52, 211, 153\)/i);
  });

  it('fires onClick when tapped', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StorePill label="Bells" color="#34D399" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /bells/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
