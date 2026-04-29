-- ═══════════════════════════════════════════════════════════
-- Cash Collection now drives short/over.
--   When cash_collections.cash_collected is recorded for a (store, date),
--   daily_sales.short_over is set to (expected_safe_drop − collected),
--   so the same number propagates to Sales, P&L, and Employee Tracking.
--   "Expected" = r1_safe_drop + r2_safe_drop.
--   Convention: positive = SHORT, negative = OVER.
--
--   When no cash collection has been recorded yet, the trigger falls
--   back to the previous sales-based formula:
--     R2 stores  : R1 cash + R2 net − R1 safe drop − house account
--     1-register : R1 cash − R1 safe drop − house account
--
--   A new trigger on cash_collections (insert/update/delete) fires a
--   no-op update on the matching daily_sales row so calc_sales_totals
--   re-runs and short_over stays in sync.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2 boolean;
  v_collected numeric;
  v_expected  numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  SELECT cash_collected INTO v_collected
  FROM cash_collections
  WHERE store_id = new.store_id AND date = new.date;

  v_expected := coalesce(new.r1_safe_drop, 0) + coalesce(new.r2_safe_drop, 0);

  IF uses_r2 THEN
    new.basket_r2_diff = coalesce(new.r2_net, 0) - coalesce(new.r1_canceled_basket, 0);
    new.r1_short_over  = 0;
    new.r2_short_over  = 0;
    IF v_collected IS NOT NULL THEN
      new.short_over = v_expected - v_collected;
    ELSE
      new.short_over = coalesce(new.cash_sales, 0)
                     + coalesce(new.r2_net, 0)
                     - coalesce(new.r1_safe_drop, 0)
                     - coalesce(new.r1_house_account_amount, 0);
    END IF;
  ELSE
    new.r2_short_over  = 0;
    new.basket_r2_diff = 0;
    IF v_collected IS NOT NULL THEN
      new.short_over    = v_expected - v_collected;
      new.r1_short_over = new.short_over;
    ELSE
      new.r1_short_over = coalesce(new.cash_sales, 0)
                        - coalesce(new.r1_safe_drop, 0)
                        - coalesce(new.r1_house_account_amount, 0);
      new.short_over    = new.r1_short_over;
    END IF;
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

-- When cash_collections changes, re-trigger calc_sales_totals on the
-- matching daily_sales row so short_over picks up the new collected value.
CREATE OR REPLACE FUNCTION recalc_sales_on_cash_change()
RETURNS trigger AS $$
DECLARE
  v_store uuid;
  v_date  date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_store := OLD.store_id;
    v_date  := OLD.date;
  ELSE
    v_store := NEW.store_id;
    v_date  := NEW.date;
  END IF;
  UPDATE daily_sales SET id = id WHERE store_id = v_store AND date = v_date;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_recalc_on_cash_change ON cash_collections;
CREATE TRIGGER tr_recalc_on_cash_change
AFTER INSERT OR UPDATE OR DELETE ON cash_collections
FOR EACH ROW EXECUTE FUNCTION recalc_sales_on_cash_change();

-- Recompute every existing row so historical short_over picks up the new logic.
UPDATE daily_sales SET id = id;
