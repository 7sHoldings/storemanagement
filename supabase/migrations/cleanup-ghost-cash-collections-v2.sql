-- ═══════════════════════════════════════════════════════════
-- Stronger cleanup pass for cash_collections + diagnostics.
--
-- The first pass (cleanup-ghost-cash-collections.sql) only matched
-- rows where cash_collected = 0 exactly. If any rows landed with
-- cash_collected = NULL during the transition, they survived. This
-- pass deletes anything that wasn't manually recorded by the owner
-- (collected_by IS NULL), regardless of cash_collected.
--
-- Real owner-recorded zero collections are preserved because they
-- have a collected_by uuid.
--
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- 1. Diagnostic — peek before nuking. Comment out if you trust the math.
SELECT s.name AS store, cc.date, cc.cash_collected, cc.expected_amount,
       cc.collected_by, cc.created_at
FROM cash_collections cc
JOIN stores s ON s.id = cc.store_id
WHERE cc.collected_by IS NULL
ORDER BY s.name, cc.date DESC
LIMIT 100;

-- 2. Aggressive cleanup: delete every cash_collections row that wasn't
--    manually recorded by an owner.
DELETE FROM cash_collections WHERE collected_by IS NULL;

-- 3. Recompute every daily_sales row so short_over picks up the
--    fallback formula (cash − safe_drop − house_account) wherever
--    no manual collection exists.
UPDATE daily_sales SET id = id;

-- 4. Diagnostic — peek a few Troup rows with their actual safe_drop /
--    cash_sales. If safe_drop ≈ cash_sales for those days, short/over
--    is genuinely $0 (cashier dropped exactly what they took). If
--    safe_drop is much smaller, the trigger should now produce a
--    positive (SHORT) number after the recompute above.
SELECT ds.date, ds.cash_sales, ds.r1_safe_drop, ds.r2_safe_drop,
       ds.r1_house_account_amount, ds.short_over,
       (ds.cash_sales - ds.r1_safe_drop - coalesce(ds.r1_house_account_amount, 0)) AS expected_short_over
FROM daily_sales ds
JOIN stores s ON s.id = ds.store_id
WHERE s.name LIKE '%Troup%'
ORDER BY ds.date DESC
LIMIT 30;
