'use client';

// Logo tile + brand wordmark + subtitle (the user's role, read from the
// existing auth profile — no new data). Collapses to just the tile.
export default function SidebarHeader({ subtitle, collapsed = false }) {
  return (
    <div className={`flex items-center pb-3 ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-1.5'}`}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[14px] bg-[linear-gradient(135deg,#FF1493,#7F77DD)] shadow-[0_0_16px_rgba(255,20,147,0.3)] shrink-0">
        7
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-medium text-white truncate">
            Vape <span className="text-[#FF1493]">L&#9829;ve</span>
          </div>
          {subtitle && <div className="text-[10px] text-[#888780] capitalize truncate">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
