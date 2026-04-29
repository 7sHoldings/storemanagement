-- ═══════════════════════════════════════════════════════════
-- Store opening hours.
--
-- open_time / close_time are CT (America/Chicago) wall-clock times in
-- HH:MM format (e.g. '11:00' to '22:00'). Used by the Employee
-- Tracking calculation to clamp shift hours to actual store hours:
--   • Employee opened at 10:30 (before open) → counted from 11:00
--   • Employee closed at 22:30 (after close) → counted to 22:00
--   • Late open at 11:30 / early close at 21:30 → counted as-is
--
-- Defaults to 11:00 / 22:00 since that matches the existing stores;
-- the owner can change per store under Settings → Edit Store.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS open_time  text DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS close_time text DEFAULT '22:00';
