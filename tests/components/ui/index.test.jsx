import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, V2StatCard, Badge, V2Alert, SectionHeader } from '@/components/ui';

describe('<Card />', () => {
  it('renders children', () => {
    render(<Card>hello</Card>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
  it('uses padding prop variants', () => {
    const { container } = render(<Card padding="lg">x</Card>);
    expect(container.firstChild.className).toContain('p-6');
  });
});

describe('<V2StatCard />', () => {
  it('renders label / value / sub / icon', () => {
    render(<V2StatCard label="Total" value="$100.00" sub="last week" icon="💰" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('last week')).toBeInTheDocument();
    expect(screen.getByText('💰')).toBeInTheDocument();
  });
  it('color-codes the value by variant', () => {
    const { container } = render(<V2StatCard label="X" value="1" variant="success" />);
    expect(container.innerHTML).toContain('--color-success');
  });
});

describe('<Badge />', () => {
  it('renders the text', () => {
    render(<Badge>NEW</Badge>);
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });
  it('applies variant classes', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    expect(container.innerHTML).toContain('--color-success');
  });
});

describe('<V2Alert />', () => {
  it('renders the message and type styling', () => {
    const { container } = render(<V2Alert type="danger">Something broke</V2Alert>);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
    expect(container.innerHTML).toContain('--color-danger');
  });
});

describe('<SectionHeader />', () => {
  it('renders the title and an optional action', () => {
    render(<SectionHeader title="Reports" action={<span>filter</span>} />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('filter')).toBeInTheDocument();
  });
});
