import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// TrendChart is a SVG-heavy component already tested elsewhere; stub it
// to a passthrough so this card's wrapper logic is what we're asserting.
vi.mock('@/components/UI', async () => {
  const actual = await vi.importActual('@/components/UI');
  return {
    ...actual,
    TrendChart: ({ data }) => <div data-testid="chart">{data.length} weeks</div>,
  };
});

import WeeklyChartCard from '@/components/dashboard/WeeklyChartCard';

const trends = [
  { week: '2026-05-04', sales: 100, purchases: 50, label: 'May 4 – 10' },
  { week: '2026-05-11', sales: 250, purchases: 100, label: 'May 11 – 17' },
];

describe('<WeeklyChartCard />', () => {
  it('renders the header + Sales / Purchases totals from the trends array', () => {
    render(<WeeklyChartCard trends={trends} rangeStart="2026-05-04" rangeEnd="2026-05-17" />);
    expect(screen.getByRole('heading', { name: /Weekly Sales vs Purchases/i })).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Purchases')).toBeInTheDocument();
    expect(screen.getByText('$350.00')).toBeInTheDocument(); // 100 + 250
    expect(screen.getByText('$150.00')).toBeInTheDocument(); // 50 + 100
  });

  it('renders a Monday-Sunday subtitle with formatted dates', () => {
    render(<WeeklyChartCard trends={trends} rangeStart="2026-05-04" rangeEnd="2026-05-17" />);
    expect(screen.getByText(/Monday–Sunday weeks · May 4 – May 17/i)).toBeInTheDocument();
  });

  it('renders the chart child', () => {
    render(<WeeklyChartCard trends={trends} rangeStart="2026-05-04" rangeEnd="2026-05-17" />);
    expect(screen.getByTestId('chart')).toHaveTextContent('2 weeks');
  });

  it('renders the Payment Mix mini when a paymentMix is provided', () => {
    render(<WeeklyChartCard
      trends={trends}
      rangeStart="2026-05-04" rangeEnd="2026-05-17"
      paymentMix={{ cash: 300, card: 700, cashPct: '30', cardPct: '70' }}
    />);
    expect(screen.getByText('Payment Mix')).toBeInTheDocument();
    expect(screen.getByText(/Card 70%/i)).toBeInTheDocument();
    expect(screen.getByText(/Cash 30%/i)).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument(); // center label = 300 + 700
  });
});
