import clsx from 'clsx';

// ── Card ──
export function Card({ children, className, padding = 'md' }) {
  const pad = { sm: 'p-3', md: 'p-4', lg: 'p-6' }[padding] || 'p-4';
  return (
    <div className={clsx('bg-white border border-[var(--border-subtle)] rounded-xl', pad, className)}>
      {children}
    </div>
  );
}

// ── V2 Stat Card ──
export function V2StatCard({ label, value, sub, variant = 'default', icon, className }) {
  const valColor = {
    default: 'text-[var(--text-primary)]',
    success: 'text-[var(--color-success)]',
    danger: 'text-[var(--color-danger)]',
    warning: 'text-[var(--color-warning)]',
    info: 'text-[var(--color-info)]',
  }[variant] || 'text-[var(--text-primary)]';

  return (
    // `icon` is accepted for compatibility but no longer drawn: the cards
    // read as numbers first, without emoji decoration.
    <Card className={clsx('relative overflow-hidden !px-[18px] !py-4', className)}>
      <p className="text-[13px] text-[var(--text-secondary)] font-medium mb-2">{label}</p>
      <p className={clsx('text-[24px] font-semibold tracking-tight tabular-nums leading-tight', valColor)}>{value}</p>
      {sub && <div className="text-[12px] text-[var(--text-muted)] mt-1.5">{sub}</div>}
    </Card>
  );
}

// ── Badge ──
export function Badge({ children, variant = 'default', className }) {
  const styles = {
    default: 'bg-[var(--bg-hover)] text-[var(--text-secondary)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  }[variant] || '';

  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-semibold', styles, className)}>
      {children}
    </span>
  );
}

// ── V2 Alert ──
export function V2Alert({ children, type = 'info', className }) {
  const styles = {
    success: 'border-[var(--color-success)] bg-[var(--color-success-bg)] text-[var(--color-success)]',
    danger: 'border-[var(--color-danger)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    warning: 'border-[var(--color-warning)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    info: 'border-[var(--color-info)] bg-[var(--color-info-bg)] text-[var(--color-info)]',
  }[type] || '';

  return (
    <div className={clsx('rounded-lg border px-3.5 py-2.5 text-[13px] font-medium', styles, className)}>
      {children}
    </div>
  );
}

// ── Section Header ──
export function SectionHeader({ title, action, className }) {
  return (
    <div className={clsx('flex items-center justify-between mb-3', className)}>
      <h2 className="text-[var(--text-primary)] text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}
