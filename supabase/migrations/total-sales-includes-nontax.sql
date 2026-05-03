-- ═══════════════════════════════════════════════════════════
-- total_sales now reflects full net revenue
--
-- Old formula was payment-flow oriented:
--   total_sales = cash_sales + card_sales + r2_net
--
-- That misses non-taxable line items, so a row with $50 in non-taxable
-- merchandise (e.g. lottery, gift cards) reported a low Total. Fix
-- per owner spec:
--   total_sales = R1 net (taxable subtotal)
--               + R1 non-taxable subtotal
--               + R2 net
--
-- Convention: positive short_over = SHORT (existing). Other fields
-- (gross_sales, net_sales, basket_r2_diff, short_over, r2_gross,
-- tax_collected) keep the same math as before.
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
  -- Full net revenue across both registers, including non-taxable items.
  new.total_sales   = coalesce(new.r1_net, 0)
                    + coalesce(new.non_tax_sales, 0)
                    + coalesce(new.r2_net, 0);
  new.tax_collected = coalesce(new.r1_sales_tax, 0);
  new.r2_gross      = coalesce(new.r2_net, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Recompute every existing row so total_sales picks up the new formula.
UPDATE daily_sales SET id = id;
