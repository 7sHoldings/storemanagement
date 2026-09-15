import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sample from '../fixtures/nrs-baskets-sample.json';

process.env.NRS_API_BASE = 'https://nrs.test';
process.env.NRS_USER_TOKEN = 'u00000-test-token';

const {
  parseNrsTimestamp, entryMethod, normalizeBasketRow, groupIntoBaskets,
  extractEvents, dedupeKey, fetchBasketLines,
} = await import('@/lib/nrs-baskets');

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

describe('parseNrsTimestamp', () => {
  // NRS sends basket times with no zone; the stores are all Central.
  it('reads a zoneless basket time as Central', () => {
    expect(parseNrsTimestamp('2026-09-14 11:09')).toBe('2026-09-14T16:09:00.000Z');
  });

  it('keeps the zone an event timestamp already carries', () => {
    expect(parseNrsTimestamp('2026-09-14 11:03:59.518598-05')).toBe('2026-09-14T16:03:59.518Z');
  });

  it('returns null rather than an Invalid Date', () => {
    expect(parseNrsTimestamp(null)).toBeNull();
    expect(parseNrsTimestamp('not a date')).toBeNull();
  });
});

// The distinction the whole feed exists for.
describe('entryMethod', () => {
  it('counts a line with a UPC as scanned', () => {
    expect(entryMethod({ upc_plu: '049000001327' })).toBe('scanned');
  });

  it('counts a line with no UPC as keyed by hand', () => {
    expect(entryMethod({ upc_plu: '', dept: 'pre rolls' })).toBe('manual');
    expect(entryMethod({ dept: 'pre rolls' })).toBe('manual');
  });

  it('does not treat whitespace as a UPC', () => {
    expect(entryMethod({ upc_plu: '   ' })).toBe('manual');
  });
});

describe('against the real NRS sample', () => {
  const lines = sample.basketRows.map(normalizeBasketRow);

  it('normalizes every row without losing one', () => {
    expect(lines).toHaveLength(sample.basketRows.length);
    expect(lines.every(l => l.basket_no)).toBe(true);
  });

  it('reads a scanned line off the wire', () => {
    const l = lines.find(x => x.upc === '5056716406938');
    expect(l).toMatchObject({
      name: 'Lost mary blue razz ice 35000',
      qty: 2, amount_cents: 4000, discount_cents: 998, entry_method: 'scanned',
    });
  });

  it('recognises the hand-keyed department lines', () => {
    const manual = lines.filter(l => l.entry_method === 'manual');
    expect(manual.length).toBeGreaterThan(0);
    // NRS gives these no UPC and no name at all — only a department.
    expect(manual.every(l => !l.upc && !l.name)).toBe(true);
    expect(manual.map(l => l.dept)).toContain('pre rolls');
  });

  it('rolls lines up into the sale they belong to', () => {
    const baskets = groupIntoBaskets(lines, '2026-09-14');
    const multi = baskets.find(b => b.basket_no === '43911313171455');
    expect(multi.item_count).toBe(2);
    expect(multi.items.map(i => i.dept).sort()).toEqual(["Drink's", 'Pills']);
  });

  it('counts scanned against keyed per basket', () => {
    const baskets = groupIntoBaskets(lines, '2026-09-14');
    for (const b of baskets) {
      expect(b.scanned_count + b.manual_count).toBe(b.item_count);
    }
  });

  it('carries the basket total through', () => {
    const b = groupIntoBaskets(lines, '2026-09-14').find(x => x.basket_no === '43911065707518');
    expect(b.total_cents).toBe(4000);
  });
});

describe('extractEvents against the real sample', () => {
  const events = extractEvents({ data: sample.events }, '2026-09-14');

  it('finds voided items with the cashier who voided them', () => {
    const voids = events.filter(e => e.kind === 'void_item');
    expect(voids.length).toBe(sample.events.voiditeminfo.length);
    expect(voids[0]).toMatchObject({ cashier: 'Billy', kind: 'void_item' });
    expect(voids[0].amount_cents).toBeGreaterThan(0);
    expect(voids[0].logged_at).toMatch(/^2026-09-14T/);
  });

  it('finds cancelled baskets', () => {
    const cancels = events.filter(e => e.kind === 'cancel_basket');
    expect(cancels.length).toBe(sample.events.cancelbasketinfo.length);
    expect(cancels[0].cashier).toBeTruthy();
  });

  it('handles an empty no-sale list without inventing rows', () => {
    expect(events.filter(e => e.kind === 'no_sale')).toHaveLength(0);
  });

  it('copes with a payload missing every event key', () => {
    expect(extractEvents({ data: {} }, '2026-09-14')).toEqual([]);
    expect(extractEvents(null, '2026-09-14')).toEqual([]);
  });

  // Re-polling the same window must not re-announce anything.
  it('gives the same event the same dedupe key every time', () => {
    const again = extractEvents({ data: sample.events }, '2026-09-14');
    expect(again.map(e => e.dedupe_key)).toEqual(events.map(e => e.dedupe_key));
  });

  it('gives different events different keys', () => {
    const keys = new Set(events.map(e => e.dedupe_key));
    expect(keys.size).toBe(events.length);
  });

  it('separates two events that differ only by amount', () => {
    const a = dedupeKey('void_item', { logged: 'x', user: 'Billy', amount: '100' });
    const b = dedupeKey('void_item', { logged: 'x', user: 'Billy', amount: '200' });
    expect(a).not.toBe(b);
  });
});

describe('fetchBasketLines', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const page = (rows, total) => ok({ data: rows, recordsTotal: total, recordsFiltered: total });

  it('asks the baskets endpoint for the date range', async () => {
    fetch.mockResolvedValue(page([], 0));
    await fetchBasketLines(58968, '2026-09-14', '2026-09-14');
    expect(fetch.mock.calls[0][0]).toContain('/pcrhist/58968/0/baskets/2026-09-14/2026-09-14?');
  });

  it('follows NRS paging until every line is in', async () => {
    const row = (n) => ({ ...sample.basketRows[0], itemno: n, basket: `b${n}` });
    fetch
      .mockResolvedValueOnce(page([row(1), row(2)], 3))
      .mockResolvedValueOnce(page([row(3)], 3));

    const lines = await fetchBasketLines(58968, '2026-09-14', '2026-09-14', { pageSize: 2 });
    expect(lines).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops on a short page rather than looping', async () => {
    fetch.mockResolvedValue(page([sample.basketRows[0]], 999));
    const lines = await fetchBasketLines(58968, '2026-09-14', '2026-09-14', { pageSize: 200 });
    expect(lines).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns nothing for a day with no sales', async () => {
    fetch.mockResolvedValue(page([], 0));
    expect(await fetchBasketLines(58968, '2026-09-15', '2026-09-15')).toEqual([]);
  });
});
