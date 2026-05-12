'use client';

// Single sidebar nav row. Dumb component — the parent decides `active`
// (same `pathname === path` check the old sidebar used) and `onSelect`
// (the same router.push). When `collapsed`, only the icon shows and the
// label moves to a native tooltip.
export default function SidebarItem({ icon, label, active, collapsed = false, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`group w-full flex items-center rounded-lg text-[13px] text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]
        ${collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-2'}
        ${active
          ? 'font-medium text-[#39FF14] bg-[linear-gradient(90deg,rgba(57,255,20,0.15),rgba(57,255,20,0.05))]'
          : 'text-[#C4C4C4] hover:bg-[#1A1A1A]'}`}
    >
      <span className={active ? 'text-[#39FF14]' : 'text-[#888780] group-hover:text-[#C4C4C4]'}>{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
