'use client';
import { useState } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, ChevronDown } from 'lucide-react';
import StorePill from '@/components/dashboard/shared/StorePill';
import DateRangeSegmented from '@/components/dashboard/shared/DateRangeSegmented';
import FiltersPopover from './FiltersPopover';

const ctrlBtn =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#E4E4E7] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px] font-medium text-[#3F3F46] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#A21CAF]';

// Consolidated filter card. Store-pill toggle, date-range handlers, search,
// the advanced-filter controls and the sort options are all passed through
// unchanged — this only rearranges them visually (advanced filters now live
// in a popover; sort is its own button).
export default function DailySalesFilters({
  stores, pageStoreIds, setPageStoreIds,
  preset, onPreset, rangeStart, rangeEnd, onStartChange, onEndChange,
  search, setSearch,
  employeeOptions, employeeFilter, setEmployeeFilter, mismatchFilter, setMismatchFilter,
  sortState, setSortState, salesSortOptions, onClearAll,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const allActive = pageStoreIds.length !== 1;
  const activeCount = (pageStoreIds.length > 0 ? 1 : 0) + (employeeFilter.length > 0 ? 1 : 0) + (mismatchFilter ? 1 : 0);
  const currentSortLabel = salesSortOptions.find(o => o.key === sortState.key && o.dir === sortState.dir)?.label || 'Sort';

  return (
    <div className="mb-3 rounded-[10px] border border-[#E4E4E7] bg-[#FFFFFF] p-3">
      {/* Row 1: store pills + date range */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <StorePill active={allActive} label="All Stores" onClick={() => setPageStoreIds([])} />
          {stores.map(s => {
            const short = s.name?.split(' - ').pop()?.trim() || s.name;
            const sel = pageStoreIds.length === 1 && pageStoreIds[0] === s.id;
            return <StorePill key={s.id} active={sel} color={s.color} label={short} onClick={() => setPageStoreIds(sel ? [] : [s.id])} />;
          })}
        </div>
        <div className="flex-shrink-0">
          <DateRangeSegmented preset={preset} onPreset={onPreset} startDate={rangeStart} endDate={rangeEnd} onStartChange={onStartChange} onEndChange={onEndChange} />
        </div>
      </div>

      {/* Row 2: search + filters popover + sort */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search… (store, amount, employee)"
            aria-label="Search entries"
            className="!min-h-0 !w-full !py-1.5 !pl-8 !pr-2.5 !text-[12px]"
          />
        </div>

        <div className="relative flex-shrink-0">
          <button type="button" onClick={() => setFiltersOpen(o => !o)} className={ctrlBtn} aria-haspopup="true" aria-expanded={filtersOpen}>
            <SlidersHorizontal size={13} strokeWidth={1.75} />Filters
            {activeCount > 0 && <span className="ml-0.5 rounded-full bg-[#BE185D] px-1.5 text-[12px] font-semibold text-white">{activeCount}</span>}
          </button>
          <FiltersPopover
            open={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            stores={stores}
            pageStoreIds={pageStoreIds}
            setPageStoreIds={setPageStoreIds}
            employeeOptions={employeeOptions}
            employeeFilter={employeeFilter}
            setEmployeeFilter={setEmployeeFilter}
            mismatchFilter={mismatchFilter}
            setMismatchFilter={setMismatchFilter}
            onClear={onClearAll}
          />
        </div>

        <div className="relative flex-shrink-0">
          <button type="button" onClick={() => setSortOpen(o => !o)} className={ctrlBtn} aria-haspopup="true" aria-expanded={sortOpen}>
            <ArrowUpDown size={13} strokeWidth={1.75} />{currentSortLabel}<ChevronDown size={11} strokeWidth={2} />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-1.5 w-[200px] rounded-lg border border-[#E4E4E7] bg-[#FFFFFF] py-1 shadow-xl">
                {salesSortOptions.map(o => {
                  const active = o.key === sortState.key && o.dir === sortState.dir;
                  return (
                    <button key={`${o.key}-${o.dir}`} type="button" onClick={() => { setSortState({ key: o.key, dir: o.dir }); setSortOpen(false); }}
                      className={`block w-full px-3 py-1.5 text-left text-[12px] font-medium transition-colors ${active ? 'bg-[rgba(162,28,175,0.12)] text-[#A21CAF]' : 'text-[#3F3F46] hover:bg-[#F4F4F5]'}`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
