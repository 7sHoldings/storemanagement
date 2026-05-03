-- ═══════════════════════════════════════════════════════════
-- Non-destructive fix for the "stuck at $0" short_over issue.
--
-- Rather than DELETE any cash_collections rows (so all historical
-- data is preserved), the trigger is updated to only consider rows
-- that were manually recorded by an owner — i.e. collected_by IS
-- NOT NULL. Auto-created rows from the old NRS-sync / sales-save
-- code paths are simply ignored by the trigger, and short_over
-- falls back to: cash_sales − r1_safe_drop − r1_house_account_amount.
--
-- After this trigger update, daily_sales is recomputed in place so
-- historical short_over values reflect the real math.
--
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

  -- Only honor a cash_collections row if an owner actually filled it
  -- in (collected_by IS NOT NULL). Ghost rows that the old auto-upsert
  -- left behind are ignored, so short_over falls back to the
  -- sales-based formula below.
  SELECT cash_collected INTO v_collected
  FROM cash_collections
  WHERE store_id = new.store_id
    AND date     = new.date
    AND collected_by IS NOT NULL;

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
  new.total_sales   = coalesce(new.r1_net,   0)
                    + coalesce(new.non_tax_sales, 0)
                    + coalesce(new.r2_net, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute every existing row so short_over picks up the new logic.
UPDATE daily_sales SET id = id;
