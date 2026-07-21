-- Track where an expense was paid from, so expenses paid out of the
-- collected cash (e.g. payroll handed to an employee from the safe) can be
-- deducted from the "Cash in Hand" shown on the Cash Collection page.
--   'bank'            → paid from bank/card (default — no effect on cash)
--   'cash_collection' → paid out of collected cash (deducted from Cash in Hand)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_from TEXT NOT NULL DEFAULT 'bank';

-- Partial index: the cash pages only ever query the cash-paid rows.
CREATE INDEX IF NOT EXISTS idx_expenses_paid_from
  ON expenses(expense_date)
  WHERE paid_from = 'cash_collection';
