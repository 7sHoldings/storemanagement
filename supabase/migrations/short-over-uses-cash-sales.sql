-- ═══════════════════════════════════════════════════════════
-- Unify Cash Collection and Daily Sales short/over.
--
-- Old behavior:
--   • Daily Sales:    cash_sales − r1_safe_drop − house     (no collection)
--                     OR  expected − collected               (after collect)
--   • Cash Collection: collected − expected (own calculation, opposite sign)
--
-- That meant Daily Sales could show "+$72.31 SHORT" before collection
-- and Cash Collection could simultaneously show "+$0.00 MATCHED" once
-- the owner recorded a collection that matched the (low) safe drop.
--
-- New behavior — both pages read the same short_over:
--   short_over = cash_sales (+ r2_net for R2 stores)
--              − (cash_collected when present, else r1_safe_drop + r2_safe_drop)
--              − r1_house_account_amount
--
-- Convention stays "positive = SHORT" everywhere.
--
-- Example, Apr 8 Troup:
--   cash_sales = 216.31, r1_safe_drop = 144, house = 0, no collection yet
--     → short_over = 216.31 − 144 − 0 = +72.31  (SHORT)
--   Owner collects $216 from the safe → cash_collected = 216
--     → short_over = 216.31 − 216 − 0 = +0.31   (essentially matched)
--
-- A cash_collections row is only honored when collected_by IS NOT NULL,
-- so leftover ghost rows from the old auto-upsert don't override the
-- math.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2 boolean;
  v_collected numeric;
  v_cash_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  -- Only honor a manually-recorded collection.
  SELECT cash_collected INTO v_collected
  FROM cash_collections
  WHERE store_id = new.store_id
    AND date     = new.date
    AND collected_by IS NOT NULL;

  -- Cash flow that should be accounted for. R2 is cash-only at Bells/Kerens.
  v_cash_total := coalesce(new.cash_sales, 0) + coalesce(new.r2_net, 0);

  IF uses_r2 THEN
    new.basket_r2_diff = coalesce(new.r2_net, 0) - coalesce(new.r1_canceled_basket, 0);
    new.r1_short_over  = 0;
    new.r2_short_over  = 0;
  ELSE
    new.r2_short_over  = 0;
    new.basket_r2_diff = 0;
  END IF;

  IF v_collected IS NOT NULL THEN
    new.short_over = v_cash_total - v_collected - coalesce(new.r1_house_account_amount, 0);
  ELSE
    new.short_over = v_cash_total
                   - coalesce(new.r1_safe_drop, 0)
                   - coalesce(new.r2_safe_drop, 0)
                   - coalesce(new.r1_house_account_amount, 0);
  END IF;
  -- Mirror to r1_short_over for single-register stores so legacy readers
  -- still pick it up (R2 stores keep r1_short_over = 0).
  IF NOT uses_r2 THEN
    new.r1_short_over = new.short_over;
  END IF;

  new.gross_sales   = coalesce(new.r1_gross, 0) + coalesce(new.r2_net, 0);
  new.net_sales     = coalesce(new.r1_net,   0) + coalesce(new.r2_net, 0);
  new.total_sales   = coalesce(new.r1_net,   0)
                    + coalesce(new.non_tax_sales, 0)
                    + coalesce(new.r2_net, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

UPDATE daily_sales SET id = id;
