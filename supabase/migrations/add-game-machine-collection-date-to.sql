-- ═══════════════════════════════════════════════════════════
-- game_machine_collections.date_to
--
-- A collection now records the period it covers, not just a single
-- day: `date` is the start (from) and `date_to` is the end. Existing
-- rows are backfilled so date_to = date (single-day periods). The
-- range / date filtering on the Game Machines page still keys off
-- `date`, and the cumulative cash pool is unaffected.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE game_machine_collections
  ADD COLUMN IF NOT EXISTS date_to date;

UPDATE game_machine_collections
  SET date_to = date
  WHERE date_to IS NULL;
