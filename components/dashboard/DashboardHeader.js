'use client';

// Greeting row: date + greeting on the left, consolidated live-status pill +
// the "Today" stat chip on the right. All values are passed in from the page.
export default function DashboardHeader({ dateStr, greeting, isOwner, nrsStatus, syncedAgo, todayLabel, todayDeltaPct }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[12px] text-[#888780]">{dateStr}</p>
        <h1 className="text-[18px] md:text-[24px] font-medium tracking-tight text-white">{greeting}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-[20px] border border-[#2C2C2A] bg-[#0A0A0A] px-3 py-[5px] text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]" />
          <span className="font-medium text-white">Live</span>
          {isOwner && nrsStatus !== null && (
            <>
              <span className="text-[#5F5E5A]">·</span>
              <span className={`font-medium ${nrsStatus ? 'text-white' : 'text-[#E24B4A]'}`}>{nrsStatus ? 'NRS Connected' : 'NRS Invalid'}</span>
            </>
          )}
          {syncedAgo && (
            <>
              <span className="text-[#5F5E5A]">·</span>
              <span className="text-[#5F5E5A]">{syncedAgo}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-[20px] border border-[#2C2C2A] bg-[#0A0A0A] px-3 py-[5px] text-[11px]">
          <span className="text-[#888780]">Today</span>
          <span className="font-medium tabular-nums text-white">{todayLabel}</span>
          {todayDeltaPct != null && (
            <span className={`font-medium tabular-nums ${todayDeltaPct >= 0 ? 'text-[#39FF14]' : 'text-[#E24B4A]'}`}>
              {todayDeltaPct >= 0 ? '+' : ''}{todayDeltaPct.toFixed(1)}%
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
