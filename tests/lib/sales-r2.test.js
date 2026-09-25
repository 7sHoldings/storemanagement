import { describe, it, expect } from 'vitest';
import { effectiveR2, derivedR2, hasOverride } from '@/lib/sales-r2';

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
