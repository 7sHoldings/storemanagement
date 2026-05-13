-- ═══════════════════════════════════════════════════════════
-- stores.buying_target_pct
--
-- Per-store target for product buying as a % of net sales. Used by
-- the "Buying vs Sales" pacing card and the Wednesday Telegram report
-- to flag a store when month-to-date buying runs above this share of
-- its month-to-date net sales. Defaults to 50 (buying ≤ half of sales).
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS buying_target_pct numeric NOT NULL DEFAULT 50;
