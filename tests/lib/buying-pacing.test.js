import { describe, it, expect } from 'vitest';
import { computeBuyingPacing, DEFAULT_TARGET_PCT } from '@/lib/buying-pacing';

// Clock is pinned to 2026-05-12 by tests/setup.js (day 12 of a 31-day month).
const TODAY = '2026-05-12';

const store = (id, overrides = {}) => ({ id, name: `Store ${id}`, color: '#fff', buying_target_pct: 50, ...overrides });
const sale = (store_id, total) => ({ store_id, total_sales: total });
const purchase = (store_id, cost) => ({ store_id, total_cost: cost });

describe('computeBuyingPacing', () => {
  it('exports a default target of 50%', () => {
    expect(DEFAULT_TARGET_PCT).toBe(50);
  });

  it('returns zeroed totals when there are no stores', () => {
    const r = computeBuyingPacing({ stores: [], salesRows: [], purchaseRows: [], today: TODAY });
    expect(r.overall.mtdSales).toBe(0);
    expect(r.overall.mtdBuying).toBe(0);
    expect(r.overall.pct).toBeNull();
    expect(r.overall.overBudget).toBe(false);
    expect(r.perStore).toEqual([]);
  });

  it('falls back to DEFAULT_TARGET_PCT when no per-store sales drive the weighted target', () => {
    const r = computeBuyingPacing({ stores: [store('a')], salesRows: [], purchaseRows: [], today: TODAY });
    expect(r.overall.targetPct).toBe(DEFAULT_TARGET_PCT);
  });

  it('marks a store as under target with positive headroom', () => {
    // sales 10k, buying 4k, target 50% → target $5k, headroom +$1k.
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [sale('a', 10000)],
      purchaseRows: [purchase('a', 4000)],
      today: TODAY,
    });
    expect(r.overall.pct).toBeCloseTo(40, 5);
    expect(r.overall.targetBuying).toBeCloseTo(5000, 5);
    expect(r.overall.overBudget).toBe(false);
    expect(r.overall.headroom).toBeCloseTo(1000, 5);
  });

  it('marks a store as over target with negative headroom', () => {
    // sales 10k, buying 7k → 70%, $2k over the 5k target.
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [sale('a', 10000)],
      purchaseRows: [purchase('a', 7000)],
      today: TODAY,
    });
    expect(r.overall.pct).toBeCloseTo(70, 5);
    expect(r.overall.overBudget).toBe(true);
    expect(r.overall.headroom).toBeCloseTo(-2000, 5);
  });

  it('uses the configured per-store target instead of the default', () => {
    // target 40% → buying 4.1k > $4k target → over budget.
    const r = computeBuyingPacing({
      stores: [store('a', { buying_target_pct: 40 })],
      salesRows: [sale('a', 10000)],
      purchaseRows: [purchase('a', 4100)],
      today: TODAY,
    });
    expect(r.overall.targetPct).toBe(40);
    expect(r.overall.targetBuying).toBeCloseTo(4000, 5);
    expect(r.overall.overBudget).toBe(true);
  });

  it('projects MTD numbers linearly to month-end (day 12 of 31)', () => {
    // mtd 10k → projected 10k * 31/12 ≈ 25,833.33
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [sale('a', 10000)],
      purchaseRows: [purchase('a', 4000)],
      today: TODAY,
    });
    expect(r.daysElapsed).toBe(12);
    expect(r.daysInMonth).toBe(31);
    expect(r.overall.projSales).toBeCloseTo(10000 * 31 / 12, 2);
    expect(r.overall.projBuying).toBeCloseTo(4000 * 31 / 12, 2);
    expect(r.overall.projTargetBuying).toBeCloseTo(r.overall.projSales * 0.5, 2);
    expect(r.overall.projOverBudget).toBe(false);
  });

  it('flags projOverBudget when the trend will cross the target by month-end', () => {
    // buying pace is exactly at 51% — flagged.
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [sale('a', 10000)],
      purchaseRows: [purchase('a', 5100)],
      today: TODAY,
    });
    expect(r.overall.projOverBudget).toBe(true);
  });

  it('uses a sales-weighted average for the overall target across stores', () => {
    // a: 10k sales, target 50% → contributes 50% × 10k
    // b: 10k sales, target 40% → contributes 40% × 10k
    // weighted = (50*10000 + 40*10000) / 20000 = 45%
    const r = computeBuyingPacing({
      stores: [store('a', { buying_target_pct: 50 }), store('b', { buying_target_pct: 40 })],
      salesRows: [sale('a', 10000), sale('b', 10000)],
      purchaseRows: [purchase('a', 1000), purchase('b', 1000)],
      today: TODAY,
    });
    expect(r.overall.targetPct).toBeCloseTo(45, 5);
  });

  it('sorts perStore by mtdSales descending', () => {
    const r = computeBuyingPacing({
      stores: [store('small'), store('big'), store('medium')],
      salesRows: [sale('small', 100), sale('big', 1000), sale('medium', 500)],
      purchaseRows: [],
      today: TODAY,
    });
    expect(r.perStore.map(s => s.id)).toEqual(['big', 'medium', 'small']);
  });

  it('returns pct null and overBudget false when a store has zero sales', () => {
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [],
      purchaseRows: [purchase('a', 500)],
      today: TODAY,
    });
    expect(r.perStore[0].pct).toBeNull();
    expect(r.perStore[0].overBudget).toBe(false);
  });

  it('falls back to unit_cost when total_cost is missing on a purchase row', () => {
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [sale('a', 1000)],
      purchaseRows: [{ store_id: 'a', total_cost: null, unit_cost: 250 }],
      today: TODAY,
    });
    expect(r.overall.mtdBuying).toBe(250);
  });

  it('falls back to net_sales when total_sales is missing on a sales row', () => {
    const r = computeBuyingPacing({
      stores: [store('a')],
      salesRows: [{ store_id: 'a', total_sales: null, net_sales: 700 }],
      purchaseRows: [],
      today: TODAY,
    });
    expect(r.overall.mtdSales).toBe(700);
  });

  it('reports the right month name from the `today` argument', () => {
    const r = computeBuyingPacing({ stores: [], salesRows: [], purchaseRows: [], today: '2026-02-09' });
    expect(r.monthName).toBe('February');
    expect(r.daysElapsed).toBe(9);
    expect(r.daysInMonth).toBe(28);
  });
});
