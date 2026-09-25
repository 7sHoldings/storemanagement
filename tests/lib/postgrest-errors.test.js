import { describe, it, expect } from 'vitest';
import { missingColumn } from '@/lib/postgrest-errors';

describe('missingColumn', () => {
  it('reads the column name out of a real PGRST204 message', () => {
    // Verbatim from Supabase when a migration had not been applied.
    expect(missingColumn({
      code: 'PGRST204',
      message: "Could not find the 'r2_override' column of 'daily_sales' in the schema cache",
    })).toBe('r2_override');
  });

  it('ignores errors that are not PGRST204', () => {
    // A duplicate key has its own handling; treating it as a missing column
    // would silently strip a field and retry a write that should just fail.
    expect(missingColumn({ code: '23505', message: 'duplicate key value' })).toBeNull();
  });

  it('returns null when the code matches but the message does not', () => {
    expect(missingColumn({ code: 'PGRST204', message: 'something else entirely' })).toBeNull();
  });

  it('handles a missing message and a missing error', () => {
    expect(missingColumn({ code: 'PGRST204' })).toBeNull();
    expect(missingColumn(null)).toBeNull();
    expect(missingColumn(undefined)).toBeNull();
  });

  it('does not confuse the table name for the column name', () => {
    // Both are single-quoted in the message; only the first is the column.
    expect(missingColumn({
      code: 'PGRST204',
      message: "Could not find the 'non_tax_sales' column of 'daily_sales' in the schema cache",
    })).toBe('non_tax_sales');
  });
});
