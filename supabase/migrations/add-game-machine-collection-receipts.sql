-- ═══════════════════════════════════════════════════════════
-- game_machine_collections.receipt_urls
--
-- Optional photo attachments per collection (e.g. a snap of the
-- machine meter / cash count). Stored as an array of public URLs in
-- the existing `receipts` Storage bucket (same bucket the daily-sales
-- and expense receipts use, kind = 'game_machine').
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE game_machine_collections
  ADD COLUMN IF NOT EXISTS receipt_urls text[];
