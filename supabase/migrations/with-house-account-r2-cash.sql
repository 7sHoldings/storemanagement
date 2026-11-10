-- ═══════════════════════════════════════════════════════════
-- House accounts rung on Register 2 come out of R2's cash too
--
-- with-house-account-credit.sql takes the day's house account out of R1's
-- POS cash, clamped at zero. At the R2 stores (Kerens, Bells) R1 is often
-- card-only and the credit is rung on the cash-only Register 2 instead, so
-- R1 has no cash to take it from and the whole credit was left showing as a
-- cash SHORT (Kerens, 2026-10-06: $260 house account → $274.79 "short").
--
-- Whatever part of the credit R1's cash cannot cover now comes out of R2:
--   cash received (R1) = max(POS cash − house, 0)
--   house on R2        = max(house − POS cash, 0)
--   R2 cash            = max(R2 − house on R2, 0)   (owner override only)
--   short_over         = cash received + R2 cash − safe drop
--
-- A derived R2 (no override) is worked out FROM the drop, so it never held
-- the credit and is left as is. Sales totals are unchanged: the goods were
-- sold. Single-register stores are unchanged.
--
-- Mirrors lib/sales-r2.js shortOver(). If you change one, change both.
-- Named so it sorts after with-house-account-credit.sql (later one wins).
-- Safe to re-run. Recomputes only the days this changes.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2      boolean;
  r2_eff       numeric;   -- R2 sales, counted as sales as-is
  r2_cash      numeric;   -- R2 cash that should have reached the safe
  house        numeric;   -- credit rung as cash, not in the drawer
  house_r2     numeric;   -- part of the credit R1's cash cannot cover
  cash_in      numeric;   -- POS cash actually received
  r1_net_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  house    := house_account_total(new);
  -- Clamped: a credit larger than the day's POS cash is either a day NRS has
  -- not synced yet or (R2 stores) a credit rung on Register 2.
  cash_in  := greatest(coalesce(new.cash_sales, 0) - house, 0);
  house_r2 := greatest(house - greatest(coalesce(new.cash_sales, 0), 0), 0);

  IF uses_r2 THEN
    IF new.r2_override IS NOT NULL THEN
      -- An owner has corrected this day by hand; their figure stands as
      -- sales, but any credit rung on R2 never reached the safe.
      r2_eff  := greatest(new.r2_override, 0);
      r2_cash := greatest(r2_eff - house_r2, 0);
      new.r2_estimated := false;
    ELSE
      -- Only the part of the drop exceeding R1's real cash can be R2's.
      r2_eff  := greatest(coalesce(new.r1_safe_drop, 0) - cash_in, 0);
      r2_cash := r2_eff;
      new.r2_estimated := (r2_eff > 0);
    END IF;

    new.r2_net   := r2_eff;
    new.r2_gross := r2_eff;

    new.short_over     := cash_in + r2_cash - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  := 0;
    new.r2_short_over  := 0;
    new.basket_r2_diff := r2_eff - coalesce(new.r1_canceled_basket, 0);
  ELSE
    r2_eff             := coalesce(new.r2_override, new.r2_net, 0);
    new.r2_net         := r2_eff;
    new.r2_gross       := r2_eff;
    new.r2_estimated   := false;
    new.r1_short_over  := cash_in - coalesce(new.r1_safe_drop, 0);
    new.r2_short_over  := 0;
    new.short_over     := new.r1_short_over;
    new.basket_r2_diff := 0;
  END IF;

  -- R1 is already net of tax by the time it is stored.
  r1_net_total := coalesce(new.r1_net, 0) + coalesce(new.non_tax_sales, 0);

  new.total_sales   := round(r1_net_total + r2_eff, 2);
  new.net_sales     := new.total_sales;
  new.gross_sales   := coalesce(new.r1_gross, 0) + r2_eff;
  new.tax_collected := coalesce(new.r1_sales_tax, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute the days this changes: R2 stores, owner-overridden R2, with a
-- house account bigger than R1's POS cash. The trigger does the math.
UPDATE daily_sales d
   SET r2_override = d.r2_override
  FROM stores s
 WHERE s.id = d.store_id
   AND s.has_register2
   AND d.r2_override IS NOT NULL
   AND house_account_total(d) > greatest(coalesce(d.cash_sales, 0), 0);
