import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sample from '../fixtures/nrs-baskets-sample.json';

process.env.NRS_API_BASE = 'https://nrs.test';
process.env.NRS_USER_TOKEN = 'u00000-test-token';

const {
  parseNrsTimestamp, entryMethod, normalizeBasketRow, groupIntoBaskets,
  extractEvents, dedupeKey, fetchBasketLines,
  parseNrsSessionTime, extractSessions, resolveCashier, extractDayTotals,
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

// The basket rows carry no cashier; the day's register sessions do.
describe('cashier attribution', () => {
  // NRS stamps session times with a Z they are not in — this store's session
  // opens 11:02:40 and its first basket opens 11:03 on the same clock.
  it('reads a session time as store-local despite the Z', () => {
    expect(parseNrsSessionTime('2026-09-14T11:02:40Z')).toBe('2026-09-14T16:02:40.000Z');
  });

  it('lines a session up with the sales it rang', () => {
    const sessions = extractSessions({ data: { sessions: [
      { name: 'Billy', opened: '2026-09-14T11:02:40Z', closed: '2026-09-14T22:01:28Z' },
    ] } });
    // First basket of the day, entered 11:09 local.
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 11:09'))).toBe('Billy');
  });

  it('reads the single-session shape too', () => {
    const s = extractSessions({ data: { sessionstats: { name: 'Billy', opened: '2026-09-14T11:02:40Z', closed: null } } });
    expect(s).toHaveLength(1);
    expect(s[0].name).toBe('Billy');
  });

  it('picks the cashier whose shift covers the sale', () => {
    const sessions = extractSessions({ data: { sessions: [
      { name: 'Billy', opened: '2026-09-14T08:00:00Z', closed: '2026-09-14T14:00:00Z' },
      { name: 'Ana', opened: '2026-09-14T14:00:00Z', closed: '2026-09-14T22:00:00Z' },
    ] } });
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 09:30'))).toBe('Billy');
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 17:30'))).toBe('Ana');
  });

  it('treats a session with no close as still open', () => {
    const sessions = extractSessions({ data: { sessions: [
      { name: 'Billy', opened: '2026-09-14T08:00:00Z', closed: null },
    ] } });
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 23:00'))).toBe('Billy');
  });

  it('gives the sale to the later shift when two overlap', () => {
    const sessions = extractSessions({ data: { sessions: [
      { name: 'Billy', opened: '2026-09-14T08:00:00Z', closed: null },
      { name: 'Ana', opened: '2026-09-14T12:00:00Z', closed: null },
    ] } });
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 13:00'))).toBe('Ana');
  });

  // Guessing a name onto a sale would be worse than leaving it blank.
  it('returns nothing rather than guessing', () => {
    const sessions = extractSessions({ data: { sessions: [
      { name: 'Billy', opened: '2026-09-14T14:00:00Z', closed: '2026-09-14T22:00:00Z' },
    ] } });
    expect(resolveCashier(sessions, parseNrsTimestamp('2026-09-14 09:00'))).toBeNull();
    expect(resolveCashier([], '2026-09-14T16:00:00.000Z')).toBeNull();
    expect(resolveCashier(sessions, null)).toBeNull();
  });

  it('ignores a session with no name or no open time', () => {
    const s = extractSessions({ data: { sessions: [
      { name: null, opened: '2026-09-14T08:00:00Z' },
      { name: 'Ghost', opened: null },
    ] } });
    expect(s).toEqual([]);
  });

  it('copes with a stats payload that has no sessions', () => {
    expect(extractSessions({ data: {} })).toEqual([]);
    expect(extractSessions(null)).toEqual([]);
  });
});

// Taken from the same stats call the events ride on, so it costs no extra
// request — and it is NRS's own number, not a sum of what this app captured.
describe('extractDayTotals', () => {
  // Exactly the payload NRS returned for Bells on 2026-09-14.
  const stats = { data: {
    byday: { baskets: 30, items: 56, sales: 82016, avg_sale: 2733, scanrate: '50.0' },
    payamts: { total: 88783, num_sales: 30, cash: 1800, credit_debit: 86383, check: 0 },
  } };

  it('reports the figure the POS prints as "Sales $"', () => {
    // The portal showed $820.16 for this day.
    expect(extractDayTotals(stats).sales_cents).toBe(82016);
  });

  it('reports the sale count and payment split', () => {
    expect(extractDayTotals(stats)).toMatchObject({
      baskets: 30, items: 56, cash_cents: 1800, card_cents: 86383,
    });
  });

  // Net of tax vs collected: the drawer holds the larger number.
  it('keeps the collected total separate from net sales', () => {
    const t = extractDayTotals(stats);
    expect(t.collected_cents).toBe(88783);
    expect(t.collected_cents).toBeGreaterThan(t.sales_cents);
  });

  it('falls back to the payment count when byday has none', () => {
    expect(extractDayTotals({ data: { payamts: { total: 500, num_sales: 3 } } }).baskets).toBe(3);
  });

  it('returns nothing rather than a zero total when NRS sent none', () => {
    expect(extractDayTotals({ data: {} })).toBeNull();
    expect(extractDayTotals(null)).toBeNull();
  });

  it('reports a genuine zero-sales day as zero', () => {
    const t = extractDayTotals({ data: { byday: { sales: 0, baskets: 0 }, payamts: { total: 0 } } });
    expect(t.sales_cents).toBe(0);
    expect(t.baskets).toBe(0);
  });
});
