'use client';
import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, MoreHorizontal, LogOut,
  LayoutDashboard, TrendingUp, DollarSign, Coins, ShoppingCart, PackagePlus,
  FileText, CreditCard, Boxes, BarChart3, ArrowLeftRight, History, Download,
  UserCheck, UserCog, Mail, Zap, Bot, RefreshCw, Settings, Tag, Gamepad2,
} from 'lucide-react';
import SidebarHeader from './layout/SidebarHeader';
import SidebarSection from './layout/SidebarSection';
import SidebarFooter from './layout/SidebarFooter';
import MobileTopBar from './layout/MobileTopBar';
import MobileDrawer from './layout/MobileDrawer';

/* ── Icon set ─────────────────────────────────────────────
   lucide-react icons, 16px, 1.75 stroke. Kept in one map so the
   nav data below stays compact and visually consistent. */
const IP = { size: 16, strokeWidth: 1.75, className: 'shrink-0' };
const I = {
  dashboard: <LayoutDashboard {...IP} />,
  trends:    <TrendingUp {...IP} />,
  sales:     <DollarSign {...IP} />,
  cash:      <Coins {...IP} />,
  cart:      <ShoppingCart {...IP} />,
  restock:   <PackagePlus {...IP} />,
  invoice:   <FileText {...IP} />,
  expense:   <CreditCard {...IP} />,
  inventory: <Boxes {...IP} />,
  pl:        <BarChart3 {...IP} />,
  compare:   <ArrowLeftRight {...IP} />,
  activity:  <History {...IP} />,
  export:    <Download {...IP} />,
  employee:  <UserCheck {...IP} />,
  admin:     <UserCog {...IP} />,
  mail:      <Mail {...IP} />,
  zap:       <Zap {...IP} />,
  bot:       <Bot {...IP} />,
  refresh:   <RefreshCw {...IP} />,
  settings:  <Settings {...IP} />,
  tag:       <Tag {...IP} />,
  game:      <Gamepad2 {...IP} />,
};

const COLLAPSE_KEY = 'sidebar-collapsed';

export default function Sidebar({ selectedStore, onStoreChange }) {
  const { profile, user, signOut, isOwner, supabase } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    supabase.from('stores').select('*').order('created_at').then(({ data }) => setStores(data || []));
  }, []);

  // Restore the desktop collapsed preference (new key — doesn't touch any
  // existing localStorage keys).
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage unavailable */ }
  }, []);

  // Publish the current sidebar width so AppShell's content margin can follow it.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--sidebar-w', collapsed ? '64px' : '240px');
    }
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
    return next;
  });

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

  // Mobile bottom nav: 4 primary items + More (owner); employees get their pages.
  const primaryPaths = ['/dashboard', '/sales', '/cash', '/inventory'];
  const primary = isOwner ? nav.filter(n => primaryPaths.includes(n.path)) : nav;
  const overflow = isOwner ? nav.filter(n => !primaryPaths.includes(n.path)) : [];

  const storeName = stores.find(s => s.id === profile?.store_id)?.name;
  const pageTitle = nav.find(n => n.path === pathname)?.label;
  const initial = (profile?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  const navigate = (path) => { setMoreOpen(false); setDrawerOpen(false); router.push(path); };

  // Shared inner content for both the desktop aside and the mobile drawer.
  // `collapsedView` is only ever true for the icon-rail desktop layout.
  const renderBody = (collapsedView) => (
    <>
      <SidebarHeader subtitle={profile?.role} collapsed={collapsedView} />

      {isOwner && stores.length > 0 && !collapsedView && (
        <div className="px-1.5 pb-3">
          <select
            value={selectedStore || ''}
            onChange={e => onStoreChange(e.target.value || null)}
            aria-label="Selected store"
            className="w-full text-[12px] py-2 px-2.5 rounded-lg bg-[#0A0A0A] border border-[#2C2C2A] text-[#C4C4C4] cursor-pointer min-h-0"
          >
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {!isOwner && storeName && !collapsedView && (
        <div className="px-1.5 pb-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#5F5E5A]">Your Store</div>
          <div className="text-[#C4C4C4] text-xs font-medium mt-0.5 truncate">{storeName}</div>
        </div>
      )}

      <nav className="flex-1 pb-2">
        {sections.map((section, i) => (
          <SidebarSection
            key={i}
            title={section.title}
            items={section.items}
            currentPath={pathname}
            collapsed={collapsedView}
            onNavigate={navigate}
          />
        ))}
      </nav>

      <SidebarFooter
        name={profile?.name || user?.email}
        email={user?.email}
        initial={initial}
        collapsed={collapsedView}
        onSignOut={signOut}
      />
    </>
  );

  const storeSelectorMobile = isOwner && stores.length > 0 ? (
    <select
      value={selectedStore || ''}
      onChange={e => onStoreChange(e.target.value || null)}
      aria-label="Selected store"
      className="!w-auto !min-h-0 !py-1 !px-2 !text-[11px] max-w-[140px] bg-[#0A0A0A] border border-[#2C2C2A] rounded-lg text-[#C4C4C4]"
    >
      <option value="">All Stores</option>
      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  ) : (!isOwner && storeName ? (
    <span className="text-[#C4C4C4] text-[11px] font-medium truncate max-w-[140px]">{storeName}</span>
  ) : null);

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside
        className="hidden md:flex fixed left-0 top-0 h-screen z-40 flex-col bg-[#141414] border-r border-[#2C2C2A] transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: collapsed ? 64 : 240 }}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-5 -right-[10px] z-50 w-5 h-5 flex items-center justify-center rounded-full bg-[#141414] border border-[#2C2C2A] text-[#888780] hover:text-[#39FF14] hover:border-[#39FF14]/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]"
        >
          {collapsed ? <ChevronRight size={12} strokeWidth={2} /> : <ChevronLeft size={12} strokeWidth={2} />}
        </button>
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden px-3 py-4">
          {renderBody(collapsed)}
        </div>
      </aside>

      {/* ── Mobile top bar + drawer ─────────────────────── */}
      <MobileTopBar
        pageTitle={pageTitle}
        onOpenMenu={() => setDrawerOpen(true)}
        rightSlot={storeSelectorMobile}
      />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {renderBody(false)}
      </MobileDrawer>

      {/* ── Mobile bottom nav ───────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#141414] border-t border-[#2C2C2A] flex items-stretch h-[60px] pb-[env(safe-area-inset-bottom)]">
        {primary.map(n => {
          const active = pathname === n.path;
          return (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] ${active ? 'text-[#39FF14]' : 'text-[#888780]'}`}
            >
              {n.icon}
              <span className="text-[9px] font-semibold uppercase tracking-wide">{n.label.split(' ')[0]}</span>
            </button>
          );
        })}
        {overflow.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[#888780]"
          >
            <MoreHorizontal {...IP} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">More</span>
          </button>
        )}
        {!isOwner && (
          <button
            onClick={signOut}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[#FF1493]"
          >
            <LogOut {...IP} />
            <span className="text-[9px] font-semibold uppercase tracking-wide">Sign Out</span>
          </button>
        )}
      </nav>

      {/* ── Mobile "more" sheet ─────────────────────────── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={e => e.stopPropagation()}
            className="relative w-full bg-[#141414] border-t border-[#2C2C2A] rounded-t-2xl p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] max-h-[70vh] overflow-auto"
          >
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold bg-[#39FF14] text-[#0A0A0A]">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="text-white text-xs font-medium truncate">{profile?.name || user?.email}</div>
                  <div className="text-[#5F5E5A] text-[10px] capitalize truncate">{profile?.role}</div>
                </div>
              </div>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="text-[#888780] hover:text-[#C4C4C4] text-xl w-10 h-10 flex items-center justify-center">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {overflow.map(n => {
                const active = pathname === n.path;
                return (
                  <button
                    key={n.path}
                    onClick={() => navigate(n.path)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg border min-h-[72px] ${active ? 'text-[#39FF14] border-[#39FF14]/30 bg-[linear-gradient(180deg,rgba(57,255,20,0.12),rgba(57,255,20,0.04))]' : 'text-[#C4C4C4] border-[#2C2C2A] bg-[#0A0A0A]'}`}
                  >
                    {n.icon}
                    <span className="text-[10px] font-medium text-center leading-tight">{n.label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => { setMoreOpen(false); signOut(); }}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg border text-[#FF1493] border-[#FF1493]/30 bg-[#FF1493]/10 min-h-[72px]"
              >
                <LogOut {...IP} />
                <span className="text-[10px] font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
