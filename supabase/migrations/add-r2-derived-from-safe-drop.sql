-- ═══════════════════════════════════════════════════════════
-- Register 2 derived from the safe drop (Bells, Kerens)
--
-- At a two-register store the safe drop holds cash from both tills, but
-- the POS only knows its own. Anything dropped above what R1 rang in
-- cash came from Register 2:
--
--     R2 sales = R1 safe drop − R1 cash sales
--
-- Worked through: POS total 1200, safe drop 300, POS cash 100
--   → 300 − 100 = 200 from Register 2
--   → day's total sales = 1200 + 200 = 1400
--
-- This replaces the manual R2 entry outright. That entry was required of
-- employees and often skipped, and a skipped entry silently understated
-- the day — which is worse than an estimate, because nothing marks it as
-- missing. The drop is recorded either way, so the figure is always
-- available.
--
-- The cost, stated plainly: short/over at these two stores is now zero
-- whenever the drop covers POS cash. The rule spends the whole drop on R2
-- sales, so there is no residue left to reconcile — cash + (drop − cash)
-- − drop is zero by construction. Cash control at these stores now rests
-- on the safe drop vs Cash Collection comparison, which is independent of
-- the POS cash figure and is unaffected by this change.
--
-- A drop BELOW POS cash is not negative R2 sales, it is cash missing. R2
-- contributes nothing and short_over reports the shortfall, rather than
-- the day's revenue quietly dropping.
--
-- r2_net is overwritten with the derived figure so every existing report,
-- page and query that reads it stays correct without changes.
--
-- Single-register stores are untouched: with no second register,
-- drop − cash there is a cash discrepancy and nothing else.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS r2_estimated boolean DEFAULT false;

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2 boolean;
  r2_eff  numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  IF uses_r2 THEN
    -- Only the part of the drop exceeding R1's own cash can be R2's.
    -- Clamped at zero: a drop under POS cash is missing cash, not a
    -- negative sale, and must not reduce the day's revenue.
    r2_eff := greatest(coalesce(new.r1_safe_drop, 0) - coalesce(new.cash_sales, 0), 0);

    -- Overwrite whatever was typed. The figure is derived now, and every
    -- page and report already reads r2_net, so writing it here keeps them
    -- all correct without touching each one.
    new.r2_net       := r2_eff;
    new.r2_gross     := r2_eff;
    new.r2_estimated := true;

    -- Zero whenever the drop covers POS cash — the rule leaves nothing to
    -- reconcile. Positive (SHORT) when the drop fell short of it, which is
    -- the one case still worth flagging.
    new.short_over     := coalesce(new.cash_sales, 0) + r2_eff - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  := 0;
    new.r2_short_over  := 0;
    new.basket_r2_diff := r2_eff - coalesce(new.r1_canceled_basket, 0);
  ELSE
    r2_eff             := coalesce(new.r2_net, 0);
    new.r2_estimated   := false;
    new.r2_gross       := r2_eff;
    new.r1_short_over  := coalesce(new.cash_sales, 0) - coalesce(new.r1_safe_drop, 0);
    new.r2_short_over  := 0;
    new.short_over     := new.r1_short_over;
    new.basket_r2_diff := 0;
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
