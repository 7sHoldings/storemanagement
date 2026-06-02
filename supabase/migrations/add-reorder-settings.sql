-- ═══════════════════════════════════════════════════════════
-- Reorder settings: per-product case/box pack size, used by the
-- Auto Reorder view to convert "units short" into "boxes to order".
-- Keyed by UPC (pack size is a product attribute, same across stores).
--
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reorder_settings (
  upc        text PRIMARY KEY,
  case_pack  integer NOT NULL DEFAULT 1 CHECK (case_pack > 0),
  updated_at timestamptz DEFAULT now()
);
