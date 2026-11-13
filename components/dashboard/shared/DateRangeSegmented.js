'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Restyled date-range control. Preset ids/labels, the toggle-to-clear
// behaviour, and the 500ms debounce on the custom date inputs are copied
// verbatim from the existing DatePresets/DateBar so the date logic is
// unchanged — only the rendering differs. The custom pickers live in the
// "Custom ▼" dropdown.
const PRIMARY = [
  { id: 'yesterday', l: 'Yesterday' },
  { id: 'thisweek',  l: 'This Week' },
  { id: 'thismonth', l: 'This Month' },
  { id: 'lastmonth', l: 'Last Month' },
];
const OVERFLOW = [
  { id: 'today', l: 'Today' }, { id: 'lastweek', l: 'Last Week' },
  { id: 'last2weeks', l: 'Last 2 Weeks' }, { id: 'last2months', l: 'Last 2 Months' },
  { id: 'last3months', l: 'Last 3 Months' }, { id: 'last6months', l: 'Last 6 Months' },
  { id: 'thisyear', l: 'This Year' }, { id: 'lastyear', l: 'Last Year' }, { id: 'all', l: 'All Time' },
];
const ALL = [...PRIMARY, ...OVERFLOW];

export default function DateRangeSegmented({ preset, onPreset, startDate, endDate, onStartChange, onEndChange }) {
  const [open, setOpen] = useState(false);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const startTimer = useRef(null);
  const endTimer = useRef(null);

  useEffect(() => { setLocalStart(startDate); }, [startDate]);
  useEffect(() => { setLocalEnd(endDate); }, [endDate]);
  useEffect(() => () => {
    if (startTimer.current) clearTimeout(startTimer.current);
    if (endTimer.current) clearTimeout(endTimer.current);
  }, []);

  const handleStart = (val) => { setLocalStart(val); if (startTimer.current) clearTimeout(startTimer.current); startTimer.current = setTimeout(() => onStartChange(val), 500); };
  const handleEnd = (val) => { setLocalEnd(val); if (endTimer.current) clearTimeout(endTimer.current); endTimer.current = setTimeout(() => onEndChange(val), 500); };
  const flushStart = () => { if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null; } if (localStart !== startDate) onStartChange(localStart); };
  const flushEnd = () => { if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; } if (localEnd !== endDate) onEndChange(localEnd); };

  const togglePreset = (id) => onPreset(preset === id ? 'custom' : id);
  const activeInOverflow = OVERFLOW.some(p => p.id === preset);
  const customLabel = activeInOverflow ? (ALL.find(p => p.id === preset)?.l || 'Custom') : 'Custom';

  const segBtn = (activeFlag) =>
    `flex-shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${activeFlag ? 'bg-[#A21CAF] text-[#FFFFFF]' : 'text-[#3F3F46] hover:bg-[#F4F4F5]'}`;

  return (
    // The outer container is NON-overflowing so the "Custom" dropdown can
    // hang below it without being clipped. The four primary preset buttons
    // live in an inner row that handles horizontal scrolling on narrow
    // screens; the Custom button + popover are siblings of that row.
    <div className="relative flex items-center gap-1 rounded-lg border border-[#E4E4E7] bg-[#FFFFFF] p-[3px] max-w-full">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {PRIMARY.map(p => (
          <button key={p.id} type="button" onClick={() => togglePreset(p.id)} title={preset === p.id ? 'Click to clear' : undefined} className={segBtn(preset === p.id)}>
            {p.l}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} className={`${segBtn(activeInOverflow)} flex flex-shrink-0 items-center gap-1`} aria-haspopup="true" aria-expanded={open}>
        {customLabel} <ChevronDown size={11} strokeWidth={2} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1.5 w-[300px] rounded-lg border border-[#E4E4E7] bg-[#FFFFFF] p-3.5 shadow-xl">
            <p className="mb-2 text-[13px] font-medium text-[#71717A]">Custom range</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#71717A]">From</span>
                <input type="date" value={localStart} onChange={e => handleStart(e.target.value)} onBlur={flushStart} aria-label="Start date" className="!min-h-0 !w-full !rounded-md !px-2 !py-2 !text-[12px]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#71717A]">To</span>
                <input type="date" value={localEnd} onChange={e => handleEnd(e.target.value)} onBlur={flushEnd} aria-label="End date" className="!min-h-0 !w-full !rounded-md !px-2 !py-2 !text-[12px]" />
              </label>
            </div>
            <div className="border-t border-[#E4E4E7] pt-2.5">
              <p className="mb-1.5 text-[13px] font-medium text-[#71717A]">Quick presets</p>
              <div className="grid grid-cols-2 gap-1">
                {OVERFLOW.map(p => (
                  <button key={p.id} type="button" onClick={() => { togglePreset(p.id); setOpen(false); }}
                    className={`rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors ${preset === p.id ? 'bg-[rgba(162,28,175,0.12)] text-[#A21CAF]' : 'text-[#3F3F46] hover:bg-[#F4F4F5]'}`}>
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
            {preset && preset !== 'custom' && (
              <button type="button" onClick={() => { onPreset('custom'); setOpen(false); }}
                className="mt-2.5 w-full border-t border-[#E4E4E7] pt-2.5 text-left text-[12px] font-medium text-[#71717A] hover:text-[#3F3F46]">
                Clear preset
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
