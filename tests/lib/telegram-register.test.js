import { describe, it, expect } from 'vitest';
import { buildBasketMessage, buildEventMessage, escapeHtml, money, clockTime } from '@/lib/telegram-register';

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
    expect(msg).toContain('7s Vape Love - Reno');
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
    expect(msg).toContain('Sale cancelled');
    expect(msg).toContain('Lines: 1');
  });

  it('reports a no-sale drawer opening', () => {
    expect(buildEventMessage(store, { kind: 'no_sale', cashier: 'Billy' }))
      .toContain('No sale — drawer opened');
  });

  it('still renders an event kind it has no wording for', () => {
    expect(buildEventMessage(store, { kind: 'something_new', cashier: 'Billy' }))
      .toContain('something_new');
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
