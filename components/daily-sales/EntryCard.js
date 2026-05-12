'use client';
import { Pencil, Trash2, Image as ImageIcon } from 'lucide-react';
import { fmt, dayLabel } from '@/lib/utils';
import StatusIndicator from './shared/StatusIndicator';

// Card representation of one daily_sales entry. Every value is read straight
// off the entry / joined store with the same formulas the table cells use.
// There is no row-click handler on this page, so the card exposes the same
// Edit / Delete / receipt controls the table row has.
export default function EntryCard({ entry, store, status, statusTitle, isOwner, onEdit, onDelete, onViewReceipts }) {
  const warning = status === 'warning';
  const storeName = entry.stores?.name?.split(' - ').pop()?.trim() || entry.stores?.name || store?.name || '—';
  const dotColor = entry.stores?.color || store?.color || '#5F5E5A';
  const total = Number(entry.total_sales ?? entry.net_sales ?? 0);
  const gross = Number(entry.gross_sales ?? entry.total_sales ?? 0);
  const cash = Number(entry.cash_sales || 0) + Number(entry.r2_net || 0);
  const card = Number(entry.card_sales || 0);
  const cappChk = Number(entry.cashapp_check || 0);
  const ha = Number(entry.r1_house_account_amount ?? entry.credits ?? 0);
  const so = Number(entry.short_over ?? 0);
  const usesR2 = !!store?.has_register2;
  const basketDiff = usesR2 ? (Number(entry.r2_net || 0) - Number(entry.r1_canceled_basket || 0)) : null;

  // Positive short_over = SHORT (red, −); negative = OVER (green, +).
  const soDisp = Math.abs(so) < 0.01
    ? { t: fmt(0), c: 'text-[#5F5E5A]' }
    : (so > 0 ? { t: `−${fmt(Math.abs(so))}`, c: 'text-[#E24B4A]' } : { t: `+${fmt(Math.abs(so))}`, c: 'text-[#39FF14]' });
  const diffDisp = basketDiff == null
    ? { t: '—', c: 'text-[#5F5E5A]' }
    : (Math.abs(basketDiff) < 0.01 ? { t: fmt(0), c: 'text-[#39FF14]' } : (basketDiff < 0 ? { t: `-${fmt(Math.abs(basketDiff))}`, c: 'text-[#E24B4A]' } : { t: `+${fmt(basketDiff)}`, c: 'text-[#EF9F27]' }));

  const r1 = Array.isArray(entry.r1_receipt_urls) ? entry.r1_receipt_urls : (entry.shift_report_url ? [entry.shift_report_url] : []);
  const r2 = Array.isArray(entry.r2_receipt_urls) ? entry.r2_receipt_urls : (entry.safe_drop_url ? [entry.safe_drop_url] : []);
  const credit = Array.isArray(entry.credit_receipt_urls) ? entry.credit_receipt_urls : [];
  const allReceipts = [...r1, ...r2, ...credit];

  return (
    <div
      className="rounded-[10px] border border-[#2C2C2A] bg-[#0A0A0A] p-3"
      style={warning ? { borderLeft: '2px solid #EF9F27', background: 'linear-gradient(90deg, rgba(239,159,39,0.08), transparent 30%), #0A0A0A' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: dotColor }} />
            <span className="truncate text-[12px] font-medium text-white">{storeName}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-[#888780]">{dayLabel(entry.date)}</p>
        </div>
        <StatusIndicator state={status} variant="pill" title={statusTitle} />
      </div>

      <div className="mt-2 flex items-end justify-between border-t border-[#2C2C2A] pt-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[1px] text-[#5F5E5A]">Total</p>
          <p className="text-[15px] font-medium tabular-nums text-[#39FF14]">{fmt(total)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[1px] text-[#5F5E5A]">Diff</p>
          <p className={`text-[13px] font-medium tabular-nums ${diffDisp.c}`}>{diffDisp.t}</p>
        </div>
      </div>

      <p className="mt-1.5 text-[10px] text-[#888780]">
        Cash {fmt(cash)} · Card {fmt(card)} · Gross {fmt(gross)} · <span className={soDisp.c}>S/O {soDisp.t}</span>
        {cappChk !== 0 && <> · CApp/Chk {fmt(cappChk)}</>}
        {ha !== 0 && <> · H/A {fmt(ha)}</>}
      </p>

      {(allReceipts.length > 0 || isOwner) && (
        <div className="mt-2 flex items-center justify-end gap-1.5">
          {allReceipts.length > 0 && (
            <button
              type="button"
              onClick={() => onViewReceipts({ images: allReceipts, idx: 0, storeName: entry.stores?.name || '', date: entry.date })}
              title={`View ${allReceipts.length} receipt${allReceipts.length > 1 ? 's' : ''}`}
              className="inline-flex items-center gap-1 rounded-md border border-[#2C2C2A] bg-[#141414] px-2 py-1 text-[10px] font-medium text-[#378ADD] transition-colors hover:bg-[#1A1A1A]"
            >
              <ImageIcon size={12} strokeWidth={1.75} />{allReceipts.length}
            </button>
          )}
          {isOwner && (
            <>
              <button type="button" onClick={() => onEdit(entry)} className="inline-flex items-center gap-1 rounded-md border border-[#378ADD]/30 bg-[#378ADD]/10 px-2.5 py-1 text-[10px] font-medium text-[#378ADD] transition-colors hover:bg-[#378ADD]/20">
                <Pencil size={11} strokeWidth={1.75} />Edit
              </button>
              <button type="button" onClick={() => onDelete(entry)} className="inline-flex items-center gap-1 rounded-md border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-2.5 py-1 text-[10px] font-medium text-[#E24B4A] transition-colors hover:bg-[#E24B4A]/20">
                <Trash2 size={11} strokeWidth={1.75} />Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
