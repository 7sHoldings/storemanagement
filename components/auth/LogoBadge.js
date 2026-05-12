// Pill-shaped brand badge: black fill, neon-green border, "7's VAPE ♥ LOVE".
export default function LogoBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-[30px] border border-[#39FF14] bg-[#0A0A0A] px-[18px] py-[10px] text-[15px] font-medium leading-none shadow-[0_0_18px_rgba(57,255,20,0.18)]">
      <span className="text-[#FF1493]">7&apos;s</span>
      <span className="tracking-[1px] text-[#39FF14]">VAPE</span>
      <span aria-hidden="true" className="text-[#FF1493]">&#9829;</span>
      <span className="tracking-[1px] text-[#39FF14]">LOVE</span>
    </div>
  );
}
