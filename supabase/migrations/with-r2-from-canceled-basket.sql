-- ═══════════════════════════════════════════════════════════
-- Register 2 = the canceled basket (Bells, Kerens)
--
-- Every sale on the cash-only Register 2 is rung into NRS and then
-- CANCELLED, so the day's canceled-basket total (r1_canceled_basket, the
-- figure the Telegram register feed shows) is what R2 took. The safe drop
-- holds both tills' cash, so it is reconciled against both:
--
--   R2 sales   = canceled basket                      (no owner override)
--   short_over = R1 cash received + R2 cash − safe drop
--
-- The previous rule worked R2 out FROM the drop (drop − R1 cash). That
-- spends the whole drop on R2 sales, so these two stores could never show
-- short: Bells on 2026-11-06 rang 127.77 on R2, only 144 went in the safe
-- against 93.34 of R1 cash, and the app booked R2 as 50.66 with 0 short.
-- With the basket it is 77.11 short and R2 sales are the real 127.77.
-- Across Oct 1 – Nov 9 the basket nets to −8.68 against Kerens' drops but
-- leaves 765.97 unaccounted for at Bells, all of which the old rule hid.
--
-- The drop rule stays as the fallback for a day with no basket figure.
-- House accounts the R1 cash cannot cover were rung on R2 and come out of
-- R2's cash (see with-house-account-r2-cash.sql).
--
-- Mirrors lib/sales-r2.js. If you change one, change both.
-- Named so it sorts after the with-house-account-* files (later one wins).
-- Safe to re-run. Recomputes November 2026 onward only: earlier months are
-- closed (P&L, shares), so they keep their figures until an owner asks for
-- them to be recomputed (or a day is edited, which applies the new rule).
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2      boolean;
  r2_eff       numeric;   -- R2 sales, counted as sales as-is
  r2_cash      numeric;   -- R2 cash that should have reached the safe
  basket       numeric;   -- canceled-basket total = R2's takings
  house        numeric;   -- credit rung as cash, not in the drawer
  house_r2     numeric;   -- part of the credit R1's cash cannot cover
  cash_in      numeric;   -- POS cash actually received
  r1_net_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  house    := house_account_total(new);
  cash_in  := greatest(coalesce(new.cash_sales, 0) - house, 0);
  house_r2 := greatest(house - greatest(coalesce(new.cash_sales, 0), 0), 0);
  basket   := greatest(coalesce(new.r1_canceled_basket, 0), 0);

  IF uses_r2 THEN
    IF new.r2_override IS NOT NULL THEN
      -- An owner has corrected this day by hand; their figure stands.
      r2_eff  := greatest(new.r2_override, 0);
      r2_cash := greatest(r2_eff - house_r2, 0);
      new.r2_estimated := false;
    ELSIF basket > 0 THEN
      -- R2 sales are rung and canceled in NRS: the basket is R2.
      r2_eff  := basket;
      r2_cash := greatest(r2_eff - house_r2, 0);
      new.r2_estimated := false;
    ELSE
      -- No basket figure (not synced yet): fall back to the drop.
      r2_eff  := greatest(coalesce(new.r1_safe_drop, 0) - cash_in, 0);
      r2_cash := r2_eff;
      new.r2_estimated := (r2_eff > 0);
    END IF;

    new.r2_net   := r2_eff;
    new.r2_gross := r2_eff;

    new.short_over     := cash_in + r2_cash - coalesce(new.r1_safe_drop, 0);
    new.r1_short_over  := 0;
    new.r2_short_over  := 0;
    new.basket_r2_diff := r2_eff - basket;
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

-- Recompute the open month. The trigger does the math; this just fires it.
UPDATE daily_sales d
   SET r1_canceled_basket = d.r1_canceled_basket
  FROM stores s
 WHERE s.id = d.store_id
   AND s.has_register2
   AND d.date >= '2026-11-01'
   AND coalesce(d.r1_canceled_basket, 0) > 0;
