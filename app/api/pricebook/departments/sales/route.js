import { NextResponse } from 'next/server';
import { fetchBasketLines } from '@/lib/nrs-baskets';
import { requireOwner, loadNrsStores, mapWithConcurrency } from '@/lib/pricebook-stores';
import { aggregateDepartmentSales, dateChunks, lastNDays } from '@/lib/department-sales';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Sixty days of sale lines is many pages of NRS; one store per request.
export const maxDuration = 300;

const PAGE_SIZE = 200;
const MAX_PAGES = 60;
const CHUNK_DAYS = 3;
const CHUNK_CONCURRENCY = 3;

const todayCentral = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

// GET /api/pricebook/departments/sales?store_id=<uuid>&days=60
// One store's sales by department over the last `days` days (ending
// yesterday), added up from every register line in NRS. Read-only.
// Owner-only.
//
// Lines are fetched a few days at a time. A chunk that fills its page cap
// may be cut short, so it is reported in `truncated` rather than silently
// under-counted; a chunk that fails outright is reported in `failedRanges`.
export async function GET(req) {
  try {
    const gate = await requireOwner();
    if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '60', 10) || 60, 1), 120);
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

    const [store] = await loadNrsStores(gate.admin, [storeId]);
    if (!store) return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });

    const [from, to] = lastNDays(todayCentral(), days);
    const chunks = dateChunks(from, to, CHUNK_DAYS);
    const settled = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY,
      ([a, b]) => fetchBasketLines(store.nrs_store_id, a, b, { pageSize: PAGE_SIZE, maxPages: MAX_PAGES }));

    const lines = [];
    const truncated = [];
    const failedRanges = [];
    settled.forEach((r, i) => {
      if (r.status === 'rejected') { failedRanges.push({ from: chunks[i][0], to: chunks[i][1], error: r.reason?.message || 'Failed' }); return; }
      if (r.value.length >= PAGE_SIZE * MAX_PAGES) truncated.push({ from: chunks[i][0], to: chunks[i][1] });
      lines.push(...r.value);
    });

    return NextResponse.json({
      store_id: store.id,
      store: store.name,
      from, to, days,
      line_count: lines.length,
      departments: aggregateDepartmentSales(lines),
      truncated,
      failedRanges,
    });
  } catch (e) {
    console.error('[departments/sales]', e);
    return NextResponse.json({ error: e.message || 'Failed to load department sales' }, { status: 500 });
  }
}
