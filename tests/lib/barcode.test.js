import { describe, it, expect } from 'vitest';
import { normalizeUpc, dedupeUpcs } from '@/lib/barcode';

describe('normalizeUpc', () => {
  it('keeps a 12-digit UPC as is', () => {
    expect(normalizeUpc('683770731642', 'upc_a')).toBe('683770731642');
  });

  it('trims the leading 0 a decoder adds when it reads a UPC as EAN-13', () => {
    expect(normalizeUpc('0683770731642', 'ean_13')).toBe('683770731642');
    expect(normalizeUpc('0683770731642', 'EAN_13')).toBe('683770731642');
    expect(normalizeUpc('0683770731642')).toBe('683770731642');
  });

  it('leaves a real EAN-13 (not starting with 0) alone', () => {
    expect(normalizeUpc('5012345678900', 'ean_13')).toBe('5012345678900');
  });

  it('does not touch other formats', () => {
    expect(normalizeUpc('0123456789012', 'code_128')).toBe('0123456789012');
    expect(normalizeUpc('  ABC-123 ', 'code_39')).toBe('ABC-123');
  });

  it('returns empty for nothing', () => {
    expect(normalizeUpc(null)).toBe('');
    expect(normalizeUpc('   ')).toBe('');
  });
});

describe('dedupeUpcs', () => {
  it('drops repeated UPCs but keeps unread (blank) rows', () => {
    const rows = [{ upc: '1' }, { upc: '2' }, { upc: '1' }, { upc: '' }, { upc: '' }];
    expect(dedupeUpcs(rows)).toEqual([{ upc: '1' }, { upc: '2' }, { upc: '' }, { upc: '' }]);
  });
});
