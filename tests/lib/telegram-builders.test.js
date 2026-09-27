import { describe, it, expect } from 'vitest';
import {
  buildStoreDailySummary,
  buildSyncSummaryMessage,
  buildInventoryPlanningMessage,
} from '@/lib/telegram';

describe('buildStoreDailySummary', () => {
  it('includes the store name, date, gross/net and payment-mix lines', () => {
    const msg = buildStoreDailySummary('Bells', {
      r1_gross: 1100, r1_net: 1000, cash_sales: 400, card_sales: 600, tax_collected: 75,
      r1_safe_drop: 200, r2_safe_drop: 0,
    }, '2026-05-12');
    expect(msg).toContain('Bells');
    expect(msg).toContain('2026-05-12');
    expect(msg).toContain('Gross Sales');
    expect(msg).toContain('$1,100.00');
    expect(msg).toContain('Net Sales');
    expect(msg).toContain('$1,000.00');
    expect(msg).toContain('Cash:');
    expect(msg).toContain('Card:');
    expect(msg).toContain('$75.00');   // tax
    expect(msg).toContain('$200.00');  // safe drop
  });

  it('adds a Register 2 line only when r2_gross is positive', () => {
    const without = buildStoreDailySummary('X', { r1_gross: 100 }, '2026-05-12');
    expect(without).not.toContain('Register 2');
    const withR2 = buildStoreDailySummary('X', { r1_gross: 100, r2_gross: 50 }, '2026-05-12');
    expect(withR2).toContain('Register 2');
  });
});

describe('buildSyncSummaryMessage', () => {
  it('renders ✅ balanced when every short_over is ~0 and ⚠️ otherwise', () => {
    const balanced = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-05-12', []);
    expect(balanced).toContain('All registers balanced');

    const flagged = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 50 } },
    ], '2026-05-12', []);
    expect(flagged).toContain('Register discrepancy flagged');
    expect(flagged).toContain('Short/Over');
  });

  it('shows FAILED rows with the underlying error', () => {
    const msg = buildSyncSummaryMessage([
      { store_name: 'B', status: 'failed', error: 'auth expired' },
    ], '2026-05-12', []);
    expect(msg).toContain('FAILED');
    expect(msg).toContain('auth expired');
  });

  it('renders an all-stores block only when more than one store had data', () => {
    const one = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-05-12', []);
    expect(one).not.toContain('— TODAY');

    const two = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 0 } },
      { store_name: 'B', status: 'created', salesData: { gross_sales: 200, total_sales: 200, cash_sales: 100, card_sales: 100, short_over: 0 } },
    ], '2026-05-12', []);
    expect(two).toContain('ALL 2 STORES — TODAY');
  });

  it('leads each store and the group with the day\'s sales in caps and bold', () => {
    const msg = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 90, cash_sales: 50, card_sales: 50, short_over: 0 } },
      { store_name: 'B', status: 'created', salesData: { gross_sales: 200, total_sales: 180, cash_sales: 100, card_sales: 100, short_over: 0 } },
    ], '2026-05-12', []);
    // Per store it reads SALES TODAY; the group totals read TOTAL SALES.
    expect(msg.match(/📊 SALES TODAY   <b>/g)).toHaveLength(2);
    expect(msg).toContain('📊 TOTAL SALES   <b>$270.00</b>');
  });

  it('adds the month-so-far block when month figures are supplied', () => {
    const msg = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { store_id: 's1', gross_sales: 100, total_sales: 90, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-05-12', [], {
      byStore: { s1: { sales: 900, cash: 400 } }, sales: 900, cash: 400, days: 12,
    });
    expect(msg).toContain('MAY SO FAR — 12 DAYS');
    expect(msg).toContain('MAY SO FAR');
    expect(msg).toContain('TOTAL SALES   <b>$900.00</b>');
    expect(msg).toContain('TOTAL CASH    <b>$400.00</b>');
    expect(msg).toContain('Averaging $75.00 a day');
    expect(msg).toContain('MAY SO FAR   <b>$900.00</b>  ·  cash <b>$400.00</b>');
  });

  it('omits the month block entirely when the month lookup failed', () => {
    // A summary without the month figures still beats no summary at all.
    const msg = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 90, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-05-12', [], { byStore: {}, sales: 0, cash: 0, days: 0 });
    expect(msg).not.toContain('SO FAR');
    expect(msg).toContain('📊 SALES TODAY');
  });

  it('names the month from the date string, not the local clock', () => {
    // The sync fires just after midnight; a Date round-trip could land in
    // the previous month depending on the runner's timezone.
    const jan = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 1, total_sales: 1, cash_sales: 1, card_sales: 0, short_over: 0 } },
    ], '2026-01-01', [], { byStore: {}, sales: 5, cash: 2, days: 1 });
    expect(jan).toContain('JANUARY SO FAR');
  });

  it('counts Register 2 takings as cash', () => {
    // 26 Sep, real figures. The five stores' cash_sales add to $684.26, but
    // Bells and Kerens put nearly all their cash through the second till, so
    // the day's actual cash was $1,319.33 — the number the sales table
    // shows. Quoting cash_sales alone understated it by $635.07.
    const day = [
      { store_name: 'Kerens',  status: 'created', salesData: { store_id: 'k', gross_sales: 754.23, total_sales: 1094.91, cash_sales: 0.18,   r2_net: 396.82, card_sales: 754.05, short_over: 0 } },
      { store_name: 'Bells',   status: 'created', salesData: { store_id: 'b', gross_sales: 619.22, total_sales: 810.26, cash_sales: 1.75,   r2_net: 238.25, card_sales: 610.47, short_over: 0 } },
      { store_name: 'Denison', status: 'created', salesData: { store_id: 'd', gross_sales: 737.84, total_sales: 681.60, cash_sales: 160.14, r2_net: 0,      card_sales: 577.70, short_over: 0 } },
      { store_name: 'Reno',    status: 'created', salesData: { store_id: 'r', gross_sales: 607.85, total_sales: 561.55, cash_sales: 221.92, r2_net: 0,      card_sales: 385.93, short_over: 0 } },
      { store_name: 'Troup',   status: 'created', salesData: { store_id: 't', gross_sales: 1042.01, total_sales: 962.60, cash_sales: 300.27, r2_net: 0,     card_sales: 741.74, short_over: 0 } },
    ];
    const msg = buildSyncSummaryMessage(day, '2026-09-26', []);
    expect(msg).toContain('💵 TOTAL CASH    <b>$1,319.33</b>');
    expect(msg).not.toContain('$684.26');
  });

  it('shows the R1/R2 split only at stores that have a second till', () => {
    const msg = buildSyncSummaryMessage([
      { store_name: 'Kerens', status: 'created', salesData: { gross_sales: 754.23, total_sales: 1094.91, cash_sales: 0.18, r2_net: 396.82, card_sales: 754.05, short_over: 0 } },
      { store_name: 'Reno',   status: 'created', salesData: { gross_sales: 607.85, total_sales: 561.55, cash_sales: 221.92, r2_net: 0, card_sales: 385.93, short_over: 0 } },
    ], '2026-09-26', []);
    // Kerens: $0.18 in the drawer, $396.82 through the second till.
    expect(msg).toContain('💵 CASH TODAY    <b>$397.00</b>');
    expect(msg).toContain('R1 $0.18 + R2 $396.82');
    // Reno has one till, so no split to show.
    // Reno has one till, so no split line under its cash figure.
    expect(msg).toContain('💵 CASH TODAY    <b>$221.92</b>');
    expect(msg.match(/R1 \$/g)).toHaveLength(1);
  });

  it('keeps the per-store cash lines adding up to the all-stores cash', () => {
    const day = [
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 90, cash_sales: 10, r2_net: 40, card_sales: 50, short_over: 0 } },
      { store_name: 'B', status: 'created', salesData: { gross_sales: 200, total_sales: 180, cash_sales: 25, r2_net: 0, card_sales: 175, short_over: 0 } },
    ];
    const msg = buildSyncSummaryMessage(day, '2026-09-26', []);
    // 10 + 40 + 25 = 75
    expect(msg).toContain('💵 TOTAL CASH    <b>$75.00</b>');
  });

  it('shortens store names so the identifying part survives on a phone', () => {
    const msg = buildSyncSummaryMessage([
      { store_name: '7s Smoke and Vape World - Bells', status: 'created', salesData: { gross_sales: 100, total_sales: 90, cash_sales: 50, card_sales: 50, short_over: -5 } },
    ], '2026-09-26', [{ store: 'x' }]);
    expect(msg).toContain('🏪 <b>Bells</b>');
    expect(msg).not.toContain('7s Smoke and Vape World');
  });

  it('escapes a store name rather than letting it break the message', () => {
    // Telegram rejects the whole message on a bare & in HTML mode, which
    // would cost the entire daily summary.
    const msg = buildSyncSummaryMessage([
      { store_name: 'Vape - Smoke & Go', status: 'created', salesData: { gross_sales: 100, total_sales: 90, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-09-26', []);
    expect(msg).toContain('Smoke &amp; Go');
    expect(msg).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });

  it('stays inside the Telegram message limit with five stores', () => {
    // Telegram rejects anything over 4096 characters outright, which would
    // silently cost the whole daily summary.
    const stores = ['Bells', 'Kerens', 'Reno', 'Troup', 'Denison'].map((n, i) => ({
      store_name: `7s Smoke and Vape World - ${n}`, status: 'created',
      salesData: {
        store_id: `s${i}`, gross_sales: 1234.56, total_sales: 1111.11, cash_sales: 321.12,
        card_sales: 790.45, non_tax_sales: 17.31, r1_net: 1093.80, tax_collected: 99.99,
        r1_safe_drop: 400, short_over: -12.34,
      },
    }));
    const byStore = Object.fromEntries(stores.map((s, i) => [`s${i}`, { sales: 33333.33, cash: 9876.54 }]));
    const msg = buildSyncSummaryMessage(stores, '2026-09-26',
      stores.map(s => ({ store: s.store_name, expected: 400, collected: 380 })),
      { byStore, sales: 166666.65, cash: 49382.70, days: 26 });
    expect(msg.length).toBeLessThan(4096);
  });
});

describe('buildInventoryPlanningMessage', () => {
  const storesData = [
    { name: '7s Vape Love - Bells', weekly_sales: 5000, weekly_bought: 1000, weekly_ratio: 5,    mtd_sales: 10000, mtd_bought: 2000, mtd_ratio: 5 },     // BUY MORE
    { name: '7s Vape Love - Troup', weekly_sales: 4000, weekly_bought: 2000, weekly_ratio: 2,    mtd_sales: 8000,  mtd_bought: 4000, mtd_ratio: 2 },     // NORMAL
    { name: '7s Vape Love - Reno',  weekly_sales: 3000, weekly_bought: 3500, weekly_ratio: 0.86, mtd_sales: 6000,  mtd_bought: 7000, mtd_ratio: 0.86 },  // OVERSTOCKED (BUY LESS)
    { name: '7s Vape Love - Denison', weekly_sales: 1000, weekly_bought: 0, weekly_ratio: 0,     mtd_sales: 2000,  mtd_bought: 0,    mtd_ratio: 0 },     // NO DATA
  ];
  const totals = { week_sales: 13000, week_bought: 6500, mtd_sales: 26000, mtd_bought: 13000 };

  it('lists every store in both the weekly and MTD sections', () => {
    const msg = buildInventoryPlanningMessage({ stores: storesData, totals });
    expect(msg).toContain('LAST 7 DAYS');
    expect(msg).toContain('MONTH-TO-DATE');
    for (const s of storesData) expect(msg).toContain(s.name);
  });

  it('routes stores into the correct BUY MORE / NORMAL / BUY LESS / NO DATA buckets', () => {
    const msg = buildInventoryPlanningMessage({ stores: storesData, totals });
    expect(msg).toMatch(/BUY MORE:.*Bells/);
    expect(msg).toMatch(/NORMAL:.*Troup/);
    expect(msg).toMatch(/BUY LESS:.*Reno/);
    expect(msg).toMatch(/NO DATA:.*Denison/);
  });
});
