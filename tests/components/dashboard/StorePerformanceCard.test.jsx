import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorePerformanceCard from '@/components/dashboard/StorePerformanceCard';

const stores = [
  { id: 'a', name: 'Bells', color: '#34D399', revenue: 1000, profit: 200, margin: 50 },
  { id: 'b', name: 'Troup', color: '#FF1493', revenue: 500,  profit: -50, margin: -10 },
];

describe('<StorePerformanceCard />', () => {
  it('renders all store names + revenue / profit / margin', () => {
    render(<StorePerformanceCard stores={stores} storeSort="revenue" onSortChange={() => {}} />);
    expect(screen.getByText('Bells')).toBeInTheDocument();
    expect(screen.getByText('Troup')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('fires onSortChange when a new sort is picked', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StorePerformanceCard stores={stores} storeSort="revenue" onSortChange={onSortChange} />);
    await user.selectOptions(screen.getByLabelText(/sort stores by/i), 'margin');
    expect(onSortChange).toHaveBeenCalledWith('margin');
  });

  it('shows a trophy in the first row only', () => {
    const { container } = render(<StorePerformanceCard stores={stores} storeSort="revenue" onSortChange={() => {}} />);
    // The trophy icon is a lucide <svg class="lucide lucide-trophy ...">
    expect(container.querySelectorAll('svg.lucide-trophy').length).toBe(1);
  });
});
