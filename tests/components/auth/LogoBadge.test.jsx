import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LogoBadge from '@/components/auth/LogoBadge';

describe('<LogoBadge />', () => {
  it('renders the 7\'s VAPE ♥ LOVE brand wordmark', () => {
    render(<LogoBadge />);
    expect(screen.getByText("7's")).toBeInTheDocument();
    expect(screen.getByText('VAPE')).toBeInTheDocument();
    expect(screen.getByText('LOVE')).toBeInTheDocument();
    // The heart between VAPE and LOVE is rendered as aria-hidden.
    expect(screen.getByText('♥')).toBeInTheDocument();
  });
});
