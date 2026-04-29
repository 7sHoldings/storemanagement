-- ═══════════════════════════════════════════════════════════
-- Switch Register 2 (Bells, Kerens) from auto-mirroring R1 Canceled
-- Basket to manual employee entry, and wipe the bad auto-filled values
-- on existing rows so the owner can re-enter them.
--
--   1. calc_sales_totals no longer overwrites r2_net / r2_gross /
--      register2_cash for has_register2 stores. R2 is now whatever the
--      user typed in.
--   2. r2_short_over now uses register2_cash − r2_safe_drop (cash
--      counted on R2 vs cash dropped from R2), matching the form.
--   3. Existing daily_sales rows for has_register2 stores have all
--      R2 columns reset to 0 so prior auto-fills don't pollute reports.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
BEGIN
  new.r1_short_over = coalesce(new.cash_sales, 0)     - coalesce(new.r1_safe_drop, 0);
  new.r2_short_over = coalesce(new.register2_cash, 0) - coalesce(new.r2_safe_drop, 0);

  new.basket_r2_diff = coalesce(new.r2_net, 0) - coalesce(new.r1_canceled_basket, 0);

  new.short_over = coalesce(new.r1_short_over, 0) + coalesce(new.r2_short_over, 0);

  new.gross_sales   = coalesce(new.r1_gross, 0) + coalesce(new.r2_net, 0);
  new.net_sales     = coalesce(new.r1_net,   0) + coalesce(new.r2_net, 0);
  new.total_sales   = coalesce(new.cash_sales, 0) + coalesce(new.card_sales, 0) + coalesce(new.register2_cash, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Wipe R2 columns on every row for stores with has_register2 (Bells, Kerens).
-- The trigger above will fire on each updated row and recompute the totals.
UPDATE daily_sales
SET r2_net            = 0,
    r2_gross          = 0,
    register2_cash    = 0,
    r2_safe_drop      = 0,
    register2_card    = 0,
    register2_credits = 0,
    r2_short_over     = 0
WHERE store_id IN (SELECT id FROM stores WHERE has_register2 = true);
