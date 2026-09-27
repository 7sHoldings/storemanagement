import { nrsFetchJson } from '@/lib/nrs-fetch';

const NRS_BASE = process.env.NRS_API_BASE || 'https://pos-papi.nrsplus.com';
const NRS_TOKEN = process.env.NRS_USER_TOKEN || '';

const NRS_HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://mystore.nrsplus.com',
  'Referer': 'https://mystore.nrsplus.com/',
};

function cents(v) {
  return parseFloat(((v || 0) / 100).toFixed(2));
}

// NRS-canonical fields the auto-sync owns. Anything not listed here
// (r2_*, register2_*, r1_house_account_*, credits, entered_by, etc.) is
// employee-entered and must be preserved when merging into an existing row.
export const NRS_OWNED_FIELDS = [
  'r1_gross',
  'r1_net',
  'non_tax_sales',
  'total_sales',
  'cash_sales',
  'card_sales',
  'cashapp_check',
  'r1_canceled_basket',
  'r1_safe_drop',
  'r1_sales_tax',
  'tax_collected',
  'sync_source',
  'notes',
  'ai_extracted_data',
];

export function pickNrsOwnedFields(parsed) {
  const out = {};
  for (const k of NRS_OWNED_FIELDS) out[k] = parsed[k];
  return out;
}

export async function validateNRSAuth() {
  const debug = {
    token_present: !!NRS_TOKEN,
    api_base: NRS_BASE,
    url_called: '',
    fetch_status: null,
    fetch_response_body: null,
    error_message: null,
  };
  if (!NRS_TOKEN) {
    debug.error_message = 'NRS_USER_TOKEN not set';
    console.log('[nrs/validate] no token');
    return { valid: false, debug };
  }
  try {
    const url = `${NRS_BASE}/${NRS_TOKEN}/auth/validate`;
    // Never echo any part of the token back to a caller.
    debug.url_called = url.replace(NRS_TOKEN, '<token>');
    console.log('[nrs/validate] calling', debug.url_called);
    const res = await fetch(url, { headers: NRS_HEADERS });
    debug.fetch_status = res.status;
    console.log('[nrs/validate] status', res.status);
    const body = await res.json().catch(() => null);
    debug.fetch_response_body = body;
    console.log('[nrs/validate] body', JSON.stringify(body).slice(0, 500));
    const valid = !!(body && body.res && body.res.rc === 0);
    console.log('[nrs/validate] valid=', valid);
    return { valid, debug };
  } catch (e) {
    debug.error_message = e.message || String(e);
    console.error('[nrs/validate] error', e);
    return { valid: false, debug };
  }
}

export async function fetchNRSDailyStats(nrsStoreId, date) {
  // Retries transient 5xx/429/timeouts (see lib/nrs-fetch.js). The daily cron
  // only gets one shot per store, so a single NRS blip used to cost a whole
  // day of sales data.
  const json = await nrsFetchJson(`pcrhist/${nrsStoreId}/stats/day/${date}/${date}?elmer_id=0`, {
    headers: NRS_HEADERS,
    label: 'daily stats',
    context: { store: nrsStoreId, date },
  });
  console.log('[nrs/fetch] raw keys:', Object.keys(json));
  if (json.data) console.log('[nrs/fetch] data keys:', Object.keys(json.data));
  return json;
}

// Money arithmetic drifts in binary floating point; pin every derived figure
// to cents so a total never lands a hundredth off what the receipts say.
const round2 = (n) => parseFloat(Number(n || 0).toFixed(2));

export function parseNRSStatsToDailySales(nrsData, storeId, date) {
  // Handle both { res, data: { payamts, ... } } and { payamts, ... } directly
  const d = (nrsData && nrsData.data) ? nrsData.data : (nrsData || {});
  console.log('[nrs/parse] using .data?', !!(nrsData && nrsData.data));
  console.log('[nrs/parse] input keys:', Object.keys(d));
  console.log('[nrs/parse] payamts:', JSON.stringify(d.payamts || {}).slice(0, 300));
  console.log('[nrs/parse] drops:', JSON.stringify(d.drops || {}).slice(0, 200));
  const payamts = d.payamts || {};
  const byday = d.byday || {};
  const drops = d.drops || {};
  const taxableAmt = d.taxable_amt || {};
  const collections = d.collections || {};
  const cancelBasketInfo = d.cancelbasketinfo || [];
  const sessions = d.sessions || [];

  const cashSales = cents(payamts.cash);
  const cardSales = cents(payamts.credit_debit);
  const checkSales = cents(payamts.check);

  const taxKey = Object.keys(collections).find(k => k.toLowerCase().startsWith('tax'));
  const taxEntry = taxKey ? collections[taxKey] : {};
  const taxCollected = cents(taxEntry.explicit || taxEntry.amt || 0);

  // Sales, net of tax. Two NRS payloads disagree about whether byday.sales
  // carries the tax — one store's equals payamts.total, another's equals
  // payamts.total minus the tax — so it is not trusted alone to define the
  // total. What never varies is that the state's share is not revenue.
  const totalCollected = cents(payamts.total);
  const bydaySales = cents(byday.sales);
  const collectedNetOfTax = Math.max(round2(totalCollected - taxCollected), 0);
  // Whichever is lower: when byday.sales is already net it wins, and when it
  // still carries tax the subtraction does. Erring low keeps the state's
  // money out of revenue, which is the side to be wrong on.
  const totalNetOfTax = bydaySales > 0
    ? Math.min(bydaySales, collectedNetOfTax)
    : collectedNetOfTax;

  // The taxable / non-taxable split is presentational — the two always sum
  // to totalNetOfTax. taxable_amt.amt is only believed when it is below the
  // net total; at or above it, it is carrying tax itself (or is the whole
  // day), and splitting on it would invent non-taxable sales out of the tax.
  const taxableOnly = cents(taxableAmt.amt);
  const splitIsUsable = taxableOnly != null && taxableOnly > 0 && taxableOnly < totalNetOfTax;
  const nonTaxSales = splitIsUsable ? round2(totalNetOfTax - taxableOnly) : 0;
  console.log('[nrs/parse] tax calc: collected=', totalCollected, 'tax=', taxCollected,
    'netOfTax=', totalNetOfTax, 'byday.sales=', bydaySales,
    'taxable_amt=', taxableOnly, 'usableSplit=', splitIsUsable, 'nonTax=', nonTaxSales);

  const canceledBasket = cancelBasketInfo.reduce((s, c) => s + cents(c.amount || 0), 0);

  const sessionSummary = sessions.map(s => {
    const name = s.username || s.user || 'User';
    const start = s.start_time || '';
    const end = s.end_time || '';
    return `${name} ${start}-${end}`;
  }).join(', ');
  const basketCount = byday.baskets || payamts.baskets || 0;

  const grossSales = totalCollected;
  const netTaxable = splitIsUsable ? taxableOnly : totalNetOfTax;
  // Equals totalNetOfTax in both branches, by construction.
  const totalSales = round2(netTaxable + nonTaxSales);
  console.log('[nrs/parse] sales: gross=', grossSales, '(incl tax) netTaxable=', netTaxable, 'nonTax=', nonTaxSales, 'total=', totalSales, '(excl tax)');

  return {
    store_id: storeId,
    date,
    r1_gross: grossSales,
    r1_net: netTaxable,
    gross_sales: grossSales,
    net_sales: netTaxable,
    non_tax_sales: nonTaxSales,
    total_sales: totalSales,
    cash_sales: cashSales,
    card_sales: cardSales,
    cashapp_check: checkSales,
    r1_canceled_basket: canceledBasket,
    r1_safe_drop: cents(drops.amt),
    r1_sales_tax: taxCollected,
    tax_collected: taxCollected,
    credits: 0,
    r1_house_account_amount: 0,
    r2_net: 0,
    r2_gross: 0,
    register2_cash: 0,
    r2_safe_drop: 0,
    register2_card: 0,
    register2_credits: 0,
    r1_short_over: 0,
    r2_short_over: 0,
    sync_source: '7s_agent',
    notes: `Synced from NRS: ${basketCount} baskets${sessionSummary ? `, ${sessionSummary}` : ''}`,
    ai_extracted_data: nrsData,
  };
  console.log('[nrs/parse] result: gross=', result.r1_gross, 'net=', result.r1_net, 'cash=', result.cash_sales, 'card=', result.card_sales, 'tax=', result.tax_collected, 'drop=', result.r1_safe_drop);
  return result;
}
