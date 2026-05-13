import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DailySalesKpis from '@/components/daily-sales/DailySalesKpis';

describe('<DailySalesKpis />', () => {
  it('renders all four KPI labels with the values passed in', () => {
    render(<DailySalesKpis
      totalSales="$3,759.26"
      entries={5}
      avgPerDay="$751.85"
      agentCount={5}
      agentTotal={5}
      agentNote="All auto-synced"
      allSynced
    />);
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText('$3,759.26')).toBeInTheDocument();
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Avg / Day')).toBeInTheDocument();
    expect(screen.getByText('$751.85')).toBeInTheDocument();
    expect(screen.getByText('7S Agent')).toBeInTheDocument();
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByText('All auto-synced')).toBeInTheDocument();
  });

  it('renders the "manual" subtitle in muted color when not all are synced', () => {
    render(<DailySalesKpis
      totalSales="$0.00" entries={3} avgPerDay="$0.00"
      agentCount={2} agentTotal={3} agentNote="1 manual" allSynced={false}
    />);
    expect(screen.getByText('1 manual')).toBeInTheDocument();
  });
});
