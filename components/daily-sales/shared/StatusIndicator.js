'use client';
import { Check, AlertTriangle } from 'lucide-react';

// Sync/warning indicator. State is derived by the caller from the existing
// per-row check (has_register2 + R2-net-vs-canceled-basket) — no new logic.
// The current data only ever produces "synced" or "warning"; there is no
// "danger" state in the source data.
const CFG = {
  synced:  { bg: '#F0FDF4', color: '#15803D', Icon: Check,         label: 'Synced' },
  warning: { bg: '#FFFBEB', color: '#B45309', Icon: AlertTriangle, label: 'Warning' },
};

export default function StatusIndicator({ state = 'synced', variant = 'icon', title }) {
  const c = CFG[state] || CFG.synced;
  const Icon = c.Icon;
  if (variant === 'pill') {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: c.bg, color: c.color }} title={title}>
        <Icon size={11} strokeWidth={2.25} />{c.label}
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded" style={{ background: c.bg, color: c.color }} title={title}>
      <Icon size={12} strokeWidth={2.5} />
    </span>
  );
}
