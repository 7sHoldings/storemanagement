'use client';
import { DollarSign, FileText, Landmark, Clock, Bot, ShoppingCart } from 'lucide-react';

// Labels and hrefs are unchanged from the old Quick Actions grid — only the
// icons (now lucide) and styling changed. `onNavigate` is the same router.push.
const ACTIONS = [
  { label: 'Daily Sales',       href: '/sales',             Icon: DollarSign,   color: '#39FF14' },
  { label: 'P&L Report',        href: '/reports',           Icon: FileText,     color: '#7F77DD' },
  { label: 'Cash Collection',   href: '/cash',              Icon: Landmark,     color: '#FF1493' },
  { label: 'Employee Tracking', href: '/employee-tracking', Icon: Clock,        color: '#39FF14' },
  { label: 'Sync NRS',          href: '/nrs-sync-history',  Icon: Bot,          color: '#7F77DD' },
  { label: 'Inventory Report',  href: '/nrs-backfill',      Icon: ShoppingCart, color: '#FF1493' },
];

export default function QuickActionsRow({ onNavigate }) {
  return (
    <div className="mb-2">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[14px] font-medium text-white">Quick Actions</h3>
        <span className="text-[11px] text-[#5F5E5A]">Most used</span>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {ACTIONS.map(a => (
          <button
            key={a.href}
            type="button"
            onClick={() => onNavigate(a.href)}
            className="flex flex-col items-center gap-1.5 rounded-[10px] border border-[#2C2C2A] bg-[#0A0A0A] px-2 py-3 transition-colors hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: a.color + '1f' }}>
              <a.Icon size={16} strokeWidth={1.75} style={{ color: a.color }} />
            </span>
            <span className="text-center text-[11px] font-medium leading-tight text-white">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
