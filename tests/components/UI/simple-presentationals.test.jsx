import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Button, Field, EmptyState, Loading, Alert, StoreBadge,
  PageHeader, StatCard, SortDropdown,
} from '@/components/UI';

describe('<Button />', () => {
  it('renders children and fires onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalled();
  });
  it('honours variant + disabled', () => {
    render(<Button variant="secondary" disabled>x</Button>);
    expect(screen.getByRole('button', { name: 'x' })).toBeDisabled();
  });
});

describe('<Field />', () => {
  it('renders the label and child input', () => {
    render(<Field label="Email"><input data-testid="i" /></Field>);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByTestId('i')).toBeInTheDocument();
  });
});

describe('<EmptyState />', () => {
  it('renders the title + message + action', () => {
    render(<EmptyState title="Nothing" message="Try filter" action={<button>Reset</button>} />);
    expect(screen.getByText('Nothing')).toBeInTheDocument();
    expect(screen.getByText('Try filter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});

describe('<Loading />', () => {
  it('renders the default and a custom label', () => {
    render(<Loading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    render(<Loading text="Crunching numbers" />);
    expect(screen.getByText('Crunching numbers')).toBeInTheDocument();
  });
});

describe('<Alert />', () => {
  it('renders the message and the type-specific styling', () => {
    const { container } = render(<Alert type="error">oops</Alert>);
    expect(screen.getByText('oops')).toBeInTheDocument();
    expect(container.firstChild.className).toContain('bg-sw-redD');
  });
});

describe('<StoreBadge />', () => {
  it('renders the colored dot + store name', () => {
    const { container } = render(<StoreBadge name="Bells" color="#FF1493" />);
    expect(screen.getByText('Bells')).toBeInTheDocument();
    expect(container.querySelector('span[style*="rgb(255, 20, 147)"]')).not.toBeNull();
  });
});

describe('<PageHeader />', () => {
  it('renders the title, optional subtitle, and an action area', () => {
    render(<PageHeader title="Daily Sales" subtitle="All Stores">{<button>CSV</button>}</PageHeader>);
    expect(screen.getByRole('heading', { name: /daily sales/i })).toBeInTheDocument();
    expect(screen.getByText('All Stores')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
  });
});

describe('<StatCard />', () => {
  it('renders label/value/sub/icon and honours color override', () => {
    const { container } = render(<StatCard label="Total" value="$1.00" sub="today" icon="💰" color="#39FF14" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$1.00')).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
    expect(screen.getByText('💰')).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/#39FF14|rgb\(57, 255, 20\)/i);
  });
});

describe('<SortDropdown />', () => {
  const options = [
    { label: 'Date (newest)', key: 'date', dir: 'desc' },
    { label: 'Total (high)',  key: 'total_sales', dir: 'desc' },
  ];

  it('reflects the current selection in the underlying <select>', () => {
    render(<SortDropdown options={options} value={options[0]} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('0');
  });

  it('fires onChange with the matching option when the user picks a new value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SortDropdown options={options} value={options[0]} onChange={onChange} />);
    await user.selectOptions(screen.getByRole('combobox'), '1');
    expect(onChange).toHaveBeenCalledWith({ key: 'total_sales', dir: 'desc' });
  });
});
