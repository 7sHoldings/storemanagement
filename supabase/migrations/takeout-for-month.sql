-- ═══════════════════════════════════════════════════════════
-- Which month's cash a withdrawal came out of
--
-- A withdrawal is recorded on the day it happens, but the money often
-- belongs to an earlier month: cash earned in August, taken out in
-- September. Counting it against September made September look like it
-- paid out more than it took in, when the money was August's all along.
--
-- for_month holds that attribution as 'YYYY-MM'. It starts equal to the
-- month the withdrawal was recorded in, which is the common case and
-- exactly what the app did before, so nothing changes until someone edits
-- a row to say otherwise.
--
-- 'YYYY-MM' sorts chronologically as plain text, so "everything before
-- this month" is a simple string comparison — no date parsing, and no
-- timezone to shift a withdrawal into the wrong month.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profit_takeouts ADD COLUMN IF NOT EXISTS for_month text;

-- Existing rows keep behaving exactly as they did: attributed to the month
-- they were recorded in.
UPDATE profit_takeouts
   SET for_month = to_char(date, 'YYYY-MM')
 WHERE for_month IS NULL;

-- A row with no attribution would silently vanish from every month view,
-- so the column defaults itself from the date on insert and update.
CREATE OR REPLACE FUNCTION set_takeout_for_month()
RETURNS trigger AS $$
BEGIN
  IF new.for_month IS NULL OR new.for_month !~ '^\d{4}-\d{2}$' THEN
    new.for_month := to_char(new.date, 'YYYY-MM');
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_takeout_for_month ON profit_takeouts;
CREATE TRIGGER tr_takeout_for_month
  BEFORE INSERT OR UPDATE ON profit_takeouts
  FOR EACH ROW EXECUTE FUNCTION set_takeout_for_month();

CREATE INDEX IF NOT EXISTS idx_profit_takeouts_for_month
  ON profit_takeouts(for_month);

NOTIFY pgrst, 'reload schema';
