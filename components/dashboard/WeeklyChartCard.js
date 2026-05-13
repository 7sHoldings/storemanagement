'use client';
import { TrendChart } from '@/components/UI';
import { fmt } from '@/lib/utils';

const fmtDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Wrapper around the existing TrendChart (untouched). Payment Mix is rendered
// below the chart in the same card.
export default function WeeklyChartCard({ trends, rangeStart, rangeEnd, paymentMix }) {
  const totalSales = trends.reduce((s, d) => s + (d.sales || 0), 0);
  const totalPurch = trends.reduce((s, d) => s + (d.purchases || 0), 0);
  return (
    <div className="min-w-0 rounded-xl border border-[#2C2C2A] bg-[#0A0A0A] p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-[14px] font-medium text-white">Weekly Sales vs Purchases</h3>
        <div className="flex gap-5 text-right">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Sales</p>
            <p className="text-[13px] font-medium tabular-nums text-[#39FF14]">{fmt(totalSales)}</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Purchases</p>
            <p className="text-[13px] font-medium tabular-nums text-[#EF9F27]">{fmt(totalPurch)}</p>
          </div>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-[#888780]">Monday–Sunday weeks · {fmtDate(rangeStart)} – {fmtDate(rangeEnd)}</p>

      <div className="max-w-full overflow-x-auto"><TrendChart data={trends} /></div>

      {paymentMix && (
        <div className="mt-4 border-t border-[#2C2C2A] pt-4">
          <p className="mb-3 text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">Payment Mix</p>
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 shrink-0">
              <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(#378ADD 0% ${paymentMix.cardPct}%, #39FF14 ${paymentMix.cardPct}% 100%)` }} />
              <div className="absolute inset-[10px] flex items-center justify-center rounded-full bg-[#0A0A0A]">
                <span className="text-[11px] font-medium tabular-nums text-white">{fmt(paymentMix.cash + paymentMix.card)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-[11px]">
              <span className="flex items-center gap-1.5 text-[#C4C4C4]"><span className="h-2 w-2 rounded-sm bg-[#378ADD]" />Card {paymentMix.cardPct}%</span>
              <span className="flex items-center gap-1.5 text-[#C4C4C4]"><span className="h-2 w-2 rounded-sm bg-[#39FF14]" />Cash {paymentMix.cashPct}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
