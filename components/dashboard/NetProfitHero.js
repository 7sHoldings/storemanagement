'use client';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { fmt } from '@/lib/utils';

// Net Profit hero. All numbers come from the page's existing stats /
// month-progress computations — nothing is recalculated here.
export default function NetProfitHero({ netProfit, margin, projectedNet, monthProgressPct, daysLeft, monthName, periodLabel }) {
  const positive = netProfit >= 0;
  const bigColor = positive ? '#39FF14' : '#E24B4A';
  const marginGood = margin >= 20;
  const marginColor = marginGood ? '#39FF14' : '#EF9F27';
  const TrendIcon = marginGood ? TrendingUp : TrendingDown;
  const paceColor = projectedNet >= 0 ? '#39FF14' : '#E24B4A';

  return (
    <div
      className="relative overflow-hidden rounded-xl p-4 sm:p-5"
      style={{
        background: positive
          ? 'linear-gradient(135deg, rgba(57,255,20,0.10), rgba(57,255,20,0.02))'
          : 'linear-gradient(135deg, rgba(226,75,74,0.10), rgba(226,75,74,0.02))',
        border: `1px solid ${positive ? 'rgba(57,255,20,0.25)' : 'rgba(226,75,74,0.25)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[#888780]">Net Profit · {periodLabel}</p>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums" style={{ background: marginColor + '1f', color: marginColor }}>
          <TrendIcon size={12} strokeWidth={2} />{margin.toFixed(1)}%
        </span>
      </div>

      <p className="mt-2 text-[28px] md:text-[38px] font-medium leading-none tabular-nums" style={{ color: bigColor }}>
        {positive ? '' : '−'}{fmt(Math.abs(netProfit))}
      </p>

      <div className="mt-4 flex gap-8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.5px] text-[#888780]">Pace</p>
          <p className="text-[13px] font-medium tabular-nums" style={{ color: paceColor }}>{fmt(projectedNet)}/mo</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.5px] text-[#888780]">Days Left</p>
          <p className="text-[13px] font-medium tabular-nums text-[#C4C4C4]">{daysLeft} day{daysLeft === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[#0A0A0A]">
          <div className="h-full rounded-full transition-all motion-reduce:transition-none" style={{ width: `${monthProgressPct}%`, background: `linear-gradient(90deg, ${bigColor}, #7F77DD)` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-[#888780]">
          <span>{monthProgressPct}% through {monthName}</span>
          <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
        </div>
      </div>
    </div>
  );
}
