'use client';
import { fmt } from '@/lib/utils';
import EntryCard from './EntryCard';

// Card-view alternative to the table. `entries` is the same filtered (and
// sorted) array the table renders; the totals card sums it with the same
// formulas the table's totals row uses.
export default function EntriesCardList({ entries, stores, isOwner, onEdit, onDelete, onViewReceipts, getStatus }) {
  if (!entries.length) {
    return <div className="rounded-[10px] border border-[#2C2C2A] bg-[#0A0A0A] px-4 py-8 text-center text-[12px] text-[#5F5E5A]">No data</div>;
  }

  const sum = (fn) => entries.reduce((s, r) => s + fn(r), 0);
  const tGross = sum(r => Number(r.gross_sales ?? r.total_sales ?? 0));
  const tTotal = sum(r => Number(r.total_sales ?? r.net_sales ?? 0));
  const tSO = sum(r => Number(r.short_over || 0));
  const tDiff = sum(r => { const st = stores.find(s => s.id === r.store_id); return st?.has_register2 ? (Number(r.r2_net || 0) - Number(r.r1_canceled_basket || 0)) : 0; });

  const soDisp = Math.abs(tSO) < 0.01 ? { t: fmt(0), c: 'text-[#5F5E5A]' } : (tSO > 0 ? { t: `−${fmt(Math.abs(tSO))}`, c: 'text-[#E24B4A]' } : { t: `+${fmt(Math.abs(tSO))}`, c: 'text-[#39FF14]' });
  const diffDisp = Math.abs(tDiff) < 0.01 ? { t: fmt(0), c: 'text-[#39FF14]' } : (tDiff < 0 ? { t: `-${fmt(Math.abs(tDiff))}`, c: 'text-[#E24B4A]' } : { t: `+${fmt(tDiff)}`, c: 'text-[#EF9F27]' });

  return (
    <div className="flex flex-col gap-2">
      {entries.map(e => {
        const st = getStatus(e);
        return (
          <EntryCard
            key={e.id}
            entry={e}
            store={stores.find(s => s.id === e.store_id)}
            status={st.state}
            statusTitle={st.title}
            isOwner={isOwner}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewReceipts={onViewReceipts}
          />
        );
      })}

      <div className="rounded-[10px] border border-[#2C2C2A] p-3" style={{ background: 'linear-gradient(180deg, #141414, #0A0A0A)' }}>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1px] text-[#888780]">
          Totals ({entries.length} entr{entries.length === 1 ? 'y' : 'ies'})
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
          <div className="flex justify-between"><span className="text-[#888780]">Gross</span><span className="font-medium tabular-nums text-white">{fmt(tGross)}</span></div>
          <div className="flex justify-between"><span className="text-[#888780]">Total</span><span className="font-medium tabular-nums text-[#39FF14]">{fmt(tTotal)}</span></div>
          <div className="flex justify-between"><span className="text-[#888780]">Diff</span><span className={`font-medium tabular-nums ${diffDisp.c}`}>{diffDisp.t}</span></div>
          <div className="flex justify-between"><span className="text-[#888780]">S/O</span><span className={`font-medium tabular-nums ${soDisp.c}`}>{soDisp.t}</span></div>
        </div>
      </div>
    </div>
  );
}
