import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiCard from '@/components/dashboard/shared/KpiCard';

describe('<KpiCard />', () => {
  it('renders the label and value', () => {
    render(<KpiCard label="Total Sales" value="$1,234.00" />);
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText('$1,234.00')).toBeInTheDocument();
  });

  it('renders the breakdown rows when provided', () => {
    render(
      <KpiCard
        label="Gross Sales"
        value="$1,000.00"
        breakdown={[
          { label: 'Cash', value: '$600.00' },
          { label: 'Card', value: '$400.00' },
        ]}
      />
    );
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
  });

  it('does not render a breakdown container when none is given', () => {
    const { container } = render(<KpiCard label="Net" value="$0.00" />);
    // Two children when no breakdown: the top row (label + icon) and the value <span>.
    expect(container.firstChild.children).toHaveLength(2);
  });
});
