-- ═══════════════════════════════════════════════════════════
-- Include House Account / Employee Credit in short/over math.
--   R2 stores (Bells, Kerens):
--     short_over = R1 cash + R2 net − (R1 safe drop + house account)
--     diff       = R2 net − R1 canceled basket
--   Single-register stores (Reno, Denison, Troup):
--     short_over = R1 cash − (R1 safe drop + house account)
--
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
    new.short_over     = coalesce(new.cash_sales, 0)
                       + coalesce(new.r2_net, 0)
                       - coalesce(new.r1_safe_drop, 0)
                       - coalesce(new.r1_house_account_amount, 0);
    new.r1_short_over  = 0;
    new.r2_short_over  = 0;
    new.basket_r2_diff = coalesce(new.r2_net, 0)
                       - coalesce(new.r1_canceled_basket, 0);
  ELSE
    new.r1_short_over  = coalesce(new.cash_sales, 0)
                       - coalesce(new.r1_safe_drop, 0)
                       - coalesce(new.r1_house_account_amount, 0);
    new.r2_short_over  = 0;
    new.short_over     = new.r1_short_over;
    new.basket_r2_diff = 0;
  END IF;

  new.gross_sales   = coalesce(new.r1_gross, 0) + coalesce(new.r2_net, 0);
  new.net_sales     = coalesce(new.r1_net,   0) + coalesce(new.r2_net, 0);
  new.total_sales   = coalesce(new.cash_sales, 0)
                    + coalesce(new.card_sales, 0)
                    + coalesce(new.r2_net, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute every row so existing short_over values pick up the new formula.
UPDATE daily_sales SET id = id;
