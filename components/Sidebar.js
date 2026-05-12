'use client';
import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard, TrendingUp, DollarSign, Coins, ShoppingCart, PackagePlus,
  FileText, CreditCard, Boxes, BarChart3, ArrowLeftRight, History, Download,
  UserCheck, UserCog, Mail, Zap, Bot, RefreshCw, Settings, Tag, Gamepad2,
  LogOut, MoreHorizontal,
} from 'lucide-react';

/* ── Icon set ─────────────────────────────────────────────
   lucide-react icons, 16px, 1.75 stroke. Kept in one map so
   the nav data below stays compact and visually consistent. */
const ICON_PROPS = { size: 16, strokeWidth: 1.75, className: 'shrink-0' };
const I = {
  dashboard: <LayoutDashboard {...ICON_PROPS} />,
  trends:    <TrendingUp {...ICON_PROPS} />,
  sales:     <DollarSign {...ICON_PROPS} />,
  cash:      <Coins {...ICON_PROPS} />,
  cart:      <ShoppingCart {...ICON_PROPS} />,
  restock:   <PackagePlus {...ICON_PROPS} />,
  invoice:   <FileText {...ICON_PROPS} />,
  expense:   <CreditCard {...ICON_PROPS} />,
  inventory: <Boxes {...ICON_PROPS} />,
  pl:        <BarChart3 {...ICON_PROPS} />,
  compare:   <ArrowLeftRight {...ICON_PROPS} />,
  activity:  <History {...ICON_PROPS} />,
  export:    <Download {...ICON_PROPS} />,
  employee:  <UserCheck {...ICON_PROPS} />,
  admin:     <UserCog {...ICON_PROPS} />,
  mail:      <Mail {...ICON_PROPS} />,
  zap:       <Zap {...ICON_PROPS} />,
  bot:       <Bot {...ICON_PROPS} />,
  refresh:   <RefreshCw {...ICON_PROPS} />,
  settings:  <Settings {...ICON_PROPS} />,
  tag:       <Tag {...ICON_PROPS} />,
  game:      <Gamepad2 {...ICON_PROPS} />,
  logout:    <LogOut {...ICON_PROPS} />,
  more:      <MoreHorizontal {...ICON_PROPS} />,
};

export default function Sidebar({ selectedStore, onStoreChange }) {
  const { profile, user, signOut, isOwner, supabase } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    supabase.from('stores').select('*').order('created_at').then(({ data }) => setStores(data || []));
  }, []);

  // Grouped navigation for owner — mirrors the mockup's section layout.
  const sections = isOwner ? [
    { title: 'Overview', items: [
      { path: '/dashboard', icon: I.dashboard, label: 'Dashboard' },
      { path: '/trends',    icon: I.trends,    label: 'Trends' },
    ]},
    { title: 'Operations', items: [
      { path: '/sales',      icon: I.sales,     label: 'Daily Sales' },
      { path: '/cash',       icon: I.cash,      label: 'Cash Collection' },
      { path: '/game-machines', icon: I.game,   label: 'Game Machines' },
      { path: '/purchases',  icon: I.cart,      label: 'Product Buying' },
      { path: '/restock',    icon: I.restock,   label: 'Restock' },
      { path: '/invoices',   icon: I.invoice,   label: 'Invoices' },
      { path: '/expenses',   icon: I.expense,   label: 'Expenses' },
      { path: '/inventory',  icon: I.inventory, label: 'Inventory' },
      { path: '/warehouse-prices', icon: I.tag,  label: 'Warehouse Prices' },
    ]},
    { title: 'Reports', items: [
      { path: '/reports',  icon: I.pl,       label: 'P&L Report' },
      { path: '/compare',  icon: I.compare,  label: 'Compare Stores' },
      { path: '/activity', icon: I.activity, label: 'Activity Log' },
      { path: '/exports',  icon: I.export,   label: 'Export Data' },
    ]},
    { title: 'Management', items: [
      { path: '/employee-tracking', icon: I.employee, label: 'Employee Tracking' },
      { path: '/profit-takeout',    icon: I.cash,     label: 'Profit Take Out' },
      { path: '/shares',            icon: I.tag,      label: 'Shares' },
      { path: '/team',              icon: I.admin,    label: 'Admin' },
      { path: '/email',             icon: I.mail,     label: 'Email Reports' },
    ]},
    { title: 'System', items: [
      { path: '/nrs-backfill',      icon: I.zap,      label: 'NRS Backfill' },
      { path: '/nrs-sync-history',  icon: I.bot,      label: '7S Agent Logs' },
      { path: '/cron-setup',        icon: I.refresh,  label: '7S Agent Setup' },
      { path: '/settings',          icon: I.settings, label: 'Settings' },
    ]},
  ] : [
    { title: null, items: [
      { path: '/sales', icon: I.sales, label: 'Enter Sales' },
      // Inventory and Restock temporarily hidden for employees — re-enable
      // here (and in AppShell's allowed[] list) once the inventory flow is
      // ready for them.
      // { path: '/inventory', icon: I.inventory, label: 'Inventory' },
      // { path: '/restock',   icon: I.restock,   label: 'Restock' },
    ]},
  ];

  // Flattened list used by mobile bottom nav.
  const nav = sections.flatMap(s => s.items);

  // Mobile bottom nav: 4 primary items + More (owner); employees get their 2 pages.
  const primaryPaths = ['/dashboard', '/sales', '/cash', '/inventory'];
  const primary = isOwner ? nav.filter(n => primaryPaths.includes(n.path)) : nav;
  const overflow = isOwner ? nav.filter(n => !primaryPaths.includes(n.path)) : [];

  const storeName = stores.find(s => s.id === profile?.store_id)?.name;
  const go = (path) => { setMoreOpen(false); router.push(path); };
  const initial = (profile?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  // ── Single desktop nav row ──────────────────────────────
  const NavButton = ({ item }) => {
    const active = pathname === item.path;
    return (
      <button
        onClick={() => router.push(item.path)}
        aria-current={active ? 'page' : undefined}
        className={`group relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors duration-150
          ${active
            ? 'font-medium text-[#39FF14] bg-[linear-gradient(90deg,rgba(57,255,20,0.15),rgba(57,255,20,0.05))]'
            : 'text-[#C4C4C4] hover:bg-[#1A1A1A]'}`}
      >
        <span className={active ? 'text-[#39FF14]' : 'text-[#888780] group-hover:text-[#C4C4C4]'}>{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 w-[240px] h-screen z-40 flex-col overflow-y-auto bg-[#141414] border-r border-[#2C2C2A] px-3 py-4 transition-[width] duration-200 ease-out">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-1.5 pb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[14px] bg-[linear-gradient(135deg,#FF1493,#7F77DD)] shadow-[0_0_16px_rgba(255,20,147,0.3)]">
            7
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-medium text-white truncate">
              Vape <span className="text-[#FF1493]">L&#9829;ve</span>
            </div>
            {profile?.role && (
              <div className="text-[10px] text-[#888780] capitalize truncate">{profile.role}</div>
            )}
          </div>
        </div>

        {/* Store selector (owner only) */}
        {isOwner && stores.length > 0 && (
          <div className="px-1.5 pb-3">
            <select
              value={selectedStore || ''}
              onChange={e => onStoreChange(e.target.value || null)}
              className="w-full text-[12px] py-2 px-2.5 rounded-lg bg-[#0A0A0A] border border-[#2C2C2A] text-[#C4C4C4] cursor-pointer min-h-0"
            >
              <option value="">All Stores</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Employee store badge */}
        {!isOwner && storeName && (
          <div className="px-1.5 pb-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#5F5E5A]">Your Store</div>
            <div className="text-[#C4C4C4] text-xs font-medium mt-0.5 truncate">{storeName}</div>
          </div>
        )}

        {/* Grouped nav */}
        <nav className="flex-1 pb-2">
          {sections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <div className="px-1.5 pt-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#5F5E5A]">
                  {section.title}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map(item => <NavButton key={item.path} item={item} />)}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-2 pt-3 border-t border-[#2C2C2A]">
          <div className="flex items-center gap-2.5 px-1.5 pb-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-[#39FF14] text-[#0A0A0A] shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[12px] font-medium truncate">{profile?.name || user?.email}</div>
              {user?.email && <div className="text-[#5F5E5A] text-[10px] truncate">{user.email}</div>}
            </div>
          </div>
          <div className="px-1.5 pb-2">
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-[#FF1493] border border-[#FF1493]/30 hover:bg-[#FF1493]/10 transition-colors"
          >
            {I.logout}
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar (logo + store selector) ─────────── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sw-card border-b border-sw-border flex items-center gap-2 px-3"
        style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(48px + env(safe-area-inset-top))' }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-[12px]
          bg-gradient-to-br from-[#C084FC] to-[#FF1493]">
          7
        </div>
        <span className="text-[14px] font-extrabold tracking-tight">
          <span className="text-sw-text">Vape </span>
          <span className="neon-pink">L♥ve</span>
        </span>
        <div className="flex-1" />
        {isOwner && stores.length > 0 && (
          <select value={selectedStore || ''} onChange={e => onStoreChange(e.target.value || null)}
            className="!w-auto !min-h-0 !py-1 !px-2 !text-[11px] max-w-[140px]">
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {!isOwner && storeName && (
          <span className="text-sw-text text-[11px] font-semibold truncate max-w-[140px]">{storeName}</span>
        )}
      </div>

      {/* ── Mobile bottom nav ───────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sw-card border-t border-sw-border flex items-stretch h-[60px] pb-[env(safe-area-inset-bottom)]">
        {primary.map(n => {
          const active = pathname === n.path;
          return (
            <button key={n.path} onClick={() => go(n.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px]
                ${active ? 'text-sw-blue' : 'text-sw-sub'}`}>
              {n.icon}
              <span className="text-[9px] font-semibold uppercase tracking-wide">{n.label.split(' ')[0]}</span>
            </button>
          );
        })}
        {overflow.length > 0 && (
          <button onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-sw-sub">
            {I.more}
            <span className="text-[9px] font-semibold uppercase tracking-wide">More</span>
          </button>
        )}
        {!isOwner && (
          <button onClick={signOut}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-sw-red">
            {I.logout}
            <span className="text-[9px] font-semibold uppercase tracking-wide">Sign Out</span>
          </button>
        )}
      </nav>

      {/* ── Mobile "more" sheet ─────────────────────────── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <div onClick={e => e.stopPropagation()}
            className="relative w-full bg-sw-card border-t border-sw-border rounded-t-2xl p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] max-h-[70vh] overflow-auto">
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-[12px] font-bold
                  ${isOwner ? 'bg-sw-blue text-black' : 'bg-sw-blueD text-sw-blue'}`}>
                  {profile?.name?.[0]}
                </div>
                <div>
                  <div className="text-sw-text text-xs font-semibold">{profile?.name}</div>
                  <div className="text-sw-dim text-[10px] capitalize">{profile?.role}</div>
                </div>
              </div>
              <button onClick={() => setMoreOpen(false)} className="text-sw-dim text-xl w-10 h-10 flex items-center justify-center">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {overflow.map(n => {
                const active = pathname === n.path;
                return (
                  <button key={n.path} onClick={() => go(n.path)}
                    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border min-h-[72px]
                      ${active ? 'bg-sw-blueD text-sw-blue border-sw-blue/20' : 'text-sw-sub border-sw-border bg-sw-card2'}`}>
                    {n.icon}
                    <span className="text-[10px] font-semibold text-center leading-tight">{n.label}</span>
                  </button>
                );
              })}
              <button onClick={() => { setMoreOpen(false); signOut(); }}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg border text-sw-red border-sw-red/20 bg-sw-redD min-h-[72px]">
                {I.logout}
                <span className="text-[10px] font-semibold">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
