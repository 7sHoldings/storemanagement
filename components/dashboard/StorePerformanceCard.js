'use client';
import { Trophy } from 'lucide-react';
import { fmt } from '@/lib/utils';

// Ranked store list. `stores` is the existing `sortedStores` array (already
// sorted by the page). The sort <select> drives the same `storeSort` state.
// Revenue, profit and margin% are all kept visible.
export default function StorePerformanceCard({ stores, storeSort, onSortChange }) {
  const maxRevenue = Math.max(1, ...stores.map(s => s.revenue));
  return (
    <div className="min-w-0 rounded-xl border border-[#2C2C2A] bg-[#0A0A0A] p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-white">Store performance</h3>
        <select
          value={storeSort}
          onChange={e => onSortChange(e.target.value)}
          aria-label="Sort stores by"
          className="!min-h-0 !w-auto !rounded-md !border-[#2C2C2A] !bg-[#141414] !px-2 !py-1 !text-[10px] !text-[#C4C4C4]"
        >
          <option value="revenue">Revenue</option>
          <option value="profit">Profit</option>
          <option value="margin">Margin</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div>
        {stores.map((s, i) => {
          const short = s.name?.split(' - ').pop()?.trim() || s.name;
          const share = (s.revenue / maxRevenue) * 100;
          const mColor = s.margin >= 40 ? '#39FF14' : s.margin >= 20 ? '#EF9F27' : '#E24B4A';
          const top = i === 0;
          return (
            <div key={s.id} className={`flex items-center gap-3 py-2 ${i < stores.length - 1 ? 'border-b border-[#2C2C2A]' : ''}`}>
              <span className="w-5 shrink-0 text-center">
                {top ? <Trophy size={14} strokeWidth={1.75} className="mx-auto text-[#EF9F27]" /> : <span className="text-[11px] text-[#5F5E5A]">{i + 1}</span>}
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] ${top ? 'font-medium text-white' : 'text-[#C4C4C4]'}`}>{short}</p>
                <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-[#141414]">
                  <div className="h-full rounded-full" style={{ width: `${share}%`, background: s.color }} />
                </div>
              </div>
              <span className={`shrink-0 text-right text-[12px] tabular-nums ${top ? 'font-medium text-white' : 'text-[#888780]'}`}>{fmt(s.revenue)}</span>
              <span className={`shrink-0 text-right text-[12px] tabular-nums ${s.profit >= 0 ? 'text-[#39FF14]' : 'text-[#E24B4A]'}`}>{fmt(s.profit)}</span>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums" style={{ background: mColor + '22', color: mColor }}>{s.margin.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
