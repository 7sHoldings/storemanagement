import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntriesCardList from '@/components/daily-sales/EntriesCardList';

const stores = [{ id: 'a', name: '7s Vape Love - Bells', color: '#fff', has_register2: false }];
const getStatus = () => ({ state: 'synced', title: '' });

describe('<EntriesCardList />', () => {
  it('shows "No data" when the entries array is empty', () => {
    render(<EntriesCardList entries={[]} stores={stores} getStatus={getStatus} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it('renders a totals card summarising Gross / Total / Diff / S/O', () => {
    const entries = [
      { id: 'r1', date: '2026-05-12', store_id: 'a', stores: stores[0], total_sales: 1000, gross_sales: 1100, cash_sales: 500, card_sales: 500, short_over: 0 },
      { id: 'r2', date: '2026-05-11', store_id: 'a', stores: stores[0], total_sales: 800,  gross_sales: 900,  cash_sales: 400, card_sales: 400, short_over: 50 },
    ];
    render(<EntriesCardList entries={entries} stores={stores} getStatus={getStatus} />);
    // Totals = Gross 2000, Total 1800, S/O 50 (positive → red minus prefix).
    expect(screen.getByText(/Totals \(2 entries\)/i)).toBeInTheDocument();
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();    // Gross total
    expect(screen.getByText('$1,800.00')).toBeInTheDocument();    // Total total
    expect(screen.getByText('−$50.00')).toBeInTheDocument();      // S/O total (positive = SHORT, red, leading −)
  });

  it('uses singular "entry" wording for a single row', () => {
    const e = [{ id: 'r1', date: '2026-05-12', store_id: 'a', stores: stores[0], total_sales: 100, gross_sales: 100, cash_sales: 100, card_sales: 0, short_over: 0 }];
    render(<EntriesCardList entries={e} stores={stores} getStatus={getStatus} />);
    expect(screen.getByText(/Totals \(1 entry\)/i)).toBeInTheDocument();
  });
});
