// ═══════════════════════════════════════════════════════════
// Reading PostgREST errors.
//
// PostgREST validates a write against a cached copy of the schema and
// rejects the whole statement if it carries a column that cache does not
// have. That turns "one new field is not migrated yet" into "nothing can be
// saved at all", which is a bad trade when the rest of the row is fine.
// ═══════════════════════════════════════════════════════════

// PGRST204 is "column not found in the schema cache". The column name only
// appears inside the message, so it has to be read back out of the text.
const MISSING_COLUMN = /Could not find the '([^']+)' column/;

/**
 * The column a write was rejected for, or null if this is a different error.
 *
 * Note that a stale cache produces the same error as a genuinely absent
 * column — the caller cannot tell them apart, and does not need to: dropping
 * the column and retrying is the right move either way.
 */
export function missingColumn(error) {
  if (!error || error.code !== 'PGRST204') return null;
  const m = MISSING_COLUMN.exec(error.message || '');
  return m ? m[1] : null;
}
