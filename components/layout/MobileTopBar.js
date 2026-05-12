'use client';
import { Menu } from 'lucide-react';

// Mobile (<768px) top bar: hamburger opens the drawer, then the logo tile +
// current page title, then whatever the caller passes for the right side
// (the existing store selector / store badge).
export default function MobileTopBar({ pageTitle, onOpenMenu, rightSlot }) {
  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-2 px-3 bg-[#141414] border-b border-[#2C2C2A]"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="-ml-1 w-9 h-9 flex items-center justify-center rounded-lg text-[#C4C4C4] hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-[12px] bg-[linear-gradient(135deg,#FF1493,#7F77DD)] shrink-0">
        7
      </div>
      <span className="text-[14px] font-medium text-white truncate">
        {pageTitle || (<>Vape <span className="text-[#FF1493]">L&#9829;ve</span></>)}
      </span>
      <div className="flex-1" />
      {rightSlot}
    </header>
  );
}
