-- ═══════════════════════════════════════════════════════════════════════
-- RUN THIS ONCE IN SUPABASE → SQL EDITOR → New query → Run
--
-- Why: the app now has an owner override for Register 2, but the column it
-- writes to does not exist in the database yet, which is what
-- "Could not find the 'r2_override' column ... in the schema cache" means.
--
-- Safe to run more than once. Changes no money on its own — it adds one
-- column and reinstalls the totals trigger, then recomputes the existing
-- rows from figures already stored.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS r2_override numeric;

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2      boolean;
  r2_eff       numeric;   -- R2 cash, tax included
  tax_rate     numeric;
  r2_net       numeric;   -- R2 with the tax taken out
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

-- Recompute history. r2_estimated used to be set to true for every
-- two-register day; it now only marks days where something was actually
-- inferred, so existing rows need a pass through the new trigger. No values
-- change here — the trigger derives everything from columns already stored.
UPDATE daily_sales SET updated_at = updated_at;

-- Tell PostgREST about the new column immediately, instead of waiting for
-- it to notice. This is what clears the "schema cache" error in the app.
NOTIFY pgrst, 'reload schema';

-- Check it worked. Expect one row: r2_override | numeric
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'daily_sales' AND column_name = 'r2_override';
