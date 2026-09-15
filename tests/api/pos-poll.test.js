import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-client', () => ({ fetchNRSDailyStats: vi.fn(async () => ({ data: {} })) }));
vi.mock('@/lib/nrs-baskets', async (orig) => ({ ...(await orig()), fetchBasketLines: vi.fn() }));
vi.mock('@/lib/telegram', () => ({ sendTelegram: vi.fn(async () => ({ sent: true })) }));

import { GET } from '@/app/api/cron/pos-poll/route';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { fetchBasketLines } from '@/lib/nrs-baskets';
import { fetchNRSDailyStats } from '@/lib/nrs-client';
import { sendTelegram } from '@/lib/telegram';

const DATE = '2026-09-14';
const req = () => ({
  url: `https://app.test/api/cron/pos-poll?date=${DATE}`,
  headers: { get: (k) => (k === 'x-vercel-cron' ? '1' : null) },
});

const line = (over = {}) => ({
  basket_no: 'B1', item_no: 1, dept: 'Vape', upc: '123', name: 'Lost Mary',
  qty: 1, amount_cents: 2499, discount_cents: 0, promo_cents: 0,
  entry_method: 'scanned', verified_age: null, refund: false,
  opened_at: '2026-09-14T16:00:00.000Z', closed_at: '2026-09-14T16:09:00.000Z',
  entered_at: '2026-09-14T16:09:00.000Z', basket_total_cents: 2499, ...over,
});

let db;

// Supabase chains are awaited at different depths by the route, so every
// builder is thenable: `await` works after any number of chained calls.
function builder(data, hooks = {}) {
  const b = {
    select: () => b, eq: () => b, is: () => b, not: () => b, order: () => b, limit: () => b,
    upsert: async (rows) => { hooks.onUpsert?.(rows); return { error: null }; },
    update: (patch) => { hooks.onUpdate?.(patch); return b; },
    then: (res, rej) => Promise.resolve({ data, error: null }).then(res, rej),
  };
  return b;
}

function mockDb({ store = {}, knownBaskets = [], pendingEvents = [], unnotified = ['B1'] } = {}) {
  db = { upserts: {}, updates: [] };
  const stores = [{
    id: 's1', name: 'Reno', nrs_store_id: 63560,
    telegram_chat_id: '-100123', notify_sales: true, notify_events: true, ...store,
  }];
  let basketRead = 0;

  vi.mocked(createAdminClient).mockReturnValue({
    from(table) {
      const hooks = {
        onUpsert: (rows) => { (db.upserts[table] ??= []).push(...rows); },
        onUpdate: (patch) => { db.updates.push({ table, patch }); },
      };
      if (table === 'stores') return builder(stores);
      if (table === 'pos_events') return builder(pendingEvents, hooks);
      if (table === 'pos_baskets') {
        // First read checks what was already announced; the second lists what
        // still needs announcing.
        const data = basketRead++ === 0 ? knownBaskets : unnotified.map(b => ({ basket_no: b }));
        return builder(data, hooks);
      }
      return builder([], hooks);
    },
  });
  return stores[0];
}

const body = async () => (await GET(req())).json();
const sentTexts = () => vi.mocked(sendTelegram).mock.calls.map(c => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchNRSDailyStats).mockResolvedValue({ data: {} });
  vi.mocked(sendTelegram).mockResolvedValue({ sent: true });
});

describe('POST /api/cron/pos-poll — storing sales', () => {
  it('stores a basket header and its lines', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([line(), line({ item_no: 2, upc: null, name: null, dept: 'pre rolls', entry_method: 'manual' })]);

    const res = await body();
    expect(res.results[0]).toMatchObject({ store: 'Reno', baskets_seen: 1 });
    expect(db.upserts.pos_baskets[0]).toMatchObject({
      basket_no: 'B1', item_count: 2, scanned_count: 1, manual_count: 1,
    });
    expect(db.upserts.pos_basket_items).toHaveLength(2);
  });

  it('records how each line was entered', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([line(), line({ item_no: 2, entry_method: 'manual', upc: null })]);
    await body();
    expect(db.upserts.pos_basket_items.map(i => i.entry_method)).toEqual(['scanned', 'manual']);
  });

  it('does nothing on a day with no sales', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([]);
    const res = await body();
    expect(res.results[0].baskets_seen).toBe(0);
    expect(sendTelegram).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/pos-poll — announcing', () => {
  it('sends one message per basket, not per line', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([line(), line({ item_no: 2 }), line({ item_no: 3 })]);
    await body();
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(sentTexts()[0]).toContain('Total');
  });

  it('sends to that store’s own channel', async () => {
    mockDb({ store: { telegram_chat_id: '-100999' } });
    vi.mocked(fetchBasketLines).mockResolvedValue([line()]);
    await body();
    expect(vi.mocked(sendTelegram).mock.calls[0][1]).toBe('-100999');
  });

  // Re-polling the same window is the normal case every 5 minutes.
  it('does not re-announce a basket already sent', async () => {
    mockDb({ knownBaskets: [{ basket_no: 'B1', notified_at: '2026-09-14T16:10:00Z' }], unnotified: [] });
    vi.mocked(fetchBasketLines).mockResolvedValue([line()]);
    await body();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  // A sale still being rung has no closing time; announcing it would post a
  // half-finished basket that never gets corrected.
  it('waits for a sale to finish before announcing it', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([line({ closed_at: null, entered_at: null })]);
    await body();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it('stays quiet when the store has no channel configured', async () => {
    mockDb({ store: { telegram_chat_id: null } });
    vi.mocked(fetchBasketLines).mockResolvedValue([line()]);
    await body();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it('honours a store that wants alerts but not every sale', async () => {
    mockDb({
      store: { notify_sales: false },
      pendingEvents: [{ id: 'e1', kind: 'void_item', cashier: 'Billy', amount_cents: 3499 }],
    });
    vi.mocked(fetchBasketLines).mockResolvedValue([line()]);
    await body();
    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain('Item voided');
  });

  it('stops sending when Telegram rejects a message', async () => {
    mockDb({
      pendingEvents: [
        { id: 'e1', kind: 'void_item', cashier: 'A' },
        { id: 'e2', kind: 'no_sale', cashier: 'B' },
      ],
    });
    vi.mocked(fetchBasketLines).mockResolvedValue([]);
    vi.mocked(sendTelegram).mockResolvedValue({ sent: false, reason: 'Too Many Requests' });
    const res = await body();
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(res.results[0].notified_events).toBe(0);
  });
});

describe('POST /api/cron/pos-poll — till events', () => {
  it('stores voids and cancels pulled off the stats call', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([]);
    vi.mocked(fetchNRSDailyStats).mockResolvedValue({
      data: {
        voiditeminfo: [{ logged: '2026-09-14 11:03:59-05', user: 'Billy', desc: 'Zour z', amount: '3499' }],
        cancelbasketinfo: [{ logged: '2026-09-14 13:06:54-05', user: 'Billy', amount: '1081', lines: '1' }],
      },
    });

    const res = await body();
    expect(res.results[0].events_new).toBe(2);
    const kinds = db.upserts.pos_events.map(e => e.kind);
    expect(kinds).toEqual(['void_item', 'cancel_basket']);
    expect(db.upserts.pos_events[0]).toMatchObject({ cashier: 'Billy', amount_cents: 3499 });
  });

  // Sales must survive the stats call failing — they come from a different endpoint.
  it('still records sales when the events call fails', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockResolvedValue([line()]);
    vi.mocked(fetchNRSDailyStats).mockRejectedValue(new Error('NRS 500'));

    const res = await body();
    expect(res.results[0]).toMatchObject({ baskets_seen: 1, events_new: 0 });
    expect(db.upserts.pos_baskets).toHaveLength(1);
  });
});

describe('POST /api/cron/pos-poll — failures', () => {
  it('reports a store that failed without failing the others', async () => {
    mockDb();
    vi.mocked(fetchBasketLines).mockRejectedValue(new Error('NRS baskets → 500'));
    const res = await body();
    expect(res.success).toBe(false);
    expect(res.results[0].error).toContain('500');
  });

  it('rejects an unauthenticated caller in production', async () => {
    mockDb();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
    const res = await GET({ url: 'https://app.test/api/cron/pos-poll', headers: { get: () => null } });
    expect(res.status).toBe(401);
    process.env.NODE_ENV = prev;
  });
});
