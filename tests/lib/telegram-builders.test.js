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

  it('renders a TOTALS block only when more than one store had data', () => {
    const one = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 0 } },
    ], '2026-05-12', []);
    expect(one).not.toContain('TOTALS');

    const two = buildSyncSummaryMessage([
      { store_name: 'A', status: 'created', salesData: { gross_sales: 100, total_sales: 100, cash_sales: 50, card_sales: 50, short_over: 0 } },
      { store_name: 'B', status: 'created', salesData: { gross_sales: 200, total_sales: 200, cash_sales: 100, card_sales: 100, short_over: 0 } },
    ], '2026-05-12', []);
    expect(two).toContain('TOTALS');
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
