-- ═══════════════════════════════════════════════════════════
-- Register 2 inferred from the safe drop (Bells, Kerens)
--
-- At a two-register store the safe drop holds the cash from BOTH tills,
-- but the POS only knows its own. So anything dropped above what R1 rang
-- in cash came from Register 2:
--
--     R2 sales = R1 safe drop − R1 cash sales
--
-- Worked through: POS total 1200, safe drop 300, POS cash 100
--   → 300 − 100 = 200 from Register 2
--   → day's total sales = 1200 + 200 = 1400
--
-- Two deliberate limits on that rule:
--
-- 1. It only fills in for a day where nobody typed an R2 figure. A typed
--    figure is a real reading off the second register, and it is what
--    makes short/over meaningful — substitute the drop for it and
--    short/over becomes cash + (drop − cash) − drop, which is zero by
--    construction, every day, at every R2 store. The measurement and the
--    estimate cannot both come out of the same three numbers.
--
-- 2. A drop BELOW the POS cash figure is not negative R2 sales — it is
--    cash missing. R2 contributes nothing and the shortfall is left to
--    short/over to report, rather than quietly reducing the day's
--    revenue.
--
-- r2_estimated marks the days where the figure was inferred, so a zero
-- short/over on those days is not mistaken for a till that balanced.
--
-- Single-register stores are untouched: there is no second register, so
-- drop − cash there is a cash discrepancy and nothing else.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS r2_estimated boolean DEFAULT false;

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2   boolean;
  entered   numeric;   -- what the employee typed for R2, untouched
  inferred  numeric;   -- what the drop implies R2 took
  r2_eff    numeric;   -- the figure the totals actually use
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  IF uses_r2 THEN
    entered  := coalesce(new.r2_net, 0);
    -- Only the part of the drop exceeding R1's own cash can be R2's.
    inferred := greatest(coalesce(new.r1_safe_drop, 0) - coalesce(new.cash_sales, 0), 0);

    -- r2_net is left exactly as the employee left it. Writing the inferred
    -- figure back into it would make the estimate indistinguishable from a
    -- real reading on the next save — the row would re-enter this branch
    -- with entered > 0 and quietly promote itself to "measured".
    IF entered > 0 THEN
      r2_eff := entered;
      new.r2_estimated := false;
    ELSE
      r2_eff := inferred;
      new.r2_estimated := (inferred > 0);
    END IF;

    -- Where R2 was inferred this is zero by construction: the rule spends
    -- the whole drop on R2 sales, leaving nothing to reconcile. Where the
    -- drop fell short of POS cash, inferred is zero and this reports the
    -- shortfall as a genuine SHORT.
    new.short_over     := coalesce(new.cash_sales, 0) + r2_eff - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  := 0;
    new.r2_short_over  := 0;
    new.r2_gross       := r2_eff;
    new.basket_r2_diff := r2_eff - coalesce(new.r1_canceled_basket, 0);
  ELSE
    r2_eff             := coalesce(new.r2_net, 0);
    new.r2_estimated   := false;
    new.r1_short_over  := coalesce(new.cash_sales, 0) - coalesce(new.r1_safe_drop, 0);
    new.r2_short_over  := 0;
    new.short_over     := new.r1_short_over;
    new.basket_r2_diff := 0;
    new.r2_gross       := r2_eff;
  END IF;

  new.gross_sales   := coalesce(new.r1_gross, 0) + r2_eff;
  new.net_sales     := coalesce(new.r1_net,   0) + r2_eff;
  -- R2 is cash-only at these stores, so its net is its cash contribution.
  new.total_sales   := coalesce(new.cash_sales, 0)
                     + coalesce(new.card_sales, 0)
                     + r2_eff;
  new.tax_collected := coalesce(new.r1_sales_tax, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute history so day, week and month totals all move together.
-- A no-op UPDATE re-fires the trigger on every existing row.
UPDATE daily_sales SET updated_at = updated_at;
