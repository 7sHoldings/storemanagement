'use client';

// Single KPI tile. The optional `breakdown` rows are revealed on hover
// (the data is the same Cash/Card/etc. lines the old cards showed inline).
export default function KpiCard({
  label,
  value,
  Icon,
  valueClassName = 'text-white',
  iconClassName = 'text-[#888780]',
  cardClassName = '',
  breakdown,
}) {
  return (
    <div className={`group relative flex flex-col gap-2 rounded-[10px] border border-[#2C2C2A] bg-[#0A0A0A] p-3 ${cardClassName}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[1px] text-[#888780]">{label}</span>
        {Icon && <Icon size={14} strokeWidth={1.75} className={`shrink-0 ${iconClassName}`} />}
      </div>
      <span className={`text-[16px] md:text-[18px] font-medium tabular-nums leading-none ${valueClassName}`}>{value}</span>
      {breakdown?.length > 0 && (
        <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-max rounded-lg border border-[#2C2C2A] bg-[#141414] px-3 py-2 text-[11px] shadow-xl opacity-0 -translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 motion-reduce:transition-none">
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-baseline justify-between gap-5 whitespace-nowrap">
              <span className="text-[#888780]">{b.label}</span>
              <span className={`font-medium tabular-nums ${b.valueClassName || 'text-white'}`}>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
