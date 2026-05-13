import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardFilters from '@/components/dashboard/DashboardFilters';

const stores = [
  { id: 'a', name: '7s Vape Love - Bells', color: '#34D399' },
  { id: 'b', name: '7s Vape Love - Troup', color: '#FF1493' },
];

const base = {
  stores,
  selectedStore: '',
  onStoreChange: () => {},
  preset: 'thisweek',
  onPreset: () => {},
  rangeStart: '2026-05-11',
  rangeEnd: '2026-05-17',
  onStartChange: () => {},
  onEndChange: () => {},
};

describe('<DashboardFilters />', () => {
  it('renders the All Stores + per-store pills and a preset row', () => {
    render(<DashboardFilters {...base} />);
    expect(screen.getByRole('button', { name: 'All Stores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bells/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Troup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yesterday' })).toBeInTheDocument();
  });

  it('uses the brand-green active state on All Stores when nothing is selected', () => {
    render(<DashboardFilters {...base} />);
    const all = screen.getByRole('button', { name: 'All Stores' });
    expect(all.getAttribute('style')).toMatch(/#39FF14|rgb\(57, 255, 20\)/i);
  });

  it('fires onStoreChange("") when All Stores is clicked', async () => {
    const onStoreChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DashboardFilters {...base} selectedStore="a" onStoreChange={onStoreChange} />);
    await user.click(screen.getByRole('button', { name: 'All Stores' }));
    expect(onStoreChange).toHaveBeenCalledWith('');
  });

  it('fires onStoreChange(id) when a store pill is clicked', async () => {
    const onStoreChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DashboardFilters {...base} onStoreChange={onStoreChange} />);
    await user.click(screen.getByRole('button', { name: /Bells/i }));
    expect(onStoreChange).toHaveBeenCalledWith('a');
  });

  it('clicking the active store pill again clears the selection', async () => {
    const onStoreChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DashboardFilters {...base} selectedStore="a" onStoreChange={onStoreChange} />);
    await user.click(screen.getByRole('button', { name: /Bells/i }));
    expect(onStoreChange).toHaveBeenCalledWith('');
  });
});
