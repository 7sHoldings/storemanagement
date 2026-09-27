-- ═══════════════════════════════════════════════════════════
-- Take sales tax back out of reported revenue
--
-- Days were being reported at the full amount customers handed over, tax
-- included, so the state's share was showing up as sales. On 26 Sep, Reno
-- read $607.85 when $46.30 of that was tax, and Troup read $1,042.01 with
-- $79.41 of tax inside it.
--
-- The cause is that NRS payloads are not consistent about byday.sales: at
-- one store it equals payamts.total, at another it equals payamts.total
-- minus the tax. The sync read it as always-net, so wherever it carried tax
-- the tax flowed into non_tax_sales and from there, untaxed, into
-- total_sales.
--
-- The correction does not need to know which kind of payload a row came
-- from. A day's sales can never exceed what customers actually paid less
-- the tax collected, so each row is capped at
--
--     r1_gross − r1_sales_tax
--
-- Rows already at or below that cap are untouched, which makes this a
-- no-op on correct data and therefore safe to run as many times as you
-- like — the arithmetic is self-limiting, not guarded by a flag.
--
-- The excess comes off non_tax_sales first (that is where it accumulated)
-- and only then off r1_net, so a store with genuine non-taxable sales keeps
-- them. Writing these columns fires calc_sales_totals(), which recomputes
-- total_sales, net_sales and gross_sales.
--
-- Rows with no r1_gross are skipped: those are hand-entered days with no
-- takings figure to cap against, and capping them at zero would erase them.
--
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  fixed integer;
BEGIN
  WITH capped AS (
    SELECT
      id,
      greatest(coalesce(r1_gross, 0) - coalesce(r1_sales_tax, 0), 0) AS cap,
      coalesce(r1_net, 0) + coalesce(non_tax_sales, 0)               AS stored_total,
      coalesce(r1_net, 0)                                            AS net_now,
      coalesce(non_tax_sales, 0)                                     AS nontax_now
    FROM daily_sales
    WHERE coalesce(r1_gross, 0) > 0
  ),
  over AS (
    -- Only days reporting more than the takings-less-tax cap.
    SELECT id, cap, net_now, nontax_now, stored_total - cap AS excess
    FROM capped
    WHERE stored_total > cap + 0.005          -- ignore rounding dust
  ),
  split AS (
    SELECT
      id,
      greatest(nontax_now - excess, 0)                        AS new_nontax,
      -- Whatever the non-taxable bucket could not absorb comes off the
      -- taxable figure, never below zero.
      greatest(net_now - greatest(excess - nontax_now, 0), 0) AS new_net
    FROM over
  )
  UPDATE daily_sales d
     SET non_tax_sales = s.new_nontax,
         r1_net        = s.new_net
    FROM split s
   WHERE d.id = s.id;

  GET DIAGNOSTICS fixed = ROW_COUNT;
  IF fixed = 0 THEN
    RAISE NOTICE 'Nothing to correct — no day reports more than takings minus tax.';
  ELSE
    RAISE NOTICE 'Corrected % day(s); sales tax is no longer counted as revenue.', fixed;
  END IF;
END $$;
