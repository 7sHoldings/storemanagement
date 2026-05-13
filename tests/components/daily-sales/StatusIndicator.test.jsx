import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusIndicator from '@/components/daily-sales/shared/StatusIndicator';

describe('<StatusIndicator />', () => {
  it('renders the synced label in pill mode', () => {
    render(<StatusIndicator state="synced" variant="pill" />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('renders the warning label in pill mode', () => {
    render(<StatusIndicator state="warning" variant="pill" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('falls back to synced for an unknown state', () => {
    render(<StatusIndicator state="something-else" variant="pill" />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('renders the title attribute for hover tooltips', () => {
    const { container } = render(<StatusIndicator state="warning" variant="icon" title="R2 net mismatch" />);
    expect(container.querySelector('[title="R2 net mismatch"]')).not.toBeNull();
  });
});
