'use client';
import SidebarItem from './SidebarItem';

// A labelled group of nav items. `items` is the same `{ path, icon, label }`
// array the old sidebar built; `currentPath` + `onNavigate` are passed down
// so the active-state and navigation behaviour are unchanged.
export default function SidebarSection({ title, items, currentPath, collapsed = false, onNavigate }) {
  return (
    <div>
      {title && !collapsed && (
        <div className="px-1.5 pt-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[#5F5E5A]">
          {title}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <SidebarItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={currentPath === item.path}
            collapsed={collapsed}
            onSelect={() => onNavigate(item.path)}
          />
        ))}
      </div>
    </div>
  );
}
