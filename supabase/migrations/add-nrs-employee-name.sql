-- ═══════════════════════════════════════════════════════════
-- Add a profiles.nrs_employee_name alias.
--
-- NRS reports shift logins under whatever name was set on the POS
-- ("Dylan", "Bobbie", "User1"…) which often doesn't match the friendly
-- team name ("Bobby", "josh"). Storing the NRS-side name here lets
-- Employee Tracking match shifts to the right profile.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nrs_employee_name text;
