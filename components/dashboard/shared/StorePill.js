'use client';

// Restyled store filter pill. `color` is omitted for the "All Stores" pill.
// Behaviour (toggle / clear) is owned by the parent — this is presentational.
export default function StorePill({ active, color, label, onClick }) {
  const activeStyle = active
    ? (color ? { background: color, color: '#FFFFFF' } : { background: '#39FF14', color: '#0A0A0A' })
    : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      style={activeStyle}
      className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14] ${active ? 'shadow-sm' : 'border border-[#2C2C2A] text-[#C4C4C4] hover:bg-[#1A1A1A]'}`}
    >
      {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );
}
