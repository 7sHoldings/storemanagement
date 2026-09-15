// Telegram messages for the register feed.
//
// Text is HTML — sendTelegram posts with parse_mode HTML — so anything coming
// from the POS (item names typed by staff, cashier names) has to be escaped
// or a stray & or < silently kills the whole message.

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

// ⊙ scanned, ✎ keyed by hand. The distinction is the point of the feed, so it
// leads each line rather than being buried at the end.
const METHOD_MARK = { scanned: '⊙', manual: '✎' };

export function buildBasketMessage(store, basket) {
  const lines = [];
  const time = clockTime(basket.entered_at || basket.closed_at);
  lines.push(`🧾 <b>${escapeHtml(store.name)}</b>${time ? ` · ${time}` : ''}`);

  for (const item of basket.items || []) {
    const mark = METHOD_MARK[item.entry_method] || '·';
    const qty = Number(item.qty) > 1 ? `${item.qty}× ` : '';
    // A manual line has no item name at all — only the department it was rung
    // into, which is exactly what makes it worth seeing.
    const label = item.name?.trim() || `${item.dept || 'no department'} (keyed)`;
    const disc = item.discount_cents ? `  −${money(item.discount_cents)}` : '';
    lines.push(`${mark} ${qty}${escapeHtml(label)}  ${money(item.amount_cents)}${disc}`);
  }

  lines.push(`<b>Total ${money(basket.total_cents)}</b>`);

  const manual = basket.manual_count || 0;
  if (manual > 0) {
    lines.push(`⚠️ ${manual} item${manual === 1 ? '' : 's'} keyed by hand, not scanned`);
  }
  if (basket.discount_cents > 0) {
    lines.push(`🏷️ Discount ${money(basket.discount_cents)}`);
  }
  lines.push(`<i>#${escapeHtml(basket.basket_no)}</i>`);

  return lines.join('\n');
}

const EVENT_STYLE = {
  void_item: { icon: '🚫', label: 'Item voided' },
  cancel_basket: { icon: '❌', label: 'Sale cancelled' },
  no_sale: { icon: '🔓', label: 'No sale — drawer opened' },
  override: { icon: '✏️', label: 'Price override' },
  refund: { icon: '↩️', label: 'Refund' },
};

export function buildEventMessage(store, event) {
  const style = EVENT_STYLE[event.kind] || { icon: '⚠️', label: event.kind };
  const time = clockTime(event.logged_at);
  const out = [`${style.icon} <b>${style.label}</b> · ${escapeHtml(store.name)}${time ? ` · ${time}` : ''}`];

  if (event.cashier) out.push(`Cashier: <b>${escapeHtml(event.cashier)}</b>`);
  if (event.description) out.push(`Item: ${escapeHtml(event.description)}`);
  if (event.amount_cents != null) out.push(`Amount: <b>${money(event.amount_cents)}</b>`);
  if (event.lines) out.push(`Lines: ${event.lines}`);

  return out.join('\n');
}
