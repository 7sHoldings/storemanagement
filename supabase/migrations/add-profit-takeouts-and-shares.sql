-- ═══════════════════════════════════════════════════════════
-- Profit Take Out + Store Shares
--
-- profit_takeouts:
--   Cross-store ledger of cash/card pulled from the business pool to
--   invest or distribute elsewhere. "Available profit" elsewhere in
--   the app is computed as (all-time net profit − sum of takeouts).
--
-- store_shareholders:
--   Per-store ownership table. Each row is one person + their share
--   percentage of that store. is_active = false hides them from the
--   default view but preserves history.
--
-- share_payouts:
--   Records of money actually paid to a shareholder. Each shareholder's
--   "remaining owed" = (store_net_profit × share_pct / 100)
--                      − sum(share_payouts.amount where shareholder_id = …)
--
-- All three tables are owner-only via RLS. Run in Supabase SQL Editor.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ── profit_takeouts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profit_takeouts (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  date        date NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  cash_amount numeric(12,2) DEFAULT 0 CHECK (cash_amount >= 0),
  card_amount numeric(12,2) DEFAULT 0 CHECK (card_amount >= 0),
  destination text,
  notes       text,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profit_takeouts_date ON profit_takeouts(date DESC);

ALTER TABLE profit_takeouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner view profit_takeouts" ON profit_takeouts;
CREATE POLICY "Owner view profit_takeouts"
  ON profit_takeouts FOR SELECT USING (is_owner());

DROP POLICY IF EXISTS "Owner manage profit_takeouts" ON profit_takeouts;
CREATE POLICY "Owner manage profit_takeouts"
  ON profit_takeouts FOR ALL USING (is_owner());

CREATE OR REPLACE TRIGGER tr_profit_takeouts_updated
  BEFORE UPDATE ON profit_takeouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── store_shareholders ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_shareholders (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  share_pct  numeric(6,3) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  notes      text,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_shareholders_store ON store_shareholders(store_id);

ALTER TABLE store_shareholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner view store_shareholders" ON store_shareholders;
CREATE POLICY "Owner view store_shareholders"
  ON store_shareholders FOR SELECT USING (is_owner());

DROP POLICY IF EXISTS "Owner manage store_shareholders" ON store_shareholders;
CREATE POLICY "Owner manage store_shareholders"
  ON store_shareholders FOR ALL USING (is_owner());

CREATE OR REPLACE TRIGGER tr_store_shareholders_updated
  BEFORE UPDATE ON store_shareholders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── share_payouts ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_payouts (
  id              uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  shareholder_id  uuid NOT NULL REFERENCES store_shareholders(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount >= 0),
  date            date NOT NULL,
  payment_method  text,
  notes           text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_payouts_shareholder ON share_payouts(shareholder_id, date DESC);

ALTER TABLE share_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner view share_payouts" ON share_payouts;
CREATE POLICY "Owner view share_payouts"
  ON share_payouts FOR SELECT USING (is_owner());

DROP POLICY IF EXISTS "Owner manage share_payouts" ON share_payouts;
CREATE POLICY "Owner manage share_payouts"
  ON share_payouts FOR ALL USING (is_owner());

CREATE OR REPLACE TRIGGER tr_share_payouts_updated
  BEFORE UPDATE ON share_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
