import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the AuthProvider hook so we don't have to mount the real provider.
const mockSupabase = { from: vi.fn() };
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({ supabase: mockSupabase, isOwner: true }),
}));

import BuyingPacingCard from '@/components/BuyingPacingCard';

beforeEach(() => {
  mockSupabase.from.mockReset();
});

// Chainable stub for `supabase.from(table).select(...).order(...)` and
// `.gte(...).lte(...)` returning a Promise of { data }.
function makeFromFor(rowsByTable) {
  return (table) => {
    const data = rowsByTable[table] ?? [];
    const chain = {
      select: () => chain,
      order: () => Promise.resolve({ data }),
      gte: () => chain,
      lte: () => chain,
      then: (resolve) => Promise.resolve({ data }).then(resolve),
    };
    return chain;
  };
}

describe('<BuyingPacingCard />', () => {
  it('renders MTD numbers, target, and "Over target" flag when buying > target', async () => {
    mockSupabase.from.mockImplementation(makeFromFor({
      stores: [{ id: 'a', name: '7s Bells', color: '#fff', buying_target_pct: 50, is_active: true }],
      daily_sales: [{ store_id: 'a', total_sales: 1000 }],
      purchases: [{ store_id: 'a', total_cost: 700 }],
    }));
    render(<BuyingPacingCard />);
    await waitFor(() => expect(screen.getByText(/Buying vs Sales/i)).toBeInTheDocument());
    expect(screen.getByText('Sales (MTD)')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();   // sales
    expect(screen.getByText('$700.00')).toBeInTheDocument();     // buying
    // The "Over target" pill and the "Over target by" Stat label both render.
    expect(screen.getAllByText(/Over target/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders "On target" when buying is under the per-store target', async () => {
    mockSupabase.from.mockImplementation(makeFromFor({
      stores: [{ id: 'a', name: '7s Bells', color: '#fff', buying_target_pct: 50, is_active: true }],
      daily_sales: [{ store_id: 'a', total_sales: 1000 }],
      purchases: [{ store_id: 'a', total_cost: 200 }],
    }));
    render(<BuyingPacingCard />);
    await waitFor(() => expect(screen.getByText(/On target/i)).toBeInTheDocument());
  });

  it('renders per-store breakdown when there is more than one store', async () => {
    mockSupabase.from.mockImplementation(makeFromFor({
      stores: [
        { id: 'a', name: '7s Vape Love - Bells', color: '#fff', buying_target_pct: 50, is_active: true },
        { id: 'b', name: '7s Vape Love - Troup', color: '#fff', buying_target_pct: 50, is_active: true },
      ],
      daily_sales: [
        { store_id: 'a', total_sales: 1000 },
        { store_id: 'b', total_sales: 500 },
      ],
      purchases: [
        { store_id: 'a', total_cost: 300 },
        { store_id: 'b', total_cost: 100 },
      ],
    }));
    render(<BuyingPacingCard />);
    await waitFor(() => expect(screen.getByText('Bells')).toBeInTheDocument());
    expect(screen.getByText('Troup')).toBeInTheDocument();
  });
});
