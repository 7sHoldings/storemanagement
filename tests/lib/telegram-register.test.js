import { describe, it, expect } from 'vitest';
import { buildBasketMessage, buildEventMessage, basketTag, buildTotalsFooter, escapeHtml, money, clockTime } from '@/lib/telegram-register';

const store = { name: '7s Vape Love - Reno' };

const basket = {
  basket_no: '43911065707518',
  entered_at: '2026-09-14T16:09:00.000Z', // 11:09 Central
  total_cents: 4000,
  manual_count: 0,
  discount_cents: 998,
  items: [{
    entry_method: 'scanned', qty: 2, name: 'Lost mary blue razz ice 35000',
    amount_cents: 4000, discount_cents: 998, dept: 'Vape',
  }],
};

describe('helpers', () => {
  // sendTelegram posts parse_mode HTML, so POS text must be escaped or a
  // stray & silently kills the whole message.
  it('escapes HTML that would break the message', () => {
    expect(escapeHtml('Ben & Jerry <XL>')).toBe('Ben &amp; Jerry &lt;XL&gt;');
  });

  it('formats cents as money', () => {
    expect(money(4000)).toBe('$40.00');
    expect(money(0)).toBe('$0.00');
    expect(money(null)).toBe('$0.00');
  });

  it('shows the store’s local clock time', () => {
    expect(clockTime('2026-09-14T16:09:00.000Z')).toBe('11:09 AM');
    expect(clockTime(null)).toBe('');
    expect(clockTime('rubbish')).toBe('');
  });
});

describe('buildBasketMessage', () => {
  it('names the store, time, item and total', () => {
    const msg = buildBasketMessage(store, basket);
    expect(msg).toContain('Reno');
    expect(msg).toContain('11:09 AM');
    expect(msg).toContain('Lost mary blue razz ice 35000');
    expect(msg).toContain('Total $40.00');
  });

  it('marks a scanned line', () => {
    expect(buildBasketMessage(store, basket)).toContain('⊙ <b>SCANNED</b>  2× Lost mary');
  });

  // A hand-keyed line has no item name at all, which is the thing to see.
  it('marks a keyed line by its department', () => {
    const msg = buildBasketMessage(store, {
      ...basket, manual_count: 1, discount_cents: 0,
      items: [{ entry_method: 'manual', qty: 4, name: null, dept: 'pre rolls', amount_cents: 1996 }],
    });
    expect(msg).toContain('✎ <b>MANUAL </b>  4× pre rolls');
    expect(msg).toContain('1 of 1 item keyed by hand, not scanned');
  });

  it('pluralises the keyed-item warning', () => {
    const msg = buildBasketMessage(store, {
      ...basket, manual_count: 3, item_count: 3,
      items: [{ entry_method: 'manual', qty: 1, dept: 'x', amount_cents: 100 }],
    });
    expect(msg).toContain('3 of 3 items keyed by hand');
  });

  it('says nothing about keying when everything was scanned', () => {
    expect(buildBasketMessage(store, basket)).not.toContain('keyed by hand');
  });

  it('calls out a discount', () => {
    expect(buildBasketMessage(store, basket)).toContain('Discount $9.98');
  });

  it('escapes an item name typed with an ampersand', () => {
    const msg = buildBasketMessage(store, {
      ...basket, items: [{ entry_method: 'scanned', qty: 1, name: 'Ben & Jerry', amount_cents: 500 }],
    });
    expect(msg).toContain('Ben &amp; Jerry');
    expect(msg).not.toMatch(/Ben & Jerry/);
  });

  it('drops the quantity prefix for a single item', () => {
    const msg = buildBasketMessage(store, {
      ...basket, items: [{ entry_method: 'scanned', qty: 1, name: 'Sprite', amount_cents: 149 }],
    });
    expect(msg).toContain('⊙ <b>SCANNED</b>  Sprite');
    expect(msg).not.toContain('1× Sprite');
  });
});

describe('buildEventMessage', () => {
  it('reports a void with the cashier, item and amount', () => {
    const msg = buildEventMessage(store, {
      kind: 'void_item', logged_at: '2026-09-14T16:03:59.000Z',
      cashier: 'Billy', description: 'Zour z', amount_cents: 3499,
    });
    expect(msg).toContain('Item voided');
    expect(msg).toContain('Billy');
    expect(msg).toContain('Zour z');
    expect(msg).toContain('$34.99');
    expect(msg).toContain('11:03 AM');
  });

  it('reports a cancelled basket with its line count', () => {
    const msg = buildEventMessage(store, {
      kind: 'cancel_basket', cashier: 'Billy', amount_cents: 1081, lines: 1,
    });
    expect(msg).toContain('CANCELLED');
    expect(msg).toContain('Whole sale cancelled');
    expect(msg).toContain('Lines: 1');
  });

  it('reports a no-sale drawer opening', () => {
    expect(buildEventMessage(store, { kind: 'no_sale', cashier: 'Billy' }))
      .toContain('NO SALE');
  });

  it('still renders an event kind it has no wording for', () => {
    expect(buildEventMessage(store, { kind: 'something_new', cashier: 'Billy' }))
      .toContain('SOMETHING_NEW');
  });

  it('omits fields NRS did not give us', () => {
    const msg = buildEventMessage(store, { kind: 'no_sale' });
    expect(msg).not.toContain('Cashier:');
    expect(msg).not.toContain('Amount:');
  });

  it('escapes a cashier name with markup in it', () => {
    expect(buildEventMessage(store, { kind: 'void_item', cashier: '<b>Bob' }))
      .toContain('&lt;b&gt;Bob');
  });
});

describe('buildBasketMessage — cashier and entry method', () => {
  it('names the cashier who rang the sale', () => {
    expect(buildBasketMessage(store, { ...basket, cashier: 'Billy' }))
      .toContain('👤 Cashier: <b>Billy</b>');
  });

  it('leaves the line out when the cashier is unknown', () => {
    expect(buildBasketMessage(store, basket)).not.toContain('Cashier:');
  });

  // Spelled out, not left to a glyph that is easy to miss on a phone.
  it('labels each line SCANNED or MANUAL in words', () => {
    const msg = buildBasketMessage(store, {
      ...basket, cashier: 'Billy', manual_count: 1, item_count: 2,
      items: [
        { entry_method: 'scanned', qty: 1, name: 'Sprite', amount_cents: 149 },
        { entry_method: 'manual', qty: 4, name: null, dept: 'pre rolls', amount_cents: 1996 },
      ],
    });
    expect(msg).toContain('⊙ <b>SCANNED</b>');
    expect(msg).toContain('✎ <b>MANUAL </b>');
    expect(msg).toContain('pre rolls');
    expect(msg).toContain('1 of 2 items keyed by hand, not scanned');
  });

  it('escapes a cashier name with markup in it', () => {
    expect(buildBasketMessage(store, { ...basket, cashier: '<b>Bob' })).toContain('&lt;b&gt;Bob');
  });
});

// The heading has to say what the message is without opening it — that is
// all a phone's notification list shows.
describe('heading tags', () => {
  const withItems = (items, counts = {}) => ({
    ...basket, items, item_count: items.length,
    manual_count: items.filter(i => i.entry_method === 'manual').length,
    scanned_count: items.filter(i => i.entry_method === 'scanned').length,
    ...counts,
  });
  const scanned = { entry_method: 'scanned', qty: 1, name: 'Sprite', amount_cents: 149 };
  const manual = { entry_method: 'manual', qty: 1, name: null, dept: 'pre rolls', amount_cents: 1996 };
  const heading = (b) => buildBasketMessage(store, b).split('\n')[0];

  it('says SCANNED when nothing was keyed', () => {
    expect(heading(withItems([scanned, scanned]))).toContain('<b>SCANNED</b>');
  });

  it('says MANUAL ENTRY when nothing was scanned', () => {
    expect(heading(withItems([manual]))).toContain('<b>MANUAL ENTRY</b>');
  });

  it('says MANUAL & SCANNED for a mixed basket', () => {
    expect(heading(withItems([scanned, manual]))).toContain('<b>MANUAL &amp; SCANNED</b>');
  });

  it('keeps the store and time in the heading', () => {
    const h = heading(withItems([scanned]));
    expect(h).toContain('Reno');
    // The group is already per store; the full name only wraps the heading.
    expect(h).not.toContain('7s Vape Love -');
    expect(h).toContain('11:09 AM');
  });

  it('falls back to counts when the caller passes no items', () => {
    expect(basketTag({ manual_count: 2, scanned_count: 0 }).label).toBe('MANUAL ENTRY');
    expect(basketTag({ manual_count: 0, scanned_count: 3 }).label).toBe('SCANNED');
    expect(basketTag({ manual_count: 1, scanned_count: 1 }).label).toBe('MANUAL & SCANNED');
  });

  it('does not claim a method for an empty basket', () => {
    expect(basketTag({ items: [] }).label).toBe('SALE');
  });

  for (const [kind, tag] of [
    ['void_item', 'VOIDED'],
    ['cancel_basket', 'CANCELLED'],
    ['no_sale', 'NO SALE'],
    ['override', 'PRICE OVERRIDE'],
    ['refund', 'REFUND'],
  ]) {
    it(`heads a ${kind} with ${tag}`, () => {
      const h = buildEventMessage(store, { kind, cashier: 'Billy' }).split('\n')[0];
      expect(h).toContain(`<b>${tag}</b>`);
      expect(h).toContain('Reno');
    });
  }

  it('upper-cases an event kind it has no wording for', () => {
    expect(buildEventMessage(store, { kind: 'something_new' }).split('\n')[0])
      .toContain('<b>SOMETHING_NEW</b>');
  });

  it('explains the event under the tag', () => {
    expect(buildEventMessage(store, { kind: 'no_sale', cashier: 'Billy' }))
      .toContain('Drawer opened with no sale');
  });
});

// Telegram rejects a whole message over one unescaped ampersand, which would
// mean the sale is simply never announced.
describe('no raw ampersand reaches Telegram', () => {
  it('escapes the & in the mixed-basket tag', () => {
    const msg = buildBasketMessage(store, {
      ...basket, manual_count: 1, scanned_count: 1, item_count: 2,
      items: [
        { entry_method: 'scanned', qty: 1, name: 'Sprite', amount_cents: 149 },
        { entry_method: 'manual', qty: 1, dept: 'pre rolls', amount_cents: 1996 },
      ],
    });
    expect(msg).toContain('MANUAL &amp; SCANNED');
    expect(msg).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });
});

describe('running day total', () => {
  const totals = { sales_cents: 82016, baskets: 30, cash_cents: 1800, card_cents: 86383 };

  it('puts the day so far at the foot of a sale', () => {
    const msg = buildBasketMessage(store, basket, totals);
    expect(msg).toContain('📊 <b>Today: $820.16</b> · 30 sales');
    expect(msg).toContain('💵 Cash $18.00 · 💳 Card $863.83');
  });

  it('comes after the sale, not before it', () => {
    const msg = buildBasketMessage(store, basket, totals);
    expect(msg.indexOf('Total $40.00')).toBeLessThan(msg.indexOf('Today: $820.16'));
  });

  it('omits the footer when NRS gave us no totals', () => {
    expect(buildBasketMessage(store, basket, null)).not.toContain('Today:');
    expect(buildBasketMessage(store, basket)).not.toContain('Today:');
  });

  it('says "1 sale" for the day’s first', () => {
    const footer = buildTotalsFooter({ sales_cents: 1499, baskets: 1 });
    expect(footer).toContain('· 1 sale');
    expect(footer).not.toContain('1 sales');
  });

  it('drops the payment split when there is none yet', () => {
    expect(buildTotalsFooter({ sales_cents: 0, baskets: 0, cash_cents: 0, card_cents: 0 }))
      .not.toContain('Cash');
  });
});
