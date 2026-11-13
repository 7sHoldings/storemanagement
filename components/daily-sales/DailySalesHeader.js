'use client';
import { Download, RefreshCw, Plus } from 'lucide-react';
import ViewModeToggle from './ViewModeToggle';

const outlineBtn =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E4E4E7] bg-[#FFFFFF] h-9 px-3 text-[13px] font-medium text-[#3F3F46] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A21CAF]';

// Title + live-status pill + the action button row (view toggle, CSV, Sync
// NRS, Add). All button handlers are passed straight through from the page.
export default function DailySalesHeader({ subtitle, liveAgo, viewMode, onViewModeChange, isOwner, onExportCsv, onSyncNrs, onAdd }) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-[#18181B]">Daily Sales</h1>
        <p className="mt-1 text-[13px] text-[#71717A]">
          {subtitle}
          {liveAgo && <span> · synced {liveAgo}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
        <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
        <button type="button" onClick={onExportCsv} className={outlineBtn}>
          <Download size={13} strokeWidth={1.75} />CSV
        </button>
        {isOwner && (
          <button type="button" onClick={onSyncNrs} className={outlineBtn}>
            <RefreshCw size={13} strokeWidth={1.75} className="text-[#6D28D9]" />Sync NRS
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg h-9 px-3.5 text-[13px] font-semibold text-[#FFFFFF] transition-colors hover:!bg-[#86198F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A21CAF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F7F8]"
            style={{ background: '#A21CAF' }}
          >
            <Plus size={15} strokeWidth={2.25} />Add entry
          </button>
        )}
      </div>
    </div>
  );
}
