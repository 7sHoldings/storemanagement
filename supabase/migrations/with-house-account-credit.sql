-- ═══════════════════════════════════════════════════════════
-- House accounts come out of the cash, not out of the short
--
-- When an employee takes goods on credit, the cashier rings it in NRS as
-- CASH, so NRS's cash_sales includes money that never went into the drawer.
-- The later trigger versions dropped the house account from the formula,
-- which left every credit showing up as a cash SHORT the owner had to clear
-- by hand. The credit is neither cash nor card: it is money the employee
-- owes the store, cleared at payroll (see house_account_deductions below).
--
--   cash actually received = max(POS cash − house account, 0)
--
-- That figure replaces POS cash everywhere the trigger reconciles the drop:
--   Single-register (Reno/Denison/Troup):
--     short_over = cash received − safe drop
--   R2 stores (Bells/Kerens):
--     R2         = max(safe drop − cash received, 0)    (no override)
--     short_over = cash received + R2 − safe drop
--
-- Sales totals are unchanged: the goods were sold, the sale is real.
--
-- Named with-* so it sorts after every other file that defines
-- calc_sales_totals(); the later one alphabetically wins on a fresh database.
--
-- Safe to re-run. Recomputes every stored day, so past days with a house
-- account stop showing that credit as short.
-- Run in Supabase SQL Editor (or via npm run db:migrate).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS r2_override numeric;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS house_accounts jsonb DEFAULT '[]'::jsonb;

-- The day's total house account. The per-employee array is the record of
-- truth; the single-amount column and legacy `credits` cover older rows.
CREATE OR REPLACE FUNCTION house_account_total(r daily_sales)
RETURNS numeric AS $$
DECLARE
  from_list numeric;
BEGIN
  IF r.house_accounts IS NOT NULL
     AND jsonb_typeof(r.house_accounts) = 'array'
     AND jsonb_array_length(r.house_accounts) > 0 THEN
    SELECT coalesce(sum(coalesce(nullif(e->>'amount', '')::numeric, 0)), 0)
      INTO from_list
      FROM jsonb_array_elements(r.house_accounts) e;
    RETURN greatest(from_list, 0);
  END IF;
  RETURN greatest(coalesce(nullif(r.r1_house_account_amount, 0), r.credits, 0), 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION calc_sales_totals()
RETURNS trigger AS $$
DECLARE
  uses_r2      boolean;
  r2_eff       numeric;   -- R2 cash, counted as sales as-is
  house        numeric;   -- credit rung as cash, not in the drawer
  cash_in      numeric;   -- POS cash actually received
  r1_net_total numeric;
BEGIN
  SELECT has_register2 INTO uses_r2 FROM stores WHERE id = new.store_id;
  uses_r2 := coalesce(uses_r2, false);

  house   := house_account_total(new);
  -- Clamped: a credit larger than the day's POS cash is a day NRS has not
  -- synced yet (cash still 0), not negative cash.
  cash_in := greatest(coalesce(new.cash_sales, 0) - house, 0);

  IF uses_r2 THEN
    IF new.r2_override IS NOT NULL THEN
      -- An owner has corrected this day by hand; their figure stands.
      r2_eff := greatest(new.r2_override, 0);
      new.r2_estimated := false;
    ELSE
      -- Only the part of the drop exceeding R1's real cash can be R2's.
      r2_eff := greatest(coalesce(new.r1_safe_drop, 0) - cash_in, 0);
      new.r2_estimated := (r2_eff > 0);
    END IF;

    new.r2_net   := r2_eff;
    new.r2_gross := r2_eff;

    new.short_over     := cash_in + r2_eff - coalesce(new.r1_safe_drop, 0);
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

-- ── Payroll deductions against house accounts ──────────────
-- Each row is money the employee paid back: deducted from a paycheck, or
-- handed back in cash. Open balance per employee =
--   sum(their daily_sales.house_accounts amounts) − sum(these amounts).
CREATE TABLE IF NOT EXISTS house_account_deductions (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  store_id      uuid REFERENCES stores(id) ON DELETE SET NULL,
  date          date NOT NULL,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  method        text NOT NULL DEFAULT 'payroll' CHECK (method IN ('payroll', 'cash')),
  notes         text,
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ha_deductions_employee ON house_account_deductions(employee_id);
CREATE INDEX IF NOT EXISTS idx_ha_deductions_date     ON house_account_deductions(date DESC);

ALTER TABLE house_account_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner view house_account_deductions" ON house_account_deductions;
CREATE POLICY "Owner view house_account_deductions"
  ON house_account_deductions FOR SELECT USING (is_owner());

DROP POLICY IF EXISTS "Owner manage house_account_deductions" ON house_account_deductions;
CREATE POLICY "Owner manage house_account_deductions"
  ON house_account_deductions FOR ALL USING (is_owner());

DROP TRIGGER IF EXISTS tr_ha_deductions_updated ON house_account_deductions;
CREATE TRIGGER tr_ha_deductions_updated
  BEFORE UPDATE ON house_account_deductions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Recompute every stored day under the new rule — past days included.
UPDATE daily_sales SET updated_at = updated_at;
