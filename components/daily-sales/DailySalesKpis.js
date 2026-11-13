'use client';
import { Coins, ClipboardList, BarChart3, Bot, Check } from 'lucide-react';

function Kpi({ label, value, valueClassName = 'text-[#18181B]', sub, highlight }) {
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-[#FFFFFF] px-[18px] py-4">
      <span className="text-[13px] font-medium text-[#52525B]">{label}</span>
      <p className={`mt-2 text-[20px] md:text-[24px] font-semibold tracking-tight leading-none tabular-nums ${valueClassName}`}>{value}</p>
      {sub}
    </div>
  );
}

// 4 KPI cards. Every value/note is passed in pre-formatted from the page —
// nothing is recalculated here.
export default function DailySalesKpis({ totalSales, entries, avgPerDay, agentCount, agentTotal, agentNote, allSynced }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Net sales" value={totalSales} Icon={Coins} iconColor="#A21CAF" />
      <Kpi label="Entries" value={entries} Icon={ClipboardList} iconColor="#6D28D9" />
      <Kpi label="Average per day" value={avgPerDay} Icon={BarChart3} iconColor="#A21CAF" />
      <Kpi
        label="Synced by 7S Agent"
        value={`${agentCount} of ${agentTotal}`}
        Icon={Bot}
        iconColor="#BE185D"
        highlight
        sub={
          <p className={`mt-1.5 flex items-center gap-1 text-[12px] ${allSynced ? 'text-[#A21CAF]' : 'text-[#71717A]'}`}>
            {allSynced && <Check size={11} strokeWidth={2.5} />}
            {agentNote}
          </p>
        }
      />
    </div>
  );
}
