-- ═══════════════════════════════════════════════════════════
-- Register 2 simplification (Bells, Kerens):
--   • R2 stores capture only R2 Net Sales — no separate R2 cash or
--     R2 safe drop. R2 is cash-only and the cash drop for both
--     registers is the single R1 Safe Drop number.
--   • short_over (R2 stores) = R1 cash + R2 net − R1 safe drop
--                              (positive = SHORT, negative = OVER)
--   • basket_r2_diff (R2 stores) = R2 net − R1 canceled basket
--   • Single-register stores keep the old formula:
--     short_over = R1 cash − R1 safe drop
--   • total_sales now uses r2_net (R2 cash == R2 net at R2 stores).
--   • Existing register2_cash / r2_safe_drop / r2_short_over values
--     on R2-store rows are zeroed since they are no longer meaningful.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2 boolean;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  IF uses_r2 THEN
    -- Single combined short/over for the day.
    new.short_over     = coalesce(new.cash_sales, 0)
                       + coalesce(new.r2_net, 0)
                       - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  = 0;
    new.r2_short_over  = 0;
    new.basket_r2_diff = coalesce(new.r2_net, 0)
                       - coalesce(new.r1_canceled_basket, 0);
  ELSE
    new.r1_short_over  = coalesce(new.cash_sales, 0) - coalesce(new.r1_safe_drop, 0);
    new.r2_short_over  = 0;
    new.short_over     = new.r1_short_over;
    new.basket_r2_diff = 0;
  END IF;

  new.gross_sales   = coalesce(new.r1_gross, 0) + coalesce(new.r2_net, 0);
  new.net_sales     = coalesce(new.r1_net,   0) + coalesce(new.r2_net, 0);
  -- R2 is cash-only at R2 stores; r2_net == r2 cash. Single-register
  -- stores have r2_net = 0, so this works for both.
  new.total_sales   = coalesce(new.cash_sales, 0)
                    + coalesce(new.card_sales, 0)
                    + coalesce(new.r2_net, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Zero the columns that no longer carry meaning on R2-store rows.
-- The trigger above will then recompute short_over / basket_r2_diff
-- from r1 cash + r2_net − r1 safe drop and r1_canceled_basket − r2_net.
UPDATE daily_sales
SET register2_cash    = 0,
    r2_safe_drop      = 0,
    register2_card    = 0,
    register2_credits = 0,
    r2_short_over     = 0,
    r1_short_over     = 0
WHERE store_id IN (SELECT id FROM stores WHERE has_register2 = true);
