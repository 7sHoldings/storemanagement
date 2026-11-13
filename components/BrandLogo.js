// The 7s Vape Love shop sign as a logo: magenta letters with a heart for the
// O, on a black badge with a thin neon-green edge (the sign's glow).
//   size="sm"  — top bar / phone header
//   size="lg"  — sign-in page, with the VAPOR · CBD · KRATOM line
export default function BrandLogo({ size = 'sm', className = '' }) {
  const lg = size === 'lg';
  const font = lg ? 52 : 15;
  const heart = lg ? 42 : 12;
  return (
    <span
      className={`inline-flex flex-col items-center bg-[#0A0A0C] ${lg ? 'rounded-[18px] px-8 pt-[18px] pb-[14px] gap-2' : 'rounded-lg px-[9px] pt-[6px] pb-[5px]'} ${className}`}
      style={{ boxShadow: lg ? '0 0 0 3px #39FF14, 0 0 44px rgba(57,255,20,0.45)' : '0 0 0 1px #39FF14' }}
      role="img"
      aria-label="7's Vape Love"
    >
      <span
        aria-hidden="true"
        className="font-brand font-bold leading-none whitespace-nowrap inline-flex items-center"
        style={{ fontSize: font, color: '#D946EF' }}
      >
        7&apos;s VAPE L
        <svg width={heart} height={heart * 0.92} viewBox="0 0 24 22" style={{ margin: lg ? '0 2px' : '0 1px' }}>
          <path d="M12 21.5S1.5 14.8 1.5 7.6A5.6 5.6 0 0 1 12 4.8a5.6 5.6 0 0 1 10.5 2.8c0 7.2-10.5 13.9-10.5 13.9z" fill="#D946EF" />
        </svg>
        VE
      </span>
      {lg && (
        <span aria-hidden="true" className="text-[14px] font-bold tracking-[0.14em] text-[#D4D4D8] whitespace-nowrap">
          VAPOR ◆ CBD ◆ KRATOM
        </span>
      )}
    </span>
  );
}
