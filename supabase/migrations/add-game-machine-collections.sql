-- ═══════════════════════════════════════════════════════════
-- Game Machine Collections + profit_takeouts.source
--
-- game_machine_collections:
--   Per-store ledger of cash pulled from in-store game machines
--   (typically every ~2 weeks). This cash is part of the business
--   "cash in hand" pool but is intentionally NOT counted as sales
--   revenue anywhere — sales totals stay clean.
--
-- profit_takeouts.source:
--   Tags each take-out with which pool it drew from:
--     'sales'         (default — register cash collected from stores)
--     'game_machines' (cash collected from game machines)
--   Existing rows are backfilled to 'sales'.
--
-- Owner-only via RLS. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS game_machine_collections (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date         date NOT NULL,
  amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes        text,
  collected_by uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_machine_collections_store_date
  ON game_machine_collections(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_game_machine_collections_date
  ON game_machine_collections(date DESC);

ALTER TABLE game_machine_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner view game_machine_collections" ON game_machine_collections;
CREATE POLICY "Owner view game_machine_collections"
  ON game_machine_collections FOR SELECT USING (is_owner());

DROP POLICY IF EXISTS "Owner manage game_machine_collections" ON game_machine_collections;
CREATE POLICY "Owner manage game_machine_collections"
  ON game_machine_collections FOR ALL USING (is_owner());

CREATE OR REPLACE TRIGGER tr_game_machine_collections_updated
  BEFORE UPDATE ON game_machine_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── profit_takeouts.source ─────────────────────────────────
ALTER TABLE profit_takeouts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sales';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profit_takeouts_source_check'
  ) THEN
    ALTER TABLE profit_takeouts
      ADD CONSTRAINT profit_takeouts_source_check
      CHECK (source IN ('sales', 'game_machines'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profit_takeouts_source ON profit_takeouts(source);
