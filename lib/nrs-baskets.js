// Individual register sales, and the events worth watching a till for.
//
// Endpoints reverse-engineered from the NRS merchant portal's
// Store Statistics -> Data -> Details ("Individual Baskets") screen. Both key
// off nrs_store_id, not nrs_elmer_id — the portal's store picker shows the
// elmer id but the API path takes the store id.

import { nrsFetchJson } from '@/lib/nrs-fetch';

const NRS_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://mystore.nrsplus.com',
  'Referer': 'https://mystore.nrsplus.com/',
};

// The portal sends a DataTables payload; the column list is what it asks for
// and the response echoes far more fields than these.
const COLUMNS = [
  'entered', 'basket', 'dept', 'upc_plu', 'name', 'qty',
  'item_total', 'discount_cents', 'soldat_promoadj', 'verified_age', 'ebtcents',
];

function buildBasketQuery({ start, length }) {
  const p = new URLSearchParams();
  p.set('draw', '1');
  COLUMNS.forEach((data, i) => {
    p.set(`columns[${i}][data]`, data);
    p.set(`columns[${i}][name]`, '');
    p.set(`columns[${i}][searchable]`, 'true');
    p.set(`columns[${i}][orderable]`, 'true');
    p.set(`columns[${i}][search][value]`, '');
    p.set(`columns[${i}][search][regex]`, 'false');
  });
  p.set('start', String(start));
  p.set('length', String(length));
  p.set('search[value]', '');
  p.set('search[regex]', 'false');
  p.set('_', String(Date.now()));
  return p.toString();
}

// NRS timestamps come back without a zone ("2026-09-14 11:09") and are local
// to the store. Treat them as Central, which is where every 7S store is.
const STORE_TZ_OFFSET = '-05:00';

export function parseNrsTimestamp(value) {
  if (!value) return null;
  const s = String(value).trim();
  // Already carries a zone (the event feed does: "...-05").
  if (/[+-]\d{2}(:?\d{2})?$/.test(s) || s.endsWith('Z')) {
    const d = new Date(s.replace(/([+-]\d{2})$/, '$1:00'));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(`${s.replace(' ', 'T')}${STORE_TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// A line NRS gives us no UPC and no item name for was keyed into a department
// by hand instead of scanned. This is the ratio NRS itself reports as its
// "scan rate", which is how the rule can be checked against their own number.
export function entryMethod(row) {
  const upc = String(row?.upc_plu ?? '').trim();
  return upc ? 'scanned' : 'manual';
}

const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export function normalizeBasketRow(row) {
  return {
    basket_no: String(row.basket ?? '').trim(),
    item_no: int(row.itemno),
    dept: row.dept ?? null,
    upc: String(row.upc_plu ?? '').trim() || null,
    name: row.name ?? null,
    qty: Number(row.qty) || 0,
    amount_cents: int(row.item_total),
    price_label: row.price ?? null,
    discount_cents: int(row.discount_cents),
    promo_cents: int(row.promo_cents ?? row.soldat_promoadj),
    entry_method: entryMethod(row),
    verified_age: row.verified_age ?? null,
    refund: row.refund != null && row.refund !== false,
    opened_at: parseNrsTimestamp(row.opened),
    closed_at: parseNrsTimestamp(row.closed),
    entered_at: parseNrsTimestamp(row.entered),
    basket_total_cents: int(row.basket_total),
  };
}

/**
 * Every line of every sale in a date range, following NRS's paging.
 * Returns normalized line items in the order NRS gave them.
 */
export async function fetchBasketLines(nrsStoreId, from, to, { pageSize = 200, maxPages = 40 } = {}) {
  const lines = [];
  let start = 0;

  for (let page = 0; page < maxPages; page++) {
    const qs = buildBasketQuery({ start, length: pageSize });
    const json = await nrsFetchJson(`pcrhist/${nrsStoreId}/0/baskets/${from}/${to}?${qs}`, {
      headers: NRS_HEADERS,
      label: 'baskets',
      context: { store: nrsStoreId, from, to },
    });

    const rows = Array.isArray(json?.data) ? json.data : [];
    lines.push(...rows.map(normalizeBasketRow).filter(l => l.basket_no));
    const total = json?.recordsTotal ?? json?.recordsFiltered ?? rows.length;

    start += rows.length;
    // A page shorter than asked for is the end of the data, whatever the
    // reported total says — trusting recordsTotal alone lets a stale count
    // spin this loop against NRS until it hits the page cap.
    if (rows.length < pageSize || !rows.length || start >= total) break;
  }

  return lines;
}

// Roll lines up into the sale they belong to.
export function groupIntoBaskets(lines, businessDate) {
  const byBasket = new Map();

  for (const line of lines) {
    if (!byBasket.has(line.basket_no)) {
      byBasket.set(line.basket_no, {
        basket_no: line.basket_no,
        business_date: businessDate,
        opened_at: line.opened_at,
        closed_at: line.closed_at,
        entered_at: line.entered_at,
        total_cents: line.basket_total_cents,
        items: [],
      });
    }
    const b = byBasket.get(line.basket_no);
    b.items.push(line);
    // NRS repeats the basket header on every line; the last one wins, and a
    // closed time only appears once the sale is finished.
    if (line.closed_at) b.closed_at = line.closed_at;
    if (line.entered_at) b.entered_at = line.entered_at;
    if (line.basket_total_cents) b.total_cents = line.basket_total_cents;
  }

  return [...byBasket.values()].map(b => ({
    ...b,
    item_count: b.items.length,
    scanned_count: b.items.filter(i => i.entry_method === 'scanned').length,
    manual_count: b.items.filter(i => i.entry_method === 'manual').length,
    discount_cents: b.items.reduce((s, i) => s + (i.discount_cents || 0), 0),
  }));
}

// ── Till events ────────────────────────────────────────────────────────
//
// NRS reports these as plain arrays on the day/session stats response, with
// no identifier of their own, so identity has to be reconstructed from the
// event's own content.
const EVENT_SOURCES = [
  { key: 'voiditeminfo', kind: 'void_item' },
  { key: 'cancelbasketinfo', kind: 'cancel_basket' },
  { key: 'nosalesinfo', kind: 'no_sale' },
  { key: 'overrides', kind: 'override' },
];

export function dedupeKey(kind, e) {
  return [kind, e.logged ?? '', e.user ?? '', e.amount ?? '', e.desc ?? '', e.lines ?? '']
    .join('|');
}

/**
 * Pull void / cancel / no-sale / override events out of an NRS stats payload.
 * Accepts either the day-level or session-level shape.
 */
export function extractEvents(stats, businessDate) {
  const d = stats?.data ?? stats ?? {};
  const out = [];

  for (const { key, kind } of EVENT_SOURCES) {
    const list = Array.isArray(d[key]) ? d[key] : [];
    for (const e of list) {
      out.push({
        kind,
        logged_at: parseNrsTimestamp(e.logged),
        business_date: businessDate,
        cashier: e.user ?? null,
        description: e.desc ?? null,
        amount_cents: e.amount != null ? int(e.amount) : null,
        lines: e.lines != null ? int(e.lines) : null,
        dedupe_key: dedupeKey(kind, e),
        raw: e,
      });
    }
  }

  return out;
}

// ── Who was on the till ────────────────────────────────────────────────
//
// The basket rows carry no cashier. The daily stats call — the same one the
// events come from — carries the day's register sessions, each with the
// employee's name and the window they were logged in for, so a sale can be
// attributed by the time it was rung.

// Session times arrive with a trailing Z they are not actually in: this
// store's session opens at 11:02:40 and the day's first basket opens at
// 11:03 on the same clock. Honouring the Z would put every session five
// hours away from its own sales and match nothing.
export function parseNrsSessionTime(value) {
  if (!value) return null;
  return parseNrsTimestamp(String(value).trim().replace(/Z$/, '').replace('T', ' '));
}

export function extractSessions(stats) {
  const d = stats?.data ?? stats ?? {};
  const list = Array.isArray(d.sessions) ? d.sessions
    : (d.sessionstats ? [d.sessionstats] : []);

  return list
    .map(s => ({
      name: s?.name || null,
      opened_at: parseNrsSessionTime(s?.opened),
      closed_at: parseNrsSessionTime(s?.closed),
      session: s?.session ?? null,
      terminal: s?.terminal ?? null,
    }))
    .filter(s => s.name && s.opened_at)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at));
}

/**
 * The cashier logged in when something happened, or null if unknowable.
 *
 * A session with no close is still open, so it covers anything after it
 * started. Where sessions overlap the most recently opened wins, which is
 * the one that would have rung the sale.
 */
export function resolveCashier(sessions, iso) {
  if (!iso || !sessions?.length) return null;
  let best = null;
  for (const s of sessions) {
    if (s.opened_at > iso) continue;
    if (s.closed_at && s.closed_at < iso) continue;
    if (!best || s.opened_at > best.opened_at) best = s;
  }
  return best?.name ?? null;
}

// ── The day's running total ────────────────────────────────────────────
//
// Read off the same stats call the events and sessions come from, so it
// costs no extra request — and it is NRS's own figure rather than a sum of
// what this app happened to capture. byday.sales is the number the portal
// prints as "Sales $", so a total in a notification matches the register
// report exactly; anything this app added up itself would drift the moment
// a poll missed a basket.
export function extractDayTotals(stats, { hasRegister2 = false } = {}) {
  const d = stats?.data ?? stats ?? {};
  const byday = d.byday || {};
  const payamts = d.payamts || {};
  if (!Number.isFinite(byday.sales) && !Number.isFinite(payamts.total)) return null;

  // What was rung up and then thrown away. NRS reports no running total for
  // these, only the individual events, so they are summed here — from the
  // same arrays the alerts are built from, so the figure and the alerts can
  // never disagree.
  const sumAmounts = (list) => (Array.isArray(list) ? list : [])
    .reduce((total, e) => total + int(e?.amount), 0);
  const count = (list) => (Array.isArray(list) ? list.length : 0);

  // At a two-register store the POS only knows its own till. The drop holds
  // both, so whatever was dropped above R1's own cash came from R2 — the
  // same rule the daily totals use. Without this the figure in a
  // notification is R1 only, which at these stores is most of the day
  // missing.
  const drops = d.drops || {};
  const r2FromDrop = hasRegister2
    ? Math.max(int(drops.amt) - int(payamts.cash), 0)
    : 0;
  // That cash carries tax; strip it at R1's own rate for the day, as the
  // daily totals do, so the two figures agree.
  const taxable = int(d.taxable_amt?.amt);
  const taxCents = int(Object.entries(d.collections || {})
    .find(([k]) => k.toLowerCase().startsWith('tax'))?.[1]?.amt);
  const taxRate = taxable > 0 ? taxCents / taxable : 0;
  const r2NetCents = Math.round(r2FromDrop / (1 + taxRate));

  return {
    // Net of tax, matching the portal's "Sales $" column, plus R2 where a
    // second register exists.
    sales_cents: int(byday.sales) + r2NetCents,
    r1_sales_cents: int(byday.sales),
    r2_sales_cents: r2NetCents,
    baskets: int(byday.baskets ?? payamts.num_sales),
    items: int(byday.items),
    cash_cents: int(payamts.cash),
    card_cents: int(payamts.credit_debit),
    // Total collected including tax, for reconciling against the drawer.
    collected_cents: int(payamts.total),
    cancelled_cents: sumAmounts(d.cancelbasketinfo),
    cancelled_count: count(d.cancelbasketinfo),
    voided_cents: sumAmounts(d.voiditeminfo),
    voided_count: count(d.voiditeminfo),
    no_sale_count: count(d.nosalesinfo),
  };
}
