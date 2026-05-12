'use client';

// Severity/label/CTA are derived from the existing alert `type` field
// (the alert data shape is unchanged — there is no `severity` field).
const SEV = {
  danger:  { color: '#E24B4A', label: 'CRITICAL', cta: 'Fix now' },
  warning: { color: '#EF9F27', label: 'WARNING',  cta: 'Review' },
  info:    { color: '#378ADD', label: 'INFO',     cta: 'Review' },
};

export default function AlertCard({ type = 'info', text, onAction }) {
  const s = SEV[type] || SEV.info;
  const solid = type === 'danger';
  return (
    <div className="flex flex-col gap-2 rounded-lg p-3 bg-[rgba(10,10,10,0.6)]" style={{ borderLeft: `2px solid ${s.color}` }}>
      <span className="text-[10px] font-medium uppercase tracking-[1px]" style={{ color: s.color }}>{s.label}</span>
      <p className="text-[12px] leading-[1.4] text-white">{text}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-1 w-full rounded-md py-1.5 text-[11px] font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0A0A0A]"
        style={solid
          ? { background: s.color, color: '#FFFFFF' }
          : { background: 'transparent', color: s.color, border: `1px solid ${s.color}` }}
      >
        {s.cta}
      </button>
    </div>
  );
}
