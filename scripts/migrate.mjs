#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// StoreWise Migration Runner
//
// Applies pending .sql files from supabase/migrations/ against the
// database, tracking what has run in a `schema_migrations` table so each
// file is only ever executed once. Runs automatically as part of
// `npm run build` (Vercel deploy), or manually via `npm run db:migrate`.
//
// Requires SUPABASE_DB_URL — the Postgres connection string from
// Supabase Dashboard → Project Settings → Database → Connection String
// (use the "Session pooler" URI so it works from any network).
//
// First run against the existing live database: the legacy migrations
// listed below were applied manually over time, so they are recorded as
// already-applied ("baselined") WITHOUT being re-executed. Only files not
// in that list (i.e. new migrations) actually run. Re-running the legacy
// trigger migrations in alphabetical order could install a stale trigger
// version, which is why they are never executed by this script.
//
// For a brand-new empty database use `--fresh` (runs schema.sql first,
// then every migration, in alphabetical order).
//
// NOTE: new migration files run in ALPHABETICAL order among pending ones —
// prefix related sequential changes with a date (e.g. 2026-07-21-add-x.sql)
// if ordering between them matters.
// ═══════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase', 'migrations');

// Everything applied manually before this runner existed. Do not add new
// files here — new migrations should be picked up and executed normally.
const LEGACY_BASELINE = [
  'add-ai-review-fields.sql',
  'add-basket-r2-diff.sql',
  'add-cashapp-check.sql',
  'add-credit-receipts.sql',
  'add-expense-date-column.sql',
  'add-game-machine-collection-date-to.sql',
  'add-game-machine-collection-receipts.sql',
  'add-game-machine-collections.sql',
  'add-house-account.sql',
  'add-invoices.sql',
  'add-manual-gross-net.sql',
  'add-non-tax-sales.sql',
  'add-nrs-employee-name.sql',
  'add-product-catalog.sql',
  'add-profit-takeouts-and-shares.sql',
  'add-receipt-arrays.sql',
  'add-receipt-verification.sql',
  'add-reorder-settings.sql',
  'add-restock-requests.sql',
  'add-safe-drop-fields.sql',
  'add-sales-fields.sql',
  'add-store-buying-target-pct.sql',
  'add-store-hours-by-day.sql',
  'add-store-hours.sql',
  'add-telegram-chat-id.sql',
  'add-warehouse-prices.sql',
  'cleanup-ghost-cash-collections-v2.sql',
  'cleanup-ghost-cash-collections.sql',
  'employee-shortover.sql',
  'employee_shifts.sql',
  'fix-shortover-formula.sql',
  'fix-total-sales-backfill.sql',
  'invoices-cascade.sql',
  'manual-r2-entry.sql',
  'nrs_integration.sql',
  'r2-net-only.sql',
  'separate-shortover-diff.sql',
  'short-over-from-cash-collection.sql',
  'short-over-ignore-ghost-collections.sql',
  'short-over-uses-cash-sales.sql',
  'short-over-with-house-account.sql',
  'total-sales-includes-nontax.sql',
  'trigger-r2-aware.sql',
  'update-total-sales-trigger.sql',
];

// Load .env.local the same way seed.mjs does (no dotenv dependency).
const envPath = resolve(ROOT, '.env.local');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#') && !(key.trim() in process.env)) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
}

const args = process.argv.slice(2);
const statusOnly = args.includes('--status');
const fresh = args.includes('--fresh');
const skipIfNoDb = args.includes('--skip-if-no-db');

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  if (skipIfNoDb) {
    console.log('⏭  SUPABASE_DB_URL not set — skipping migrations (build continues).');
    process.exit(0);
  }
  console.error('❌ SUPABASE_DB_URL is not set.');
  console.error('   Get it from Supabase Dashboard → Project Settings → Database →');
  console.error('   Connection String (Session pooler URI), then add it to .env.local');
  console.error('   and to Vercel → Project Settings → Environment Variables.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false },
});

const main = async () => {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      baseline boolean NOT NULL DEFAULT false
    )
  `);

  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map(r => r.name));

  // First run against the live DB: record the manually-applied legacy
  // migrations as done so they are never re-executed.
  if (applied.size === 0 && !fresh) {
    for (const name of LEGACY_BASELINE) {
      await client.query(
        'INSERT INTO schema_migrations (name, baseline) VALUES ($1, true) ON CONFLICT (name) DO NOTHING',
        [name]
      );
      applied.add(name);
    }
    console.log(`📋 Baselined ${LEGACY_BASELINE.length} legacy migrations (recorded as applied, not re-run).`);
  }

  if (fresh && applied.size === 0) {
    const schemaPath = resolve(ROOT, 'supabase', 'schema.sql');
    console.log('🆕 Fresh database — running schema.sql first…');
    await client.query(readFileSync(schemaPath, 'utf8'));
  }

  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const pending = files.filter(f => !applied.has(f));

  if (statusOnly) {
    console.log(`Applied: ${applied.size} · Pending: ${pending.length}`);
    pending.forEach(f => console.log(`  ⏳ ${f}`));
    return;
  }

  if (!pending.length) {
    console.log('✅ Database is up to date — no pending migrations.');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`▶ ${file} … `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('done');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      console.error(`❌ ${file}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`✅ Applied ${pending.length} migration(s).`);
};

main()
  .catch(e => { console.error('❌ Migration run failed:', e.message); process.exit(1); })
  .finally(() => client.end());
