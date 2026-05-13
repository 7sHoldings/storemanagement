import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StorePills } from '@/components/UI';

const stores = [
  { id: 'a', name: '7s Vape Love - Bells', color: '#34D399' },
  { id: 'b', name: '7s Vape Love - Troup', color: '#FF1493' },
];

describe('<StorePills />', () => {
  it('renders "All Stores" + each store pill', () => {
    render(<StorePills stores={stores} value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'All Stores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bells/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Troup/i })).toBeInTheDocument();
  });

  it('hides the All Stores button when showAll={false}', () => {
    render(<StorePills stores={stores} value="" onChange={() => {}} showAll={false} />);
    expect(screen.queryByRole('button', { name: 'All Stores' })).not.toBeInTheDocument();
  });

  it('fires onChange("") when All Stores is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StorePills stores={stores} value="a" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'All Stores' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('fires onChange(id) on a fresh pick and onChange("") when clicking the active pill again', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = render(<StorePills stores={stores} value="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Bells/i }));
    expect(onChange).toHaveBeenLastCalledWith('a');

    rerender(<StorePills stores={stores} value="a" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Bells/i }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
