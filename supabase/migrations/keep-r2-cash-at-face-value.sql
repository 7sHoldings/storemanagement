-- ═══════════════════════════════════════════════════════════
-- Register 2 cash counts as sales at face value
--
-- R2 was having tax stripped from it at R1's rate for the day, on the
-- assumption its cash carried tax the same way R1's did. Per the owner,
-- it does not: whatever R2 took is the sales figure, at every store.
--
-- So the only change is that r2_eff now goes into the day's total whole.
-- R1 is untouched and still has its tax removed — that part is measured,
-- not assumed.
--
-- Named keep-* so it sorts after fix-r2-owner-override.sql, which defines
-- the same function. An earlier-sorting name would be overwritten by it on
-- any database behind on both.
--
-- Safe to re-run. Recomputes stored rows from figures already held.
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS r2_override numeric;

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2      boolean;
  r2_eff       numeric;   -- R2 cash, counted as sales as-is
  r1_net_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  IF uses_r2 THEN
    IF new.r2_override IS NOT NULL THEN
      -- An owner has corrected this day by hand; their figure stands.
      r2_eff := greatest(new.r2_override, 0);
      new.r2_estimated := false;
    ELSE
      -- Only the part of the drop exceeding R1's own cash can be R2's.
      -- Clamped at zero: a drop under POS cash is missing cash, not a
      -- negative sale, and must not reduce the day's revenue.
      r2_eff := greatest(coalesce(new.r1_safe_drop, 0) - coalesce(new.cash_sales, 0), 0);
      new.r2_estimated := (r2_eff > 0);
    END IF;

    new.r2_net   := r2_eff;
    new.r2_gross := r2_eff;

    -- With a real R2 figure this reconciles the drop again. With a derived
    -- one it is zero by construction, because the rule already spent the
    -- whole drop on R2 sales.
    new.short_over     := coalesce(new.cash_sales, 0) + r2_eff - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  := 0;
    new.r2_short_over  := 0;
    new.basket_r2_diff := r2_eff - coalesce(new.r1_canceled_basket, 0);
  ELSE
    r2_eff             := coalesce(new.r2_override, new.r2_net, 0);
    new.r2_net         := r2_eff;
    new.r2_gross       := r2_eff;
    new.r2_estimated   := false;
    new.r1_short_over  := coalesce(new.cash_sales, 0) - coalesce(new.r1_safe_drop, 0);
    new.r2_short_over  := 0;
    new.short_over     := new.r1_short_over;
    new.basket_r2_diff := 0;
  END IF;

  -- R1 is already net of tax by the time it is stored: the sync takes the
  -- tax off before writing r1_net and non_tax_sales.
  r1_net_total := coalesce(new.r1_net, 0) + coalesce(new.non_tax_sales, 0);

  -- Sales for the day. R1 net of tax, plus R2's cash whole.
  new.total_sales   := round(r1_net_total + r2_eff, 2);
  new.net_sales     := new.total_sales;
  -- Collected at R1, tax included — labelled as such wherever it appears.
  new.gross_sales   := coalesce(new.r1_gross, 0) + r2_eff;
  new.tax_collected := coalesce(new.r1_sales_tax, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute every stored day under the new rule.
UPDATE daily_sales SET updated_at = updated_at;
