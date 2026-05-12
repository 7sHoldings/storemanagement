'use client';
import { MultiSelect } from '@/components/UI';

// Popover panel holding the Store / Employee / Status controls that used to
// sit inline. These are the SAME shared controls with the SAME handlers —
// only their position changed (now behind the "Filters" button). Built as a
// small positioned panel; no new popover library. Must be rendered inside a
// `relative` parent.
export default function FiltersPopover({
  open, onClose, stores,
  pageStoreIds, setPageStoreIds,
  employeeOptions, employeeFilter, setEmployeeFilter,
  mismatchFilter, setMismatchFilter,
  onClear,
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-1.5 w-[280px] rounded-lg border border-[#2C2C2A] bg-[#141414] p-3 shadow-xl">
        <div className="flex flex-col gap-2.5">
          <div>
            <label className="mb-1 block text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Store</label>
            <MultiSelect placeholder="All Stores" unitLabel="store" value={pageStoreIds} onChange={setPageStoreIds} options={stores.map(s => ({ value: s.id, label: s.name }))} className="w-full" />
          </div>
          {employeeOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Employee</label>
              <MultiSelect placeholder="All Employees" unitLabel="employee" value={employeeFilter} onChange={setEmployeeFilter} options={employeeOptions} className="w-full" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Status</label>
            <select value={mismatchFilter} onChange={e => setMismatchFilter(e.target.value)} className="!min-h-0 !w-full !py-1.5 !text-[11px]">
              <option value="">All</option>
              <option value="mismatch">Mismatches only ⚠️</option>
              <option value="clean">Clean only ✅</option>
            </select>
          </div>
          {onClear && (
            <button type="button" onClick={onClear} className="mt-1 self-start text-[10px] font-medium text-[#888780] underline hover:text-[#C4C4C4]">
              Clear filters
            </button>
          )}
        </div>
      </div>
    </>
  );
}
