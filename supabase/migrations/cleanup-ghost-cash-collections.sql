-- ═══════════════════════════════════════════════════════════
-- Stop ghost cash_collections rows from zeroing out short_over.
--
-- Until now, every NRS sync and every Daily Sales save upserted a
-- cash_collections row with only `expected_amount` set, leaving
-- `cash_collected` at its default of 0. The calc_sales_totals trigger
-- then read that 0 as "owner collected $0" and computed
--   short_over = expected − 0
-- — which lands on $0 for any NRS-synced day where the POS reports
-- zero drop (e.g. Troup), even though real cash sales should have
-- created a positive short.
--
-- Fix:
--   1. Drop the default on cash_collected so future inserts that
--      forget the field land as NULL ("not collected yet"), which the
--      trigger correctly falls back from.
--   2. Delete the existing ghost rows: cash_collected = 0 with no
--      collector. Owner-recorded $0 collections (collected_by IS NOT
--      NULL) are preserved.
--   3. Recompute every daily_sales row so short_over reflects the new
--      reality (cash − safe drop − house account when no row exists).
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE cash_collections ALTER COLUMN cash_collected DROP DEFAULT;

DELETE FROM cash_collections
WHERE cash_collected = 0
  AND collected_by IS NULL;

UPDATE daily_sales SET id = id;
