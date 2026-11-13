'use client';
import { fmt } from '@/lib/utils';

// Daily net sales: this period as a magenta line with a soft fill, the
// comparison period as a grey dashed line, aligned day-by-day.
const niceMax = (v) => {
  if (v <= 0) return 1000;
  const step = v > 20000 ? 10000 : v > 8000 ? 4000 : v > 4000 ? 2000 : v > 1000 ? 1000 : 500;
  return Math.ceil(v / step) * step;
};
const kLabel = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `$${v}`);
const shortDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function DailySalesChart({ current = [], previous = [], currentLabel = 'This period', previousLabel = 'Previous period' }) {
  const W = 1000;
  const H = 220;
  const n = Math.max(current.length, 1);
  const max = niceMax(Math.max(...current.map((d) => d.value), ...previous.map((d) => d.value), 0));
  const X = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const Y = (v) => H - (v / max) * H;
  const path = (series) => series.slice(0, n).map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.value).toFixed(1)}`).join(' ');
  const curLine = path(current);
  const prevLine = path(previous);
  const area = current.length ? `${curLine} L${X(current.length - 1).toFixed(1)} ${H} L0 ${H} Z` : '';
  const best = current.reduce((b, d) => (d.value > (b?.value ?? -1) ? d : b), null);
  const every = Math.max(1, Math.ceil(n / 7));
  const ticks = [max, (max * 2) / 3, max / 3, 0];

  if (current.length <= 1) {
    const now = current[0]?.value || 0;
    const before = previous[0]?.value || 0;
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-[#18181B]">Daily net sales</h2>
        <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13px] text-[#71717A]">{current[0] ? shortDay(current[0].date) : 'No day selected'}</span>
          <span className="text-[30px] font-semibold tabular-nums text-[#18181B]">{fmt(now)}</span>
          {previous[0] && <span className="text-[13px] text-[#71717A]">{previousLabel}: {fmt(before)}</span>}
          <span className="text-[12px] text-[#A1A1AA] mt-2">Pick a longer range to see the daily trend.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#18181B]">Daily net sales</h2>
        <div className="flex gap-4 text-[12px] text-[#52525B]">
          <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-0.5 bg-[#A21CAF]" />{currentLabel}</span>
          {previous.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-[#A1A1AA]" />{previousLabel}</span>}
        </div>
      </div>
      <div className="flex gap-2.5">
        <div className="flex flex-col justify-between h-[220px] text-[11px] text-[#71717A] text-right tabular-nums">
          {ticks.map((t) => <span key={t}>{kLabel(Math.round(t))}</span>)}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-[220px] block overflow-visible"
            role="img"
            aria-label={`Daily net sales${best ? `, best day ${shortDay(best.date)} at ${fmt(best.value)}` : ''}`}
          >
            {[0, 1, 2, 3].map((i) => (
              <line key={i} x1="0" x2={W} y1={(i * H) / 3} y2={(i * H) / 3} stroke="#F0F0F2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {area && <path d={area} fill="rgba(162,28,175,0.08)" />}
            {previous.length > 0 && <path d={prevLine} fill="none" stroke="#A1A1AA" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
            {current.length > 0 && <path d={curLine} fill="none" stroke="#A21CAF" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="relative h-4 text-[11px] text-[#71717A]">
            {current.map((d, i) => (i % every === 0 || i === n - 1) && (
              <span key={d.date} className={`absolute whitespace-nowrap ${i === 0 ? '' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(X(i) / W) * 100}%` }}>{shortDay(d.date)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
