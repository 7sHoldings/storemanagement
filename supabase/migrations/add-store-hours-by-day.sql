-- ═══════════════════════════════════════════════════════════
-- Per-day-of-week store hours.
--
-- stores.hours_by_day is a jsonb keyed by lowercase 3-letter day
-- (mon/tue/wed/thu/fri/sat/sun). Each value is either:
--   { "open": "HH:MM", "close": "HH:MM" }   — open that day
--   null                                    — closed that day
--
-- When set, hours_by_day overrides the legacy single open_time /
-- close_time pair for shift-hour clamping. The legacy columns stay
-- so older code paths and reports keep working.
--
-- Existing rows are backfilled with hours_by_day = { mon..sun:
-- { open: open_time || '11:00', close: close_time || '22:00' } }
-- so behavior matches what the owner already configured.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS hours_by_day jsonb;

UPDATE stores
SET hours_by_day = jsonb_build_object(
  'mon', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'tue', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'wed', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'thu', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'fri', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'sat', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00')),
  'sun', jsonb_build_object('open', coalesce(open_time, '11:00'), 'close', coalesce(close_time, '22:00'))
)
WHERE hours_by_day IS NULL;
