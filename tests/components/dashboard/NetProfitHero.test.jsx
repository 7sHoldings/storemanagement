import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NetProfitHero from '@/components/dashboard/NetProfitHero';

const baseProps = {
  margin: 22,
  projectedNet: 1000,
  monthProgressPct: 39,
  daysLeft: 19,
  monthName: 'May',
  periodLabel: 'This Week',
};

describe('<NetProfitHero />', () => {
  it('renders the period label, headline, and progress copy', () => {
    render(<NetProfitHero {...baseProps} netProfit={1234.56} />);
    expect(screen.getByText(/Net Profit · This Week/i)).toBeInTheDocument();
    expect(screen.getByText(/22\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/39% through May/i)).toBeInTheDocument();
    expect(screen.getAllByText(/19 days left/i)[0]).toBeInTheDocument();
  });

  it('renders a positive amount in the success color (green) with no leading minus', () => {
    render(<NetProfitHero {...baseProps} netProfit={1234.56} />);
    const amount = screen.getByText(/^\$1,234\.56$/);
    expect(amount.getAttribute('style')).toMatch(/#39FF14|rgb\(57, 255, 20\)/i);
  });

  it('renders a negative amount with a minus and the danger color (red)', () => {
    render(<NetProfitHero {...baseProps} netProfit={-50.5} margin={-10} />);
    expect(screen.getByText(/^−\$50\.50$/)).toBeInTheDocument();
    const big = screen.getByText(/^−\$50\.50$/);
    expect(big.getAttribute('style')).toMatch(/#E24B4A|rgb\(226, 75, 74\)/i);
  });
});
