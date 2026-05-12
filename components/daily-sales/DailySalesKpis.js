'use client';
import { Coins, ClipboardList, BarChart3, Bot, Check } from 'lucide-react';

function Kpi({ label, value, Icon, iconColor, valueClassName = 'text-white', sub, highlight }) {
  return (
    <div className={`rounded-[10px] border bg-[#0A0A0A] p-3.5 ${highlight ? 'border-[rgba(57,255,20,0.2)]' : 'border-[#2C2C2A]'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">{label}</span>
        <Icon size={14} strokeWidth={1.75} className="shrink-0" style={{ color: iconColor }} />
      </div>
      <p className={`mt-1.5 text-[14px] md:text-[18px] font-medium leading-none tabular-nums ${valueClassName}`}>{value}</p>
      {sub}
    </div>
  );
}

// 4 KPI cards. Every value/note is passed in pre-formatted from the page —
// nothing is recalculated here.
export default function DailySalesKpis({ totalSales, entries, avgPerDay, agentCount, agentTotal, agentNote, allSynced }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Total Sales" value={totalSales} Icon={Coins} iconColor="#39FF14" valueClassName="text-[#39FF14]" />
      <Kpi label="Entries" value={entries} Icon={ClipboardList} iconColor="#7F77DD" />
      <Kpi label="Avg / Day" value={avgPerDay} Icon={BarChart3} iconColor="#39FF14" valueClassName="text-[#39FF14]" />
      <Kpi
        label="7S Agent"
        value={`${agentCount} of ${agentTotal}`}
        Icon={Bot}
        iconColor="#FF1493"
        highlight
        sub={
          <p className={`mt-1.5 flex items-center gap-1 text-[10px] ${allSynced ? 'text-[#39FF14]' : 'text-[#888780]'}`}>
            {allSynced && <Check size={11} strokeWidth={2.5} />}
            {agentNote}
          </p>
        }
      />
    </div>
  );
}
