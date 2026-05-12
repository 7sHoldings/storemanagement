'use client';
import { LogOut } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';

// User row + theme toggle (the existing one, restyled) + Sign Out.
// `onSignOut` is the existing `signOut()` from useAuth — wiring unchanged.
export default function SidebarFooter({ name, email, initial, collapsed = false, onSignOut }) {
  return (
    <div className="mt-2 pt-3 border-t border-[#2C2C2A]">
      <div className={`flex items-center pb-2 ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-1.5'}`}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-[#39FF14] text-[#0A0A0A] shrink-0">
          {initial}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-white text-[12px] font-medium truncate">{name}</div>
            {email && <div className="text-[#5F5E5A] text-[10px] truncate">{email}</div>}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-1.5 pb-2">
          <ThemeToggle />
        </div>
      )}

      <button
        type="button"
        onClick={onSignOut}
        title={collapsed ? 'Sign Out' : undefined}
        aria-label="Sign Out"
        className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-[#FF1493] border border-[#FF1493]/30 hover:bg-[#FF1493]/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF1493] ${collapsed ? 'px-0' : ''}`}
      >
        <LogOut size={16} strokeWidth={1.75} className="shrink-0" />
        {!collapsed && 'Sign Out'}
      </button>
    </div>
  );
}
