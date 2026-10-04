import { describe, it, expect } from 'vitest';
import { effectiveR2, derivedR2, hasOverride, houseAccountTotal, cashReceived, shortOver } from '@/lib/sales-r2';

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
  it('uses the safe-drop rule when no override is set', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, R2))
      .toEqual({ amount: 200, estimated: true, overridden: false });
  });

  it('marks a derived figure as estimated so reports can flag it', () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100 }, R2).estimated).toBe(true);
  });

  it('does not call a zero R2 an estimate — there is nothing inferred', () => {
    expect(effectiveR2({ r1_safe_drop: 100, cash_sales: 100 }, R2))
      .toEqual({ amount: 0, estimated: false, overridden: false });
  });

  it("prefers the owner's correction over the derived figure", () => {
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_override: '250' }, R2))
      .toEqual({ amount: 250, estimated: false, overridden: true });
  });

  it('honours an override of zero instead of falling back to the rule', () => {
    // Guards the bug this whole change exists to prevent: if 0 were treated
    // as "unset", an owner could never correct a day down to nothing.
    expect(effectiveR2({ r1_safe_drop: 300, cash_sales: 100, r2_override: 0 }, R2))
      .toEqual({ amount: 0, estimated: false, overridden: true });
  });

  it('returns to the derived figure when the override is cleared', () => {
    const cleared = { r1_safe_drop: 300, cash_sales: 100, r2_override: '' };
    expect(effectiveR2(cleared, R2))
      .toEqual({ amount: 200, estimated: true, overridden: false });
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
      .toEqual({ amount: 0, estimated: false, overridden: false });
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
});
