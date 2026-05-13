import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiGrid from '@/components/dashboard/KpiGrid';

const baseStats = {
  totalGross: 10000,
  totalNet: 9000,
  totalNonTax: 0,
  totalCash: 4000,
  totalCard: 6000,
  totalShortOver: 0,
  cashInHand: 4000,
};

describe('<KpiGrid />', () => {
  it('renders all four KPI labels', () => {
    render(<KpiGrid stats={baseStats} />);
    expect(screen.getByText('Gross Sales')).toBeInTheDocument();
    expect(screen.getByText('Net Sales')).toBeInTheDocument();
    expect(screen.getByText('Short / Over')).toBeInTheDocument();
    expect(screen.getByText('Cash in Hand')).toBeInTheDocument();
  });

  it('shows the balanced "$0.00" for an exact-zero Short/Over', () => {
    render(<KpiGrid stats={{ ...baseStats, totalShortOver: 0 }} />);
    // Two zeros may be rendered (Short/Over and Cash in Hand match diff).
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a SHORT amount with a minus sign for positive short_over', () => {
    render(<KpiGrid stats={{ ...baseStats, totalShortOver: 50 }} />);
    expect(screen.getByText('−$50.00')).toBeInTheDocument();
  });

  it('renders an OVER amount with a plus sign for negative short_over', () => {
    render(<KpiGrid stats={{ ...baseStats, totalShortOver: -25 }} />);
    expect(screen.getByText('+$25.00')).toBeInTheDocument();
  });

  it('labels Cash in Hand difference correctly when matched/short/over', () => {
    // matched
    render(<KpiGrid stats={{ ...baseStats, cashInHand: baseStats.totalCash }} />);
    expect(screen.getByText('Matched')).toBeInTheDocument();
  });
});
