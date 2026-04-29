-- ═══════════════════════════════════════════════════════════
-- Credit / House Account receipts.
--   Employees uploading a daily sale with House Account credits must
--   attach receipt photos as proof of the IOU. Same multi-image
--   pattern as r1_receipt_urls / r2_receipt_urls.
-- Run in Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE daily_sales
  ADD COLUMN IF NOT EXISTS credit_receipt_urls jsonb DEFAULT '[]'::jsonb;
