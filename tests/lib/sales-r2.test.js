import { describe, it, expect } from 'vitest';
import { effectiveR2, derivedR2, basketR2, hasOverride, houseAccountTotal, cashReceived, houseOnR2, shortOver } from '@/lib/sales-r2';

const R2 = { usesRegister2: true };
const SINGLE = { usesRegister2: false };

describe('derivedR2', () => {
  it('books the part of the safe drop that R1 cannot account for', () => {
    // The owner's own worked example: POS total 1200, safe drop 300, but R1
    // only rang 100 in cash — the other 200 came from the second till.
    expect(derivedR2({ r1_safe_drop: 300, cash_sales: 100 })).toBe(200);
  });

  it('clamps at zero when the drop is under R1 cash', () => {
    // Missing cash, not a negative sale. Letting this go negative would
    // quietly subtract from R1's real, measured sales.
    expect(derivedR2({ r1_safe_drop: 50, cash_sales: 100 })).toBe(0);
  });

  it('treats blank and missing figures as zero rather than NaN', () => {
    expect(derivedR2({})).toBe(0);
    expect(derivedR2({ r1_safe_drop: '', cash_sales: '' })).toBe(0);
    expect(derivedR2(null)).toBe(0);
  });

  it('reads the string values the form actually holds', () => {
    expect(derivedR2({ r1_safe_drop: '300.50', cash_sales: '100.25' })).toBeCloseTo(200.25, 2);
  });
});

describe('hasOverride', () => {
  it('counts a typed zero as an entry', () => {
    // The whole point of the override: 0 has to be sayable, because "this
    // till took nothing today" is a real claim the rule cannot make.
    expect(hasOverride(0)).toBe(true);
    expect(hasOverride('0')).toBe(true);
  });

  it('does not count blank, whitespace, null or absent as an entry', () => {
    expect(hasOverride('')).toBe(false);
    expect(hasOverride('   ')).toBe(false);
    expect(hasOverride(null)).toBe(false);
    expect(hasOverride(undefined)).toBe(false);
  });
});

describe('effectiveR2 at a two-register store', () => {
  it('falls back to the safe-drop rule with no override and no basket figure', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, R2))
      .toMatchObject({ amount: 200, estimated: true, overridden: false });
  });

  it('marks a derived figure as estimated so reports can flag it', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, R2).estimated).toBe(true);
  });

  it('does not call a zero R2 an estimate — there is nothing inferred', () => {
    expect(effectiveR2({ r1_safe_drop: 100, cash_sales: 100 }, R2))
      .toMatchObject({ amount: 0, estimated: false, overridden: false });
  });

  it("prefers the owner's correction over the derived figure", () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_override: '250' }, R2))
      .toMatchObject({ amount: 250, estimated: false, overridden: true });
  });

  it('honours an override of zero instead of falling back to the rule', () => {
    // Guards the bug this whole change exists to prevent: if 0 were treated
    // as "unset", an owner could never correct a day down to nothing.
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_override: 0 }, R2))
      .toMatchObject({ amount: 0, estimated: false, overridden: true });
  });

  it('returns to the derived figure when the override is cleared', () => {
    const cleared = { r1_safe_drop: 300, cash_sales: 100, r2_override: '' };
    expect(effectiveR2(cleared, R2))
      .toMatchObject({ amount: 200, estimated: true, overridden: false });
  });

  it('clamps a negative override at zero', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_override: -50 }, R2).amount).toBe(0);
  });

  it('ignores a stored r2_net, which the trigger owns', () => {
    // r2_net is an output now. Reading it back as an input would let a day
    // promote its own estimate on the next save.
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_net: 999 }, R2).amount).toBe(200);
  });
});

describe('effectiveR2 at a single-register store', () => {
  it('ignores the safe drop entirely — there is no second till', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, SINGLE))
      .toMatchObject({ amount: 0, estimated: false, overridden: false });
  });

  it('is never marked estimated, since nothing is being inferred', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, SINGLE).estimated).toBe(false);
  });

  it('defaults to whatever r2_net holds', () => {
    expect(effectiveR2({ r2_net: 75 }, SINGLE).amount).toBe(75);
  });
});

describe('house accounts', () => {
  // A credit is rung as cash in NRS but never reaches the drawer, so it
  // comes out of POS cash before the drop is reconciled.
  it('a logged credit no longer shows as short at a single-register store', () => {
    const row = { cash_sales: 300, r1_safe_drop: 250, r1_house_account_amount: 50 };
    expect(cashReceived(row)).toBe(250);
    expect(shortOver(row, SINGLE)).toBe(0);
  });

  it('cash missing beyond the credit is still short (positive = SHORT)', () => {
    expect(shortOver({ cash_sales: 300, r1_safe_drop: 240, r1_house_account_amount: 50 }, SINGLE)).toBe(10);
  });

  it('prefers the per-employee list over the single-amount column', () => {
    const row = { house_accounts: [{ amount: 20 }, { amount: '30' }], r1_house_account_amount: 999 };
    expect(houseAccountTotal(row)).toBe(50);
  });

  it('falls back to legacy credits on old rows', () => {
    expect(houseAccountTotal({ credits: 40 })).toBe(40);
    expect(houseAccountTotal({})).toBe(0);
  });

  it('never makes received cash negative on a day NRS has not synced', () => {
    const row = { cash_sales: 0, r1_safe_drop: 0, r1_house_account_amount: 50 };
    expect(cashReceived(row)).toBe(0);
    expect(shortOver(row, SINGLE)).toBe(0);
    expect(derivedR2(row)).toBe(0);
  });

  it('at an R2 store the credit is not mistaken for missing R2 sales', () => {
    // R1 rang 100 cash, 50 of it a credit; R2 took 200; drop = 50 + 200.
    const row = { cash_sales: 100, r1_safe_drop: 250, r1_house_account_amount: 50 };
    expect(derivedR2(row)).toBe(200);
    expect(shortOver(row, R2)).toBe(0);
  });

  it('an R2 owner override still reconciles against received cash', () => {
    const row = { cash_sales: 100, r1_safe_drop: 230, r2_override: 200, r1_house_account_amount: 50 };
    expect(shortOver(row, R2)).toBe(20);
  });

  it('a credit rung on R2 (R1 card-only) is not shown as short', () => {
    // Kerens, Oct 6: R1 rang no cash, R2 took 558.79 of which 260 was a
    // house account, and 284 went in the safe → 14.79 short, not 274.79.
    const row = { cash_sales: 0, r1_safe_drop: 284, r2_override: 558.79, house_accounts: [{ amount: 260 }] };
    expect(houseOnR2(row)).toBe(260);
    expect(shortOver(row, R2)).toBeCloseTo(14.79, 2);
  });

  it('splits a credit between R1 cash and R2 when R1 cash cannot cover it', () => {
    // R1 rang 30 cash, credit 50 → 30 off R1, 20 off R2's 200. Drop 210.
    const row = { cash_sales: 30, r1_safe_drop: 210, r2_override: 200, r1_house_account_amount: 50 };
    expect(houseOnR2(row)).toBe(20);
    expect(shortOver(row, R2)).toBe(-30);
  });

  it('a derived R2 is left alone — it came from the drop, without the credit', () => {
    const row = { cash_sales: 0, r1_safe_drop: 284, house_accounts: [{ amount: 260 }] };
    expect(shortOver(row, R2)).toBe(0);
  });
});

describe('R2 from the canceled basket (Bells, Kerens)', () => {
  it('books the canceled basket as R2 sales', () => {
    expect(basketR2({ r1_canceled_basket: '127.77' })).toBe(127.77);
    expect(effectiveR2({ r1_safe_drop: 144, cash_sales: 93.34, r1_canceled_basket: 127.77 }, R2))
      .toEqual({ amount: 127.77, estimated: false, overridden: false, source: 'basket' });
  });

  it('Bells, Nov 6: cash that never reached the safe now shows as short', () => {
    // R1 cash 93.34 + R2 (basket) 127.77 = 221.11 expected, 144 dropped.
    const row = { cash_sales: 93.34, r1_safe_drop: 144, r1_canceled_basket: 127.77 };
    expect(shortOver(row, R2)).toBeCloseTo(77.11, 2);
  });

  it('Kerens, Nov 6: basket matches the drop → essentially even', () => {
    const row = { cash_sales: 0, r1_safe_drop: 428, r1_canceled_basket: 428.6 };
    expect(shortOver(row, R2)).toBeCloseTo(0.6, 2);
  });

  it("an owner's override still beats the basket figure", () => {
    const row = { cash_sales: 0, r1_safe_drop: 300, r1_canceled_basket: 250, r2_override: 300 };
    expect(effectiveR2(row, R2).source).toBe('override');
    expect(shortOver(row, R2)).toBe(0);
  });

  it('a house account rung on R2 comes out of the basket cash', () => {
    const row = { cash_sales: 0, r1_safe_drop: 284, r1_canceled_basket: 558.44, house_accounts: [{ amount: 260 }] };
    expect(shortOver(row, R2)).toBeCloseTo(14.44, 2);
  });

  it('a day with no safe drop recorded shows the whole cash as short', () => {
    const row = { cash_sales: 0, r1_safe_drop: 0, r1_canceled_basket: 120.96 };
    expect(shortOver(row, R2)).toBeCloseTo(120.96, 2);
  });
});
