'use client';
import StorePill from './shared/StorePill';
import DateRangeSegmented from './shared/DateRangeSegmented';

// Store filter pills + date range, in one card. The store toggle/clear and
// the date-range hook handlers are passed straight through — behaviour
// is identical to the old StorePills / DateBar.
export default function DashboardFilters({
  stores, selectedStore, onStoreChange,
  preset, onPreset, rangeStart, rangeEnd, onStartChange, onEndChange,
}) {
  return (
    <div className="mb-4 rounded-xl border border-[#2C2C2A] bg-[#0A0A0A] p-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <StorePill active={!selectedStore} label="All Stores" onClick={() => onStoreChange('')} />
          {stores.map(s => {
            const short = s.name?.split(' - ').pop()?.trim() || s.name;
            const sel = selectedStore === s.id;
            return <StorePill key={s.id} active={sel} color={s.color} label={short} onClick={() => onStoreChange(sel ? '' : s.id)} />;
          })}
        </div>
        <div className="flex-shrink-0">
          <DateRangeSegmented
            preset={preset}
            onPreset={onPreset}
            startDate={rangeStart}
            endDate={rangeEnd}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
          />
        </div>
      </div>
    </div>
  );
}
