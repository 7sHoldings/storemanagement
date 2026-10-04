import { describe, it, expect } from 'vitest';
import { suggestedCents, existingPrices, isNotFoundError } from '@/lib/pricebook-prefill';

const has = (store, cents) => ({ store, status: 'has', cents });
const missing = (store) => ({ store, status: 'missing', cents: null });

describe('suggestedCents', () => {
  it('uses the price most stores already charge', () => {
    expect(suggestedCents([has('Bells', 249), has('Reno', 229), has('Troup', 249), missing('Kerens')])).toBe(249);
  });

  it('breaks a tie with the first store in order', () => {
    expect(suggestedCents([has('Bells', 229), has('Reno', 249)])).toBe(229);
  });

  it('is null for a brand-new item, so every price starts at 0', () => {
    expect(suggestedCents([missing('Bells'), missing('Reno')])).toBeNull();
    expect(suggestedCents([])).toBeNull();
  });

  it('ignores stores that could not be checked', () => {
    expect(suggestedCents([{ store: 'X', status: 'unknown', cents: 999 }, has('Reno', 199)])).toBe(199);
  });
});

describe('existingPrices', () => {
  it('groups stores by price, most common first', () => {
    expect(existingPrices([has('Bells', 229), has('Reno', 249), has('Troup', 249)])).toEqual([
      { cents: 249, stores: ['Reno', 'Troup'] },
      { cents: 229, stores: ['Bells'] },
    ]);
  });
});

describe('isNotFoundError', () => {
  it('tells "not in this store" apart from a failed lookup', () => {
    expect(isNotFoundError(new Error('Item 123 not found in pricebook'))).toBe(true);
    expect(isNotFoundError(new Error('NRS 502 Bad Gateway'))).toBe(false);
  });
});
