-- ═══════════════════════════════════════════════════════════
-- total_sales excludes sales tax
--
-- The NRS parse already computed this correctly — netTaxable plus
-- non-taxable, which is the figure the POS prints as "Sales $" — and then
-- calc_sales_totals overwrote it with cash + card + R2. Those are amounts
-- COLLECTED, so they carry the tax with them, and every report and
-- Telegram total inherited the overstatement. For Bells on 2026-09-14
-- that is $887.83 collected against $820.16 of actual sales: $67.67 of
-- the state's money counted as revenue.
--
--     R1 sales (net) = r1_net + non_tax_sales
--
-- Register 2's figure is derived from the safe drop, so it is cash in
-- hand and carries tax too. There is no separate tax reading for R2, so
-- the tax is stripped using R1's own effective rate on the same day —
-- the two registers sell the same goods at the same rates, so R1's ratio
-- of tax to taxable sales is the best available estimate for R2's:
--
--     rate       = r1_sales_tax / r1_net
--     R2 (net)   = R2 cash / (1 + rate)
--
-- With no taxable R1 sales to derive a rate from, the rate is zero and R2
-- is taken at face value rather than guessed at.
--
-- gross_sales keeps its meaning: money collected, tax included. It is
-- labelled that way wherever it is shown.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2   boolean;
  r2_eff    numeric;   -- R2 cash, tax included
  tax_rate  numeric;
  r2_net    numeric;   -- R2 with the tax taken out
  r1_net_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  IF uses_r2 THEN
    -- Only the part of the drop exceeding R1's own cash can be R2's.
    -- Clamped at zero: a drop under POS cash is missing cash, not a
    -- negative sale, and must not reduce the day's revenue.
    r2_eff := greatest(coalesce(new.r1_safe_drop, 0) - coalesce(new.cash_sales, 0), 0);

    new.r2_net       := r2_eff;
    new.r2_gross     := r2_eff;
    new.r2_estimated := true;

    -- Zero whenever the drop covers POS cash — the rule leaves nothing to
    -- reconcile. Positive (SHORT) when the drop fell short of it.
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

  -- R2's cash carries tax it has no reading for; borrow R1's rate for the day.
  tax_rate := CASE WHEN coalesce(new.r1_net, 0) > 0
                   THEN coalesce(new.r1_sales_tax, 0) / new.r1_net
                   ELSE 0 END;
  r2_net       := r2_eff / (1 + tax_rate);
  r1_net_total := coalesce(new.r1_net, 0) + coalesce(new.non_tax_sales, 0);

  -- Sales, tax excluded. This is the number reports and alerts show.
  new.total_sales   := round(r1_net_total + r2_net, 2);
  new.net_sales     := new.total_sales;
  -- Collected, tax included — labelled as such wherever it appears.
  new.gross_sales   := coalesce(new.r1_gross, 0) + r2_eff;
  new.tax_collected := coalesce(new.r1_sales_tax, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute history so day, week and month totals all move together.
UPDATE daily_sales SET updated_at = updated_at;
