import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { fetchNRSDailyStats } from '@/lib/nrs-client';
import { fetchBasketLines, groupIntoBaskets, extractEvents, extractSessions, resolveCashier, extractDayTotals } from '@/lib/nrs-baskets';
import { sendTelegram } from '@/lib/telegram';
import { buildBasketMessage, buildEventMessage } from '@/lib/telegram-register';

export const dynamic = 'force-dynamic';
// Five stores, each a paged basket fetch plus the stats call — a busy day
// runs tens of seconds. Without this the route takes the platform default
// and a slow poll is cut off mid-store, losing that cycle's sales.
export const maxDuration = 60;
export const runtime = 'nodejs';

// Stores share one NRS token, so this stays well short of a five-way burst
// — but NRS answers slowly (the nightly sync needs ~29s for five stats calls
// alone) and an external scheduler will hang up at 30s, so two at a time is
// too slow to finish. Three, with each store's two calls now overlapping,
// keeps a run near 20s. Transient 5xx are retried with backoff either way.
const STORE_CONCURRENCY = 3;

// Telegram allows roughly 20 messages a minute to one group. A quiet poll
// sends nothing; a backlog (first run, or after an outage) could send plenty,
// so each store's announcements are capped per cycle and the rest wait for
// the next one rather than getting the bot rate-limited.
const MAX_BASKET_MESSAGES = 12;
const MAX_EVENT_MESSAGES = 12;

// Those per-store caps bound one store, not a run: five stores clearing a
// backlog together is up to 120 sends, which is minutes of Telegram time and
// far past what an external scheduler waits for. So announcing also stops on
// a wall-clock budget, leaving the remainder for the next poll — nothing is
// lost, because a basket is only marked notified once it has actually been
// sent.
const ANNOUNCE_BUDGET_MS = 18_000;

// A sale still being rung has no closing time yet. Announcing it would post a
// half-finished basket and then never correct it.
const isComplete = (b) => !!(b.closed_at || b.entered_at);

function todayCentral() {
  const now = new Date();
  const central = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = central.getFullYear();
  const m = String(central.getMonth() + 1).padStart(2, '0');
  const d = String(central.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function pollStore(admin, store, businessDate, deadline = Infinity) {
  const result = {
    store: store.name, baskets_seen: 0, baskets_new: 0,
    events_new: 0, notified_baskets: 0, notified_events: 0, error: null,
  };

  // ── Fetch ────────────────────────────────────────────────────────────
  // The two calls are independent, so they overlap: NRS is slow enough that
  // doing them in sequence roughly doubled a run and pushed it past what an
  // external scheduler will wait for.
  //
  // Stats carries the day's register sessions — which attribute a sale to a
  // cashier, since basket rows name nobody — and the voids and cancels.
  // Sales come from a different endpoint, so they still record if stats
  // fails; they just land without a cashier name.
  const [statsOutcome, lines] = await Promise.all([
    fetchNRSDailyStats(store.nrs_store_id, businessDate).then(
      (stats) => ({ ok: true, stats }),
      (e) => ({ ok: false, error: e }),
    ),
    fetchBasketLines(store.nrs_store_id, businessDate, businessDate),
  ]);

  let sessions = [], events = [], dayTotals = null;
  if (statsOutcome.ok) {
    sessions = extractSessions(statsOutcome.stats);
    events = extractEvents(statsOutcome.stats, businessDate);
    dayTotals = extractDayTotals(statsOutcome.stats);
  } else {
    console.warn(`[pos-poll] ${store.name} stats failed (no cashier, no events):`, statsOutcome.error.message);
  }

  // ── Sales ────────────────────────────────────────────────────────────
  const baskets = groupIntoBaskets(lines, businessDate)
    .map(b => ({ ...b, cashier: resolveCashier(sessions, b.entered_at || b.opened_at) }));
  result.baskets_seen = baskets.length;
  result.cashiers = [...new Set(baskets.map(b => b.cashier).filter(Boolean))];
  result.day_sales_cents = dayTotals?.sales_cents ?? null;

  if (baskets.length) {
    // Upserting the header would clobber notified_at, so read first and only
    // write headers for baskets we have not already announced.
    const { data: known } = await admin
      .from('pos_baskets')
      .select('basket_no, notified_at')
      .eq('store_id', store.id)
      .eq('business_date', businessDate);
    const notified = new Set((known || []).filter(k => k.notified_at).map(k => k.basket_no));

    const headers = baskets
      .filter(b => !notified.has(b.basket_no))
      .map(b => ({
        store_id: store.id,
        basket_no: b.basket_no,
        business_date: businessDate,
        opened_at: b.opened_at,
        closed_at: b.closed_at,
        entered_at: b.entered_at,
        total_cents: b.total_cents,
        item_count: b.item_count,
        scanned_count: b.scanned_count,
        manual_count: b.manual_count,
        discount_cents: b.discount_cents,
        cashier: b.cashier,
        updated_at: new Date().toISOString(),
      }));

    if (headers.length) {
      const { error } = await admin.from('pos_baskets').upsert(headers, { onConflict: 'store_id,basket_no' });
      if (error) throw new Error(`Could not store baskets: ${error.message}`);
      result.baskets_new = headers.length;
    }

    const items = baskets.flatMap(b => b.items.map(i => ({
      store_id: store.id,
      basket_no: b.basket_no,
      item_no: i.item_no,
      business_date: businessDate,
      dept: i.dept,
      upc: i.upc,
      name: i.name,
      qty: i.qty,
      amount_cents: i.amount_cents,
      price_label: i.price_label,
      discount_cents: i.discount_cents,
      promo_cents: i.promo_cents,
      entry_method: i.entry_method,
      verified_age: i.verified_age,
      refund: i.refund,
    })));
    if (items.length) {
      const { error } = await admin
        .from('pos_basket_items').upsert(items, { onConflict: 'store_id,basket_no,item_no' });
      if (error) console.warn(`[pos-poll] ${store.name} items upsert failed:`, error.message);
    }
  }

  // ── Till events ──────────────────────────────────────────────────────
  if (events.length) {
    // The unique index on (store_id, dedupe_key) makes re-polling a no-op;
    // ignoreDuplicates keeps notified_at on rows we have already announced.
    const { error } = await admin
      .from('pos_events')
      .upsert(events.map(e => ({ ...e, store_id: store.id })), {
        onConflict: 'store_id,dedupe_key', ignoreDuplicates: true,
      });
    if (error) console.warn(`[pos-poll] ${store.name} events upsert failed:`, error.message);
    else result.events_new = events.length;
  }

  // ── Announce ─────────────────────────────────────────────────────────
  if (!store.telegram_chat_id) return result;

  if (store.notify_events !== false) {
    const { data: pending } = await admin
      .from('pos_events')
      .select('*')
      .eq('store_id', store.id)
      .is('notified_at', null)
      .order('logged_at', { ascending: true })
      .limit(MAX_EVENT_MESSAGES);

    for (const ev of pending || []) {
      if (Date.now() > deadline) break;
      const { sent } = await sendTelegram(buildEventMessage(store, ev), store.telegram_chat_id);
      if (!sent) break; // Telegram is unhappy; leave the rest for the next poll.
      await admin.from('pos_events').update({ notified_at: new Date().toISOString() }).eq('id', ev.id);
      result.notified_events++;
    }
  }

  if (store.notify_sales) {
    const ready = baskets.filter(isComplete).sort(
      (a, b) => String(a.entered_at || '').localeCompare(String(b.entered_at || '')),
    );

    const { data: rows } = await admin
      .from('pos_baskets')
      .select('basket_no')
      .eq('store_id', store.id)
      .eq('business_date', businessDate)
      .is('notified_at', null);
    const unnotified = new Set((rows || []).map(r => r.basket_no));

    for (const basket of ready.filter(b => unnotified.has(b.basket_no)).slice(0, MAX_BASKET_MESSAGES)) {
      if (Date.now() > deadline) break;
      const { sent } = await sendTelegram(buildBasketMessage(store, basket, dayTotals), store.telegram_chat_id);
      if (!sent) break;
      await admin.from('pos_baskets')
        .update({ notified_at: new Date().toISOString() })
        .eq('store_id', store.id).eq('basket_no', basket.basket_no);
      result.notified_baskets++;
    }
  }

  return result;
}

async function runPoll(admin, businessDate, storeFilter = null) {
  const startMs = Date.now();
  let q = admin
    .from('stores')
    .select('id, name, nrs_store_id, telegram_chat_id, notify_sales, notify_events')
    .not('nrs_store_id', 'is', null);
  // Narrowing to one store keeps a run to a single pair of NRS calls, for
  // schedulers that hang up before five stores can finish.
  if (storeFilter) q = q.ilike('name', `%${storeFilter}%`);
  const { data: stores } = await q.order('created_at');

  if (!stores?.length) {
    return { success: true, business_date: businessDate, results: [], duration_ms: Date.now() - startMs };
  }

  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < stores.length) {
      const store = stores[next++];
      try {
        results.push(await pollStore(admin, store, businessDate, startMs + ANNOUNCE_BUDGET_MS));
      } catch (e) {
        console.error(`[pos-poll] ${store.name} failed:`, e.message);
        results.push({ store: store.name, error: e.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(STORE_CONCURRENCY, stores.length) }, worker));

  const failed = results.filter(r => r.error).length;
  const durationMs = Date.now() - startMs;
  // A run that ran out of budget still did its job; the backlog drains over
  // the next few polls rather than in one oversized run.
  const truncated = durationMs > ANNOUNCE_BUDGET_MS;
  console.log(`[pos-poll] ${businessDate}: ${results.length} stores, ${failed} failed, ${durationMs}ms${truncated ? ' (announce budget reached)' : ''}`);
  return { success: failed === 0, business_date: businessDate, results, duration_ms: durationMs, truncated };
}

async function handle(request) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isBearer = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  // Also runnable by hand from the app, so the owner can force a poll.
  let isOwner = false;
  if (!isVercelCron && !isBearer) {
    try {
      const { data: { user } } = await createClient().auth.getUser();
      if (user) {
        const { data: profile } = await createAdminClient()
          .from('profiles').select('role').eq('id', user.id).single();
        isOwner = profile?.role === 'owner';
      }
    } catch {}
  }
  if (!isVercelCron && !isBearer && !isOwner && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const date = params.get('date') || todayCentral();
    const store = params.get('store');
    return NextResponse.json(await runPoll(createAdminClient(), date, store));
  } catch (e) {
    console.error('[pos-poll] fatal:', e);
    return NextResponse.json({ error: e.message || 'Poll failed', success: false }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
