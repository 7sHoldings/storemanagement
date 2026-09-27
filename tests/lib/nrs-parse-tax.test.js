import { describe, it, expect } from 'vitest';
import { parseNRSStatsToDailySales } from '@/lib/nrs-client';

// Shape of the NRS `pcrhist/.../stats/day` payload, with only the fields the
// parse reads. byday.sales is the day's takings WITH tax in it — the same
// number as payamts.total — which is the fact this whole file pins down.
// NRS sends every money field as an integer number of cents, so the dollar
// figures below are converted at the boundary exactly as the real payload is.
const c = (dollars) => Math.round(dollars * 100);
const stats = ({ cash = 0, card = 0, check = 0, tax = 0, taxableBase = 0, collected = null }) => ({
  data: {
    payamts: { cash: c(cash), credit_debit: c(card), check: c(check), total: c(cash + card + check) },
    byday: { sales: c(collected ?? cash + card + check) },
    taxable_amt: { amt: c(taxableBase) },
    collections: { tax: { amt: c(tax) } },
    drops: { amt: 0 },
  },
});

describe('NRS parse — sales tax must not reach revenue', () => {
  it('excludes tax from the total for a day with no non-taxable sales', () => {
    // Reno, 26 Sep: $221.92 cash + $385.93 card = $607.85 taken, $46.30 of
    // that is state tax. The alert reported $607.85 as sales.
    const r = parseNRSStatsToDailySales(
      stats({ cash: 221.92, card: 385.93, tax: 46.30, taxableBase: 561.55 }), 'store', '2026-09-26');
    expect(r.total_sales).toBe(561.55);
    expect(r.r1_gross).toBe(607.85);      // takings, tax included
    expect(r.tax_collected).toBe(46.30);
  });

  it('does not invent non-taxable sales out of the tax', () => {
    // The old rule did byday.sales − taxable_amt, which is exactly the tax
    // when nothing non-taxable was sold. That phantom then flowed into
    // revenue untaxed.
    const r = parseNRSStatsToDailySales(
      stats({ cash: 221.92, card: 385.93, tax: 46.30, taxableBase: 561.55 }), 'store', '2026-09-26');
    expect(r.non_tax_sales).toBe(0);
  });

  it('reproduces the Troup figures from the same alert', () => {
    const r = parseNRSStatsToDailySales(
      stats({ cash: 300.27, card: 741.74, tax: 79.41, taxableBase: 962.60 }), 'store', '2026-09-26');
    expect(r.total_sales).toBe(962.60);
    expect(r.non_tax_sales).toBe(0);
  });

  it('keeps genuinely non-taxable sales, minus only the tax', () => {
    // $1000 taken, $50 tax, $800 taxable base => $150 really was non-taxable.
    const r = parseNRSStatsToDailySales(
      stats({ cash: 1000, tax: 50, taxableBase: 800 }), 'store', '2026-09-26');
    expect(r.non_tax_sales).toBe(150);
    expect(r.total_sales).toBe(950);       // 1000 taken − 50 tax
    expect(r.r1_net).toBe(800);
  });

  it('falls back to takings-minus-tax when NRS reports no taxable base', () => {
    // Must not fall back to byday.sales, which still carries the tax.
    const r = parseNRSStatsToDailySales(
      stats({ cash: 500, tax: 30, taxableBase: 0 }), 'store', '2026-09-26');
    expect(r.total_sales).toBe(470);
    expect(r.r1_net).toBe(470);
  });

  it('never reports negative sales when tax exceeds the takings', () => {
    // Refund-heavy or malformed days must not drag revenue below zero.
    const r = parseNRSStatsToDailySales(
      stats({ cash: 10, tax: 40, taxableBase: 0 }), 'store', '2026-09-26');
    expect(r.total_sales).toBe(0);
    expect(r.non_tax_sales).toBe(0);
  });

  it('never reports a total above the money actually taken', () => {
    const r = parseNRSStatsToDailySales(
      stats({ cash: 300.27, card: 741.74, tax: 79.41, taxableBase: 962.60 }), 'store', '2026-09-26');
    expect(r.total_sales).toBeLessThanOrEqual(r.r1_gross);
  });

  it('always totals exactly the takings minus the tax, however the day splits', () => {
    // The one rule that has to hold no matter the mix: revenue is what came
    // in, less the state's share. Both branches of the taxable/non-taxable
    // split must land on the same number.
    const cases = [
      { cash: 221.92, card: 385.93, tax: 46.30, taxableBase: 561.55 },
      { cash: 1000, tax: 50, taxableBase: 800 },
      { cash: 500, tax: 30, taxableBase: 0 },      // no base reported
      { cash: 750.55, card: 12.30, tax: 0, taxableBase: 762.85 },  // untaxed day
      { cash: 100, card: 200, tax: 22.50, taxableBase: 150 },      // heavy non-taxable
    ];
    for (const c of cases) {
      const r = parseNRSStatsToDailySales(stats(c), 'store', '2026-09-26');
      const takings = (c.cash || 0) + (c.card || 0) + (c.check || 0);
      expect(r.total_sales).toBeCloseTo(takings - (c.tax || 0), 2);
      expect(r.r1_net + r.non_tax_sales).toBeCloseTo(r.total_sales, 2);
    }
  });

  it('lands exactly on cents rather than a floating-point tail', () => {
    const r = parseNRSStatsToDailySales(
      stats({ cash: 0.10, card: 0.20, tax: 0.03, taxableBase: 0.27 }), 'store', '2026-09-26');
    expect(r.total_sales).toBe(0.27);
    expect(String(r.total_sales)).not.toMatch(/\d{5,}/);
  });
});
