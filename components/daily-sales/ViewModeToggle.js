'use client';
import { Table2, LayoutGrid } from 'lucide-react';

// Table ↔ Cards toggle. Pure UI; the parent owns the `mode` state and
// persistence — this just renders two segmented icon buttons.
export default function ViewModeToggle({ mode, onChange }) {
  const btn = (active) =>
    `flex items-center justify-center rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A21CAF] ${active ? 'bg-[#FAE8FF] text-[#A21CAF]' : 'text-[#71717A] hover:text-[#3F3F46]'}`;
  return (
    <div className="flex flex-shrink-0 items-center gap-0.5 rounded-lg border border-[#E4E4E7] bg-[#FFFFFF] p-[3px]">
      <button type="button" onClick={() => onChange('table')} aria-pressed={mode === 'table'} aria-label="Table view" title="Table view" className={btn(mode === 'table')}>
        <Table2 size={15} strokeWidth={1.75} />
      </button>
      <button type="button" onClick={() => onChange('cards')} aria-pressed={mode === 'cards'} aria-label="Card view" title="Card view" className={btn(mode === 'cards')}>
        <LayoutGrid size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
