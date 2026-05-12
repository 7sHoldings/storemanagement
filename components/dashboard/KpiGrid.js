'use client';
import { DollarSign, BarChart3, Scale, Landmark } from 'lucide-react';
import { fmt } from '@/lib/utils';
import KpiCard from './shared/KpiCard';

// 2x2 KPI grid. The Short/Over and Cash-in-Hand display logic is copied
// verbatim from the old V2StatCard usages — only the rendering changed.
export default function KpiGrid({ stats }) {
  // Convention: positive short_over = SHORT (red, −), negative = OVER (green, +), ~0 = matched.
  const so = stats.totalShortOver;
  const soMatched = Math.abs(so) < 0.01;
  const soShort = so > 0;
  const soValue = soMatched ? fmt(0) : (soShort ? `−${fmt(Math.abs(so))}` : `+${fmt(Math.abs(so))}`);
  const soValueColor = soMatched ? 'text-[#C4C4C4]' : soShort ? 'text-[#E24B4A]' : 'text-[#39FF14]';
  const soIconColor = soMatched ? 'text-[#888780]' : soShort ? 'text-[#E24B4A]' : 'text-[#39FF14]';
  const soBorder = soMatched ? '' : soShort ? 'border-[#E24B4A]/40' : 'border-[#39FF14]/40';

  const expected = stats.totalCash || 0;
  const collected = stats.cashInHand || 0;
  const diff = collected - expected;
  const cMatched = Math.abs(diff) < 0.01;
  const cShort = diff < 0;
  const cDiffLabel = cMatched ? 'Matched' : (cShort ? 'Short' : 'Over');
  const cDiffColor = cMatched ? 'text-[#888780]' : cShort ? 'text-[#E24B4A]' : 'text-[#39FF14]';

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <KpiCard
        label="Gross Sales" value={fmt(stats.totalGross)} Icon={DollarSign}
        valueClassName="text-[#39FF14]" iconClassName="text-[#39FF14]"
        breakdown={[
          { label: 'Cash', value: fmt(stats.totalCash), valueClassName: 'text-[#39FF14]' },
          { label: 'Card', value: fmt(stats.totalCard), valueClassName: 'text-[#378ADD]' },
        ]}
      />
      <KpiCard
        label="Net Sales" value={fmt(stats.totalNet)} Icon={BarChart3}
        valueClassName="text-[#39FF14]" iconClassName="text-[#39FF14]"
        breakdown={[
          { label: 'Tax stripped', value: fmt(stats.totalGross - stats.totalNet), valueClassName: 'text-[#888780]' },
          { label: 'Non-tax sales', value: fmt(stats.totalNonTax || 0), valueClassName: 'text-[#888780]' },
        ]}
      />
      <KpiCard
        label="Short / Over" value={soValue} Icon={Scale}
        valueClassName={soValueColor} iconClassName={soIconColor} cardClassName={soBorder}
      />
      <KpiCard
        label="Cash in Hand" value={fmt(collected)} Icon={Landmark}
        valueClassName="text-white" iconClassName="text-[#7F77DD]"
        breakdown={[
          { label: 'Expected', value: fmt(expected), valueClassName: 'text-[#378ADD]' },
          { label: cDiffLabel, value: cMatched ? '—' : fmt(Math.abs(diff)), valueClassName: cDiffColor },
        ]}
      />
    </div>
  );
}
