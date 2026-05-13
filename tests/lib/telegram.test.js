import { describe, it, expect } from 'vitest';
import { formatCurrency, buildBuyingPacingMessage } from '@/lib/telegram';
import { computeBuyingPacing } from '@/lib/buying-pacing';

describe('formatCurrency', () => {
  it('formats numbers with $ + two decimals + thousands separators', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(0)).toBe('$0.00');
  });
  it('treats null / undefined / NaN as zero', () => {
    expect(formatCurrency(null)).toBe('$0.00');
    expect(formatCurrency(undefined)).toBe('$0.00');
    expect(formatCurrency(Number.NaN)).toBe('$0.00');
  });
  it('renders negatives in the locale\'s default format', () => {
    // The implementation does `'$' + n.toLocaleString(...)` — the minus
    // ends up between the dollar sign and the number for en-US.
    expect(formatCurrency(-50.25)).toBe('$-50.25');
  });
});

describe('buildBuyingPacingMessage', () => {
  const TODAY = '2026-05-12';
  const store = (id, overrides = {}) => ({ id, name: `7s Vape Love - ${id}`, color: '#fff', buying_target_pct: 50, ...overrides });

  it('renders the over-budget headline + dollar target + per-store breakdown', () => {
    const pacing = computeBuyingPacing({
      stores: [store('Bells'), store('Troup')],
      salesRows: [{ store_id: 'Bells', total_sales: 10000 }, { store_id: 'Troup', total_sales: 10000 }],
      purchaseRows: [{ store_id: 'Bells', total_cost: 6000 }, { store_id: 'Troup', total_cost: 7000 }],
      today: TODAY,
    });
    const msg = buildBuyingPacingMessage(pacing);
    expect(msg).toContain('BUYING vs SALES');
    expect(msg).toContain('May 2026');
    expect(msg).toContain('May 1–12, 2026 · 12 of 31 days');
    expect(msg).toContain('Target: buying ≤ 50% of sales');
    expect(msg).toContain('$10,000.00');
    expect(msg).toContain('over budget by');
    expect(msg).toContain('$3,000.00');
    expect(msg).toContain('Hold off / cut back on buying this weekend');
    expect(msg).toContain('BY STORE');
    // Worst-offender (Troup at 70%) appears before Bells (60%).
    expect(msg.indexOf('Troup')).toBeLessThan(msg.indexOf('Bells'));
  });

  it('renders the under-target headline with "still to spend"', () => {
    const pacing = computeBuyingPacing({
      stores: [store('Bells')],
      salesRows: [{ store_id: 'Bells', total_sales: 10000 }],
      purchaseRows: [{ store_id: 'Bells', total_cost: 3000 }],
      today: TODAY,
    });
    const msg = buildBuyingPacingMessage(pacing);
    expect(msg).toContain('still to spend this month at target');
    expect(msg).toContain('$2,000.00');     // headroom = 5000 - 3000
    expect(msg).not.toContain('over budget');
  });

  it('omits the BY STORE block when there is only one store', () => {
    const pacing = computeBuyingPacing({
      stores: [store('Solo')],
      salesRows: [{ store_id: 'Solo', total_sales: 10000 }],
      purchaseRows: [{ store_id: 'Solo', total_cost: 1000 }],
      today: TODAY,
    });
    const msg = buildBuyingPacingMessage(pacing);
    expect(msg).not.toContain('BY STORE');
  });

  it('handles a month with no sales (no $0 division)', () => {
    const pacing = computeBuyingPacing({
      stores: [store('Bells')],
      salesRows: [],
      purchaseRows: [],
      today: TODAY,
    });
    const msg = buildBuyingPacingMessage(pacing);
    expect(msg).toContain('No sales recorded yet this month.');
  });

  it('flags a projected overspend even when MTD is still under target', () => {
    // 1k buying so far on 1k sales → 100% (over now AND projected over).
    const pacing = computeBuyingPacing({
      stores: [store('Bells')],
      salesRows: [{ store_id: 'Bells', total_sales: 1000 }],
      purchaseRows: [{ store_id: 'Bells', total_cost: 1000 }],
      today: TODAY,
    });
    const msg = buildBuyingPacingMessage(pacing);
    expect(msg).toContain('on pace to overspend');
  });
});
