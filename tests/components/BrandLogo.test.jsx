import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandLogo from '@/components/BrandLogo';

describe('<BrandLogo />', () => {
  it("names the shop for screen readers", () => {
    render(<BrandLogo />);
    expect(screen.getByRole('img', { name: "7's Vape Love" })).toBeInTheDocument();
  });

  it('shows the VAPOR · CBD · KRATOM line only on the large sign', () => {
    const { rerender } = render(<BrandLogo />);
    expect(screen.queryByText(/KRATOM/)).not.toBeInTheDocument();
    rerender(<BrandLogo size="lg" />);
    expect(screen.getByText(/KRATOM/)).toBeInTheDocument();
  });
});
