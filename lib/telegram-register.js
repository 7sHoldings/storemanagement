// Telegram messages for the register feed.
//
// Text is HTML — sendTelegram posts with parse_mode HTML — so anything coming
// from the POS (item names typed by staff, cashier names) has to be escaped
// or a stray & or < silently kills the whole message.

import { storeShortName } from '@/lib/utils';

const CENTRAL = 'America/Chicago';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function money(cents) {
  const n = Number(cents || 0) / 100;
  return `$${n.toFixed(2)}`;
}

export function clockTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: CENTRAL, hour: 'numeric', minute: '2-digit',
  });
}

// How the line got into the register. Spelled out rather than left to a
// symbol: this is the thing the feed exists to surface, and a glyph alone is
// easy to miss on a phone.
const METHOD = {
  scanned: { mark: '⊙', label: 'SCANNED' },
  manual: { mark: '✎', label: 'MANUAL ' },
};

// What a basket is, in one phrase. This leads the message so the kind of
// transaction is readable from the notification list without opening it.
export function basketTag(basket) {
  const items = basket.items || [];
  const manual = basket.manual_count ?? items.filter(i => i.entry_method === 'manual').length;
  const scanned = basket.scanned_count ?? items.filter(i => i.entry_method === 'scanned').length;

  if (manual > 0 && scanned > 0) return { icon: '✍️', label: 'MANUAL & SCANNED' };
  if (manual > 0) return { icon: '✍️', label: 'MANUAL ENTRY' };
  if (scanned > 0) return { icon: '🧾', label: 'SCANNED' };
  return { icon: '🧾', label: 'SALE' };
}

export function buildBasketMessage(store, basket) {
  const lines = [];
  const tag = basketTag(basket);
  const time = clockTime(basket.entered_at || basket.closed_at);
  lines.push(`${tag.icon} <b>${escapeHtml(tag.label)}</b> · ${escapeHtml(storeShortName(store.name))}${time ? ` · ${time}` : ''}`);
  if (basket.cashier) lines.push(`👤 Cashier: <b>${escapeHtml(basket.cashier)}</b>`);
  lines.push('');

  for (const item of items(basket)) {
    const m = METHOD[item.entry_method] || { mark: '·', label: '       ' };
    const qty = Number(item.qty) > 1 ? `${item.qty}× ` : '';
    // A hand-keyed line has no item name at all — only the department it was
    // rung into, which is exactly what makes it worth showing.
    const label = item.name?.trim() || `${item.dept || 'no department'}`;
    const disc = item.discount_cents ? `  −${money(item.discount_cents)}` : '';
    lines.push(`${m.mark} <b>${m.label}</b>  ${qty}${escapeHtml(label)}  ${money(item.amount_cents)}${disc}`);
  }

  lines.push('');
  lines.push(`<b>Total ${money(basket.total_cents)}</b>`);

  const manual = basket.manual_count || 0;
  const total = basket.item_count || items(basket).length;
  if (manual > 0) {
    lines.push(`⚠️ <b>${manual} of ${total} item${total === 1 ? '' : 's'} keyed by hand, not scanned</b>`);
  }
  if (basket.discount_cents > 0) {
    lines.push(`🏷️ Discount ${money(basket.discount_cents)}`);
  }
  lines.push(`<i>#${escapeHtml(basket.basket_no)}</i>`);

  return lines.join('\n');
}

const items = (basket) => basket.items || [];

const EVENT_STYLE = {
  void_item: { icon: '🚫', label: 'VOIDED', detail: 'Item voided' },
  cancel_basket: { icon: '❌', label: 'CANCELLED', detail: 'Whole sale cancelled' },
  no_sale: { icon: '🔓', label: 'NO SALE', detail: 'Drawer opened with no sale' },
  override: { icon: '✏️', label: 'PRICE OVERRIDE', detail: 'Price changed at the register' },
  refund: { icon: '↩️', label: 'REFUND', detail: 'Money returned' },
};

export function buildEventMessage(store, event) {
  const style = EVENT_STYLE[event.kind]
    || { icon: '⚠️', label: String(event.kind || 'EVENT').toUpperCase(), detail: null };
  const time = clockTime(event.logged_at);
  const out = [`${style.icon} <b>${escapeHtml(style.label)}</b> · ${escapeHtml(storeShortName(store.name))}${time ? ` · ${time}` : ''}`];

  if (style.detail) out.push(style.detail);
  if (event.cashier) out.push(`👤 Cashier: <b>${escapeHtml(event.cashier)}</b>`);
  if (event.description) out.push(`Item: ${escapeHtml(event.description)}`);
  if (event.amount_cents != null) out.push(`Amount: <b>${money(event.amount_cents)}</b>`);
  if (event.lines) out.push(`Lines: ${event.lines}`);

  return out.join('\n');
}
