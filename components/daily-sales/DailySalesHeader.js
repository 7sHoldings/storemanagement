'use client';
import { Download, RefreshCw, Plus } from 'lucide-react';
import ViewModeToggle from './ViewModeToggle';

const outlineBtn =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#2C2C2A] bg-[#0A0A0A] px-3 py-1.5 text-[11px] font-medium text-[#C4C4C4] transition-colors hover:bg-[#1A1A1A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14]';

// Title + live-status pill + the action button row (view toggle, CSV, Sync
// NRS, Add). All button handlers are passed straight through from the page.
export default function DailySalesHeader({ subtitle, liveAgo, viewMode, onViewModeChange, isOwner, onExportCsv, onSyncNrs, onAdd }) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#888780]">Sales</span>
          <span className="inline-flex items-center gap-1.5 rounded-2xl border border-[#2C2C2A] bg-[#0A0A0A] px-2 py-[2px] text-[10px]">
            <span className="h-[5px] w-[5px] rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]" />
            <span className="text-white">Live{liveAgo ? ` · ${liveAgo}` : ''}</span>
          </span>
        </div>
        <h1 className="mt-1 text-[20px] md:text-[24px] font-medium tracking-tight text-white">Daily Sales</h1>
        <p className="text-[12px] text-[#888780]">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
        <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
        <button type="button" onClick={onExportCsv} className={outlineBtn}>
          <Download size={13} strokeWidth={1.75} />CSV
        </button>
        {isOwner && (
          <button type="button" onClick={onSyncNrs} className={outlineBtn}>
            <RefreshCw size={13} strokeWidth={1.75} className="text-[#7F77DD]" />Sync NRS
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium text-[#0A0A0A] transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060A10]"
            style={{ background: 'linear-gradient(135deg, #39FF14, #2DD80F)' }}
          >
            <Plus size={14} strokeWidth={2.25} />Add
          </button>
        )}
      </div>
    </div>
  );
}
