import { describe, it, expect } from 'vitest';
import {
  daysInMonth, monthOverlapDays, proratedExpenses,
  coversWholeMonths, checkSalesIdentity, profitSummary, cashSummary, safeBalance, handBalance,
} from '@/lib/profit';

describe('daysInMonth', () => {
  it('knows the length of each month', () => {
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-02')).toBe(28);
  });
  it('handles a leap February', () => {
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('returns zero for rubbish rather than NaN', () => {
    expect(daysInMonth('')).toBe(0);
    expect(daysInMonth('2026-13')).toBe(0);
    expect(daysInMonth(null)).toBe(0);
  });
});

describe('monthOverlapDays', () => {
  it('counts a whole month when the range covers it', () => {
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-30')).toBe(30);
  });
  it('counts a part month', () => {
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-26')).toBe(26);
  });
  it('counts a single day as one', () => {
    expect(monthOverlapDays('2026-09', '2026-09-26', '2026-09-26')).toBe(1);
  });
  it('counts only the overlapping part when the range spans months', () => {
    expect(monthOverlapDays('2026-09', '2026-09-20', '2026-10-10')).toBe(11);
    expect(monthOverlapDays('2026-10', '2026-09-20', '2026-10-10')).toBe(10);
  });
  it('counts nothing for a month outside the range', () => {
    expect(monthOverlapDays('2026-08', '2026-09-01', '2026-09-30')).toBe(0);
  });
  it('does not shift a day in a timezone behind UTC', () => {
    // Built from Date parts rather than parsing, so the first of the month
    // cannot land on the previous month for a US-based viewer.
    expect(monthOverlapDays('2026-09', '2026-09-01', '2026-09-01')).toBe(1);
    expect(monthOverlapDays('2026-08', '2026-09-01', '2026-09-01')).toBe(0);
  });
  it('counts nothing when the range is inverted', () => {
    expect(monthOverlapDays('2026-09', '2026-09-30', '2026-09-01')).toBe(0);
  });
});

describe('proratedExpenses', () => {
  const sept = [{ month: '2026-09', amount: 3000 }];

  it('charges the whole month when the whole month is shown', () => {
    expect(proratedExpenses(sept, '2026-09-01', '2026-09-30')).toBe(3000);
  });

  it('charges one day of rent to a one-day view, not a month of it', () => {
    // The bug this replaces: a single day subtracted all $3,000 and reported
    // a loss that never happened.
    expect(proratedExpenses(sept, '2026-09-26', '2026-09-26')).toBe(100);
  });

  it('charges a part month its share', () => {
    expect(proratedExpenses(sept, '2026-09-01', '2026-09-26')).toBe(2600);
  });

  it('splits correctly across a month boundary', () => {
    const rows = [{ month: '2026-09', amount: 3000 }, { month: '2026-10', amount: 3100 }];
    // 11 of 30 September days + 10 of 31 October days
    expect(proratedExpenses(rows, '2026-09-20', '2026-10-10')).toBeCloseTo(1100 + 1000, 2);
  });

  it('ignores months the range never reaches', () => {
    const rows = [{ month: '2026-09', amount: 3000 }, { month: '2026-01', amount: 9999 }];
    expect(proratedExpenses(rows, '2026-09-01', '2026-09-30')).toBe(3000);
  });

  it('survives rows with a broken month or missing amount', () => {
    expect(proratedExpenses([{ month: 'nope', amount: 500 }], '2026-09-01', '2026-09-30')).toBe(0);
    expect(proratedExpenses([{ month: '2026-09' }], '2026-09-01', '2026-09-30')).toBe(0);
    expect(proratedExpenses(null, '2026-09-01', '2026-09-30')).toBe(0);
  });
});

describe('coversWholeMonths', () => {
  it('is true for a full calendar month', () => {
    expect(coversWholeMonths([{ month: '2026-09', amount: 1 }], '2026-09-01', '2026-09-30')).toBe(true);
  });
  it('is false for a partial month, so the page can say figures are shared out', () => {
    expect(coversWholeMonths([{ month: '2026-09', amount: 1 }], '2026-09-01', '2026-09-26')).toBe(false);
  });
  it('is true when there are no expenses at all', () => {
    expect(coversWholeMonths([], '2026-09-05', '2026-09-06')).toBe(true);
  });
});

describe('checkSalesIdentity', () => {
  it('accepts a row where gross minus tax equals total sales', () => {
    // Kerens, 26 Sep: gross 1151.05 (R1 754.23 + R2 396.82), tax 56.14.
    expect(checkSalesIdentity([
      { date: '2026-09-26', gross_sales: 1151.05, tax_collected: 56.14, total_sales: 1094.91 },
    ])).toEqual([]);
  });
  it('tolerates a cent of rounding', () => {
    expect(checkSalesIdentity([
      { date: 'd', gross_sales: 100, tax_collected: 8.25, total_sales: 91.76 },
    ])).toEqual([]);
  });
  it('reports a row where the chain does not close', () => {
    const off = checkSalesIdentity([
      { date: '2026-09-26', store_id: 's', gross_sales: 1000, tax_collected: 80, total_sales: 950 },
    ]);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ date: '2026-09-26', expected: 920, actual: 950 });
  });
});

describe('profitSummary', () => {
  const base = {
    sales: [
      // Kerens 26 Sep
      { date: '2026-09-26', store_id: 'k', gross_sales: 1151.05, tax_collected: 56.14, total_sales: 1094.91, cash_sales: 0.18, r2_net: 396.82, card_sales: 754.05, r1_safe_drop: 397, short_over: 0 },
      // Reno 26 Sep
      { date: '2026-09-26', store_id: 'r', gross_sales: 607.85, tax_collected: 46.30, total_sales: 561.55, cash_sales: 221.92, r2_net: 0, card_sales: 385.93, r1_safe_drop: 0, short_over: 221.92 },
    ],
    purchases: [{ total_cost: 400 }, { unit_cost: 100 }],
    expenses: [{ month: '2026-09', amount: 3000 }],
    collections: [{ cash_collected: 380 }],
    games: [{ amount: 50 }],
    start: '2026-09-26', end: '2026-09-26',
  };

  it('walks the chain the owner described', () => {
    const s = profitSummary(base);
    expect(s.grossSales).toBe(1758.90);
    expect(s.tax).toBe(102.44);
    expect(s.totalSales).toBe(1656.46);
    // gross − tax must land exactly on total sales
    expect(s.grossSales - s.tax).toBeCloseTo(s.totalSales, 2);
  });

  it('subtracts buying and expenses to reach profit', () => {
    const s = profitSummary(base);
    expect(s.productBuying).toBe(500);
    expect(s.expenses).toBe(100);          // one day of a $3,000 month
    // 1656.46 sales + 50 games − 500 buying − 100 expenses
    expect(s.profit).toBe(1106.46);
  });

  it('counts R2 takings as cash', () => {
    const s = profitSummary(base);
    // Kerens (0.18 drawer + 396.82 second till) + Reno (221.92, one till).
    // Counting cash_sales alone would report 222.10 and lose most of it.
    expect(s.cash.sales).toBe(618.92);
    expect(s.cash.card).toBe(1139.98);
  });

  it('reports margin against sales plus other income', () => {
    const s = profitSummary(base);
    expect(s.margin).toBeCloseTo(1106.46 / 1706.46 * 100, 1);
  });

  it('flags that expenses were shared out for a part month', () => {
    expect(profitSummary(base).expensesProrated).toBe(true);
    expect(profitSummary({ ...base, start: '2026-09-01', end: '2026-09-30' }).expensesProrated).toBe(false);
  });

  it('returns zeroes rather than NaN when there is nothing to show', () => {
    const s = profitSummary({ start: '2026-09-01', end: '2026-09-30' });
    expect(s.grossSales).toBe(0);
    expect(s.profit).toBe(0);
    expect(s.margin).toBe(0);
    expect(s.days).toBe(0);
  });

  it('can report a loss without clamping it to zero', () => {
    const s = profitSummary({
      sales: [{ date: 'd', gross_sales: 100, tax_collected: 8, total_sales: 92 }],
      purchases: [{ total_cost: 500 }], expenses: [], start: '2026-09-01', end: '2026-09-30',
    });
    expect(s.profit).toBe(-408);
  });
});

describe('safeBalance', () => {
  it('is everything dropped less everything collected from the safe', () => {
    expect(safeBalance({
      sales: [{ r1_safe_drop: 400, r2_safe_drop: 100 }, { r1_safe_drop: 250 }],
      collections: [{ cash_collected: 500 }],
    })).toBe(250);
  });
  it('is zero with no history rather than NaN', () => {
    expect(safeBalance({})).toBe(0);
    expect(safeBalance()).toBe(0);
  });
});

describe('handBalance', () => {
  it('is everything collected and earned in cash, less what left', () => {
    expect(handBalance({
      collections: [{ cash_collected: 1000 }],
      games: [{ amount: 300 }],
      takeouts: [{ cash_amount: 400 }],
      cashExpenses: [{ amount: 100 }],
    })).toBe(800);
  });
  it('counts only the cash half of a part-card takeout', () => {
    expect(handBalance({
      collections: [{ cash_collected: 1000 }],
      takeouts: [{ amount: 900, cash_amount: 200, card_amount: 700 }],
    })).toBe(800);
  });
  it('is zero with no history rather than NaN', () => {
    expect(handBalance({})).toBe(0);
  });
});

describe('cashSummary — two piles, both carrying forward', () => {
  // September, from the owner's own screen.
  const sept = {
    sales: [{ cash_sales: 25519.37, r2_net: 0, r1_safe_drop: 24505, r2_safe_drop: 0 }],
    collections: [{ cash_collected: 15077 }],
    takeouts: [{ cash_amount: 37503 }],
    cashExpenses: [],
    games: [],
    opening: { safe: 6000, hand: 43180.98 },
  };

  it('reproduces the hand balance the owner saw', () => {
    const c = cashSummary(sept);
    expect(c.hand.opening).toBe(43180.98);
    expect(c.hand.change).toBe(-22426);        // 15077 − 37503
    expect(c.hand.closing).toBe(20754.98);
  });

  it('carries the safe forward too, which the old version did not', () => {
    // The old page showed 24505 − 15077 = 9428 as "still in the safe",
    // counting only this period and ignoring what August left behind.
    const c = cashSummary(sept);
    expect(c.safe.change).toBe(9428);          // the period's movement
    expect(c.safe.closing).toBe(15428);        // 6000 brought forward + 9428
  });

  it('adds both piles into everything held', () => {
    const c = cashSummary(sept);
    expect(c.totalHeld).toBe(round(c.safe.closing + c.hand.closing));
    expect(c.totalHeld).toBe(36182.98);
  });

  it('shows collections leaving one pile and joining the other', () => {
    const c = cashSummary(sept);
    expect(c.safe.collected).toBe(c.hand.collected);
  });

  it('keeps game cash out of sales cash but inside the hand balance', () => {
    const c = cashSummary({ ...sept, games: [{ amount: 500 }] });
    expect(c.salesCash).toBe(25519.37);
    expect(c.gameCash).toBe(500);
    expect(c.totalCashTaken).toBe(26019.37);
    expect(c.hand.closing).toBe(21254.98);     // 500 more in hand
    expect(c.safe.closing).toBe(15428);        // safe untouched by it
  });

  it('flags cash rung up that never reached a safe', () => {
    expect(cashSummary(sept).notDropped).toBe(1014.37);
  });

  it('is unaffected by the balances brought in when checking the drop', () => {
    // The integrity check is about this period only; a big opening balance
    // must not make a shortfall disappear.
    const c = cashSummary({ ...sept, opening: { safe: 999999, hand: 999999 } });
    expect(c.notDropped).toBe(1014.37);
  });

  it('can report a negative balance rather than hiding an overdraw', () => {
    const c = cashSummary({ opening: { safe: 0, hand: 100 }, takeouts: [{ cash_amount: 400 }] });
    expect(c.hand.closing).toBe(-300);
  });

  it('returns zeroes rather than NaN with nothing to show', () => {
    const c = cashSummary({});
    expect(c.hand.closing).toBe(0);
    expect(c.safe.closing).toBe(0);
    expect(c.totalHeld).toBe(0);
    expect(c.notDropped).toBe(0);
  });
});

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

describe('cashSummary — this period kept apart from what came before', () => {
  const sept = {
    sales: [{ cash_sales: 25519.37, r2_net: 0, r1_safe_drop: 24505, r2_safe_drop: 0 }],
    collections: [{ cash_collected: 15077 }],
    takeouts: [{ cash_amount: 37503 }],
    games: [{ amount: 1250 }],
    opening: { safe: 35649.87, hand: 63695.48 },
  };

  it('reports the period alone, with nothing carried in', () => {
    const c = cashSummary(sept);
    expect(c.period.cameIn).toBe(25755);       // 24505 dropped + 1250 games
    expect(c.period.wentOut).toBe(37503);
    expect(c.period.left).toBe(-11748);        // took out more than came in
  });

  it('counts only cash that reached a safe as having come in', () => {
    // The tills rang 25,519.37 but only 24,505 was dropped. Counting the
    // rung-up figure would have the total claim $1,014.37 that is not
    // anywhere. It is reported as missing instead.
    const c = cashSummary(sept);
    expect(c.salesCash).toBe(25519.37);
    expect(c.period.cameIn).toBe(25755);       // uses the drop, not the till
    expect(c.notDropped).toBe(1014.37);
  });

  it('reports what was brought in from before, on its own', () => {
    expect(cashSummary(sept).broughtForward).toBe(99345.35);
  });

  it('adds the two to the total held, exactly', () => {
    const c = cashSummary(sept);
    expect(c.broughtForward + c.period.left).toBeCloseTo(c.totalHeld, 2);
    expect(c.totalHeld).toBe(87597.35);
  });

  it('keeps the period figure free of the opening balance', () => {
    // A big balance carried in must not change what the month itself did.
    const a = cashSummary(sept);
    const b = cashSummary({ ...sept, opening: { safe: 0, hand: 0 } });
    expect(b.period.left).toBe(a.period.left);
    expect(b.broughtForward).toBe(0);
  });
});
