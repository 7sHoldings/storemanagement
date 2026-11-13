'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, DollarSign, Coins, Receipt, ShoppingCart, BarChart3,
  MoreHorizontal, Plus, ChevronDown, LogOut, Settings, Boxes, X,
  Wallet, HandCoins, PieChart, Gamepad2, TrendingUp, ArrowLeftRight, History,
  Download, CreditCard, UserCheck, ScanBarcode, Users, Mail, Bot, RefreshCw, Zap,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import BrandLogo from '@/components/BrandLogo';

// ── Navigation map ───────────────────────────────────────────
// Owners: the six pages used every day are tabs; everything else lives in
// the "More" menu, grouped. Pages that are hidden today (/restock,
// /inventory, /invoices …) stay reachable by URL, as before.
const OWNER_TABS = [
  { path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/sales', label: 'Sales', Icon: DollarSign },
  { path: '/cash', label: 'Cash', Icon: Coins },
  { path: '/expenses', label: 'Expenses', Icon: Receipt },
  { path: '/purchases', label: 'Buying', Icon: ShoppingCart },
  { path: '/reports', label: 'Reports', Icon: BarChart3 },
];

export const OWNER_MORE = [
  { title: 'Money', items: [
    { path: '/money', label: 'Money overview', desc: 'Where cash came from and went', Icon: Wallet },
    { path: '/profit-takeout', label: 'Profit take-out', desc: 'Cash and card pulled out', Icon: HandCoins },
    { path: '/shares', label: 'Shares', desc: 'Shareholder split and payouts', Icon: PieChart },
    { path: '/game-machines', label: 'Game machines', desc: 'Machine cash collections', Icon: Gamepad2 },
  ] },
  { title: 'Insights', items: [
    { path: '/trends', label: 'Trends', desc: 'Buying vs sales by week', Icon: TrendingUp },
    { path: '/compare', label: 'Compare stores', desc: 'Side-by-side performance', Icon: ArrowLeftRight },
    { path: '/activity', label: 'Activity log', desc: 'Who changed what, and when', Icon: History },
    { path: '/exports', label: 'Export data', desc: 'Download CSV files', Icon: Download },
  ] },
  { title: 'Team & store', items: [
    { path: '/house-accounts', label: 'House accounts', desc: 'What employees owe', Icon: CreditCard },
    { path: '/employee-tracking', label: 'Employees', desc: 'Shifts, hours, short/over', Icon: UserCheck },
    { path: '/pricebook', label: 'Pricebook', desc: 'Prices on the registers', Icon: ScanBarcode },
  ] },
];

// Admin and technical pages — rarely needed day to day, so they live in the
// account menu instead of the main navigation.
export const OWNER_ADMIN = [
  { path: '/team', label: 'Users', Icon: Users },
  { path: '/settings', label: 'Store settings', Icon: Settings },
  { path: '/email', label: 'Email reports', Icon: Mail },
  { path: '/nrs-sync-history', label: '7S Agent logs', Icon: Bot },
  { path: '/cron-setup', label: '7S Agent setup', Icon: RefreshCw },
  { path: '/nrs-backfill', label: 'NRS backfill', Icon: Zap },
];

const EMPLOYEE_TABS = [
  { path: '/sales', label: 'Enter Sales', Icon: DollarSign },
  { path: '/stock-count', label: 'Stock Count', Icon: Boxes },
];

const isActive = (pathname, path) => pathname === path || pathname?.startsWith(path + '/');
const shortName = (name) => name?.split(' - ').pop()?.trim() || name;

// Closes a popover on outside click / Escape.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

function StoreSelect({ stores, value, onChange, className = '' }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Store"
      className={`!w-auto !min-h-0 !h-9 !py-0 !pl-3 !pr-8 !text-[13px] font-medium cursor-pointer ${className}`}
    >
      <option value="">All stores</option>
      {stores.map((s) => <option key={s.id} value={s.id}>{shortName(s.name)}</option>)}
    </select>
  );
}

function UserMenu({ name, email, role, initial, onSignOut, isOwner }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-full bg-[#18181B] text-white text-[12px] font-semibold flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A21CAF] focus-visible:ring-offset-2"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[#E4E4E7] bg-white shadow-lg py-2 z-50">
          <div className="px-4 py-2 border-b border-[#F0F0F2] mb-1">
            <div className="text-[14px] font-semibold text-[#18181B] truncate">{name}</div>
            {email && email !== name && <div className="text-[12px] text-[#71717A] truncate">{email}</div>}
            {role && <div className="text-[12px] text-[#71717A] capitalize mt-0.5">{role}</div>}
          </div>
          {isOwner && (
            <div className="py-1 border-b border-[#F0F0F2] mb-1">
              <div className="px-4 pt-1 pb-1.5 text-[12px] font-semibold text-[#71717A]">Admin &amp; settings</div>
              {OWNER_ADMIN.map((a) => (
                <Link key={a.path} href={a.path} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-[14px] text-[#3F3F46] hover:bg-[#F4F4F5]">
                  <a.Icon size={16} strokeWidth={1.75} className="text-[#71717A]" /> {a.label}
                </Link>
              ))}
            </div>
          )}
          <button type="button" onClick={() => { setOpen(false); onSignOut(); }} className="w-full flex items-center gap-2.5 px-4 py-2 text-[14px] text-[#B91C1C] hover:bg-[#FEF2F2]">
            <LogOut size={16} strokeWidth={1.75} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopNav({ selectedStore, onStoreChange }) {
  const { profile, user, signOut, isOwner, supabase } = useAuth();
  const pathname = usePathname();
  const [stores, setStores] = useState([]);
  const more = usePopover();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    supabase.from('stores').select('*').order('created_at').then(({ data }) => setStores(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close menus on navigation.
  useEffect(() => { more.setOpen(false); setSheetOpen(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);

  const tabs = isOwner ? OWNER_TABS : EMPLOYEE_TABS;
  const moreActive = isOwner && OWNER_MORE.some((g) => g.items.some((i) => isActive(pathname, i.path)));
  const adminActive = isOwner && OWNER_ADMIN.some((a) => isActive(pathname, a.path));
  const name = profile?.name || user?.email || '';
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const myStore = stores.find((s) => s.id === profile?.store_id)?.name;

  const tabClass = (on) =>
    `flex items-center h-16 px-3 text-[14px] border-b-2 transition-colors focus-visible:outline-none focus-visible:bg-[#F4F4F5] ${
      on ? 'font-semibold text-[#18181B] border-[#A21CAF]' : 'font-medium text-[#52525B] border-transparent hover:text-[#18181B]'
    }`;

  return (
    <>
      {/* ── Desktop top bar ─────────────────────────────── */}
      <header className="hidden md:block sticky top-0 z-40 bg-white border-b border-[#E4E4E7]">
        <div className="max-w-[1360px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href={isOwner ? '/dashboard' : '/sales'} aria-label="7's Vape Love home" className="shrink-0">
            <BrandLogo />
          </Link>
          <nav aria-label="Main" className="flex items-stretch gap-1 flex-1 min-w-0">
            {tabs.map((t) => (
              <Link key={t.path} href={t.path} aria-current={isActive(pathname, t.path) ? 'page' : undefined} className={tabClass(isActive(pathname, t.path))}>
                {t.label}
              </Link>
            ))}
            {isOwner && (
              <div className="relative flex" ref={more.ref}>
                <button
                  type="button"
                  onClick={() => more.setOpen((o) => !o)}
                  aria-expanded={more.open}
                  className={`${tabClass(moreActive)} gap-1`}
                >
                  More <ChevronDown size={14} strokeWidth={2} />
                </button>
                {more.open && (
                  <div className="absolute left-0 top-full mt-1 w-[720px] max-w-[calc(100vw-2rem)] rounded-xl border border-[#E4E4E7] bg-white shadow-lg p-3 z-50 grid grid-cols-3 gap-2">
                    {OWNER_MORE.map((g) => (
                      <div key={g.title} className="flex flex-col">
                        <div className="text-[12px] font-semibold text-[#71717A] px-2.5 pt-1 pb-2">{g.title}</div>
                        {g.items.map((i) => {
                          const on = isActive(pathname, i.path);
                          return (
                            <Link
                              key={i.path}
                              href={i.path}
                              onClick={() => more.setOpen(false)}
                              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg ${on ? 'bg-[#FAE8FF]' : 'hover:bg-[#F4F4F5]'}`}
                            >
                              <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-white text-[#A21CAF]' : 'bg-[#F4F4F5] text-[#52525B]'}`}>
                                <i.Icon size={16} strokeWidth={1.75} />
                              </span>
                              <span className="flex flex-col min-w-0">
                                <span className={`text-[14px] ${on ? 'font-semibold text-[#86198F]' : 'font-medium text-[#18181B]'}`}>{i.label}</span>
                                <span className="text-[12px] text-[#71717A] leading-snug">{i.desc}</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            {isOwner && stores.length > 0 && <StoreSelect stores={stores} value={selectedStore} onChange={onStoreChange} />}
            {!isOwner && myStore && <span className="text-[13px] font-medium text-[#52525B]">{shortName(myStore)}</span>}
            <UserMenu name={name} email={user?.email} role={profile?.role} initial={initial} onSignOut={signOut} isOwner={isOwner} />
          </div>
        </div>
      </header>

      {/* ── Phone header ────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-40 bg-white border-b border-[#E4E4E7] pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <Link href={isOwner ? '/dashboard' : '/sales'} aria-label="7's Vape Love home"><BrandLogo /></Link>
          <div className="flex items-center gap-2 min-w-0">
            {isOwner && stores.length > 0 && <StoreSelect stores={stores} value={selectedStore} onChange={onStoreChange} className="max-w-[140px]" />}
            {!isOwner && myStore && <span className="text-[13px] font-medium text-[#52525B] truncate">{shortName(myStore)}</span>}
            <UserMenu name={name} email={user?.email} role={profile?.role} initial={initial} onSignOut={signOut} isOwner={isOwner} />
          </div>
        </div>
      </header>

      {/* ── Phone bottom tab bar ────────────────────────── */}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E4E4E7] pb-[env(safe-area-inset-bottom)]">
        <div className="h-[64px] flex items-center justify-around px-2">
          {isOwner ? (
            <>
              <BottomTab href="/dashboard" label="Home" Icon={LayoutDashboard} on={isActive(pathname, '/dashboard')} />
              <BottomTab href="/sales" label="Sales" Icon={DollarSign} on={isActive(pathname, '/sales')} />
              <Link href="/sales?new=1" aria-label="Enter sales" className="-mt-6 w-[52px] h-[52px] rounded-full bg-[#A21CAF] text-white flex items-center justify-center shadow-[0_6px_16px_rgba(162,28,175,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A21CAF] focus-visible:ring-offset-2">
                <Plus size={24} strokeWidth={2.4} />
              </Link>
              <BottomTab href="/cash" label="Cash" Icon={Coins} on={isActive(pathname, '/cash')} />
              <button type="button" onClick={() => setSheetOpen(true)} className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] text-[12px] ${sheetOpen ? 'text-[#A21CAF] font-semibold' : 'text-[#71717A] font-medium'}`}>
                <MoreHorizontal size={22} strokeWidth={1.9} />
                More
              </button>
            </>
          ) : (
            <>
              {EMPLOYEE_TABS.map((t) => <BottomTab key={t.path} href={t.path} label={t.label} Icon={t.Icon} on={isActive(pathname, t.path)} />)}
              <button type="button" onClick={signOut} className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] text-[12px] font-medium text-[#B91C1C]">
                <LogOut size={22} strokeWidth={1.9} />
                Sign out
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Phone "More" sheet ──────────────────────────── */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="More pages">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="relative w-full bg-white rounded-t-2xl max-h-[80vh] overflow-auto pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#F0F0F2]">
              <span className="text-[16px] font-semibold text-[#18181B]">More</span>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className="w-10 h-10 -mr-2 flex items-center justify-center text-[#71717A]"><X size={20} /></button>
            </div>
            <div className="px-5 pt-3 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {OWNER_TABS.filter((t) => !['/dashboard', '/sales', '/cash'].includes(t.path)).map((t) => (
                  <Link key={t.path} href={t.path} className={`flex items-center gap-2 px-3 h-12 rounded-lg border text-[14px] ${isActive(pathname, t.path) ? 'border-[#E9C4EE] bg-[#FAE8FF] text-[#86198F] font-semibold' : 'border-[#E4E4E7] text-[#18181B] font-medium'}`}>
                    <t.Icon size={18} strokeWidth={1.75} /> {t.label}
                  </Link>
                ))}
              </div>
              {[...OWNER_MORE, { title: 'Admin & settings', items: OWNER_ADMIN }].map((g) => (
                <div key={g.title}>
                  <div className="text-[12px] font-semibold text-[#71717A] mb-1">{g.title}</div>
                  <div className="flex flex-col">
                    {g.items.map((i) => (
                      <Link key={i.path} href={i.path} className={`flex items-center gap-3 py-2.5 text-[15px] border-b border-[#F4F4F5] ${isActive(pathname, i.path) ? 'text-[#A21CAF] font-semibold' : 'text-[#18181B]'}`}>
                        <i.Icon size={18} strokeWidth={1.75} className="text-[#71717A] shrink-0" />
                        {i.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => { setSheetOpen(false); signOut(); }} className="flex items-center justify-center gap-2 h-12 rounded-lg border border-[#FECACA] text-[#B91C1C] text-[14px] font-semibold">
                <LogOut size={18} strokeWidth={1.75} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BottomTab({ href, label, Icon, on }) {
  return (
    <Link href={href} aria-current={on ? 'page' : undefined} className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] text-[12px] ${on ? 'text-[#A21CAF] font-semibold' : 'text-[#71717A] font-medium'}`}>
      <Icon size={22} strokeWidth={1.9} />
      {label}
    </Link>
  );
}
