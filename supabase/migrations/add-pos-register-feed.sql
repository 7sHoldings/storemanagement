-- ═══════════════════════════════════════════════════════════
-- Register feed: every basket, every line, and the events that
-- matter for watching a till (voids, cancels, no-sales).
--
-- NRS has no webhook, so a poller reads its reports every few
-- minutes. Everything here is keyed so re-reading the same
-- window cannot duplicate a row or re-send a notification.
-- ═══════════════════════════════════════════════════════════

-- ── One completed sale ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_baskets (
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  basket_no      text NOT NULL,
  opened_at      timestamptz,
  closed_at      timestamptz,
  entered_at     timestamptz,
  business_date  date NOT NULL,
  total_cents    integer,
  item_count     integer DEFAULT 0,
  -- A line with no UPC was keyed into a department by hand rather than
  -- scanned. That ratio is what NRS reports as its "scan rate".
  scanned_count  integer DEFAULT 0,
  manual_count   integer DEFAULT 0,
  discount_cents integer DEFAULT 0,
  cashier        text,
  -- Stamped once the basket has been announced, so a re-poll of the same
  -- window never sends it twice.
  notified_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, basket_no)
);

CREATE INDEX IF NOT EXISTS idx_pos_baskets_date ON pos_baskets(store_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_baskets_entered ON pos_baskets(entered_at DESC);
-- The poller's hot query: what is finished but not yet announced.
CREATE INDEX IF NOT EXISTS idx_pos_baskets_unnotified
  ON pos_baskets(store_id, entered_at) WHERE notified_at IS NULL;

-- ── One line on a sale ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_basket_items (
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  basket_no      text NOT NULL,
  item_no        integer NOT NULL,
  business_date  date NOT NULL,
  dept           text,
  upc            text,
  name           text,
  qty            numeric,
  amount_cents   integer,
  price_label    text,
  discount_cents integer DEFAULT 0,
  promo_cents    integer DEFAULT 0,
  -- 'scanned' | 'manual' — derived from whether NRS gave us a UPC.
  entry_method   text,
  verified_age   text,
  refund         boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, basket_no, item_no)
);

CREATE INDEX IF NOT EXISTS idx_pos_items_date ON pos_basket_items(store_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_items_upc ON pos_basket_items(upc);
CREATE INDEX IF NOT EXISTS idx_pos_items_manual
  ON pos_basket_items(store_id, business_date) WHERE entry_method = 'manual';

-- ── Things worth telling the owner about ───────────────────
-- void_item, cancel_basket, no_sale, refund, override — each carries the
-- cashier's name, which is the whole point of watching them.
CREATE TABLE IF NOT EXISTS pos_events (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  logged_at      timestamptz,
  business_date  date NOT NULL,
  cashier        text,
  description    text,
  amount_cents   integer,
  lines          integer,
  -- NRS reports these as plain arrays with no id, so identity is the event
  -- itself: same store, kind, timestamp, cashier and amount is the same
  -- event seen again on the next poll, not a second one.
  dedupe_key     text NOT NULL,
  notified_at    timestamptz,
  raw            jsonb,
  created_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_events_dedupe ON pos_events(store_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_pos_events_date ON pos_events(store_id, business_date DESC, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_events_unnotified
  ON pos_events(store_id, logged_at) WHERE notified_at IS NULL;

ALTER TABLE pos_baskets DISABLE ROW LEVEL SECURITY;
ALTER TABLE pos_basket_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE pos_events DISABLE ROW LEVEL SECURITY;

-- ── Per-store notification switches ────────────────────────
-- telegram_chat_id already exists; these say what that channel receives.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS notify_sales boolean DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS notify_events boolean DEFAULT true;
