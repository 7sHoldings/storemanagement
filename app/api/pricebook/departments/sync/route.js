import { NextResponse } from 'next/server';
import { getDepartmentRecords, createDepartment } from '@/lib/nrs-pricebook';
import { requireOwner, mapWithConcurrency, STORE_CONCURRENCY } from '@/lib/pricebook-stores';
import { similarKey } from '@/lib/department-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Plenty for five stores' worth of departments; bounds a runaway request.
const MAX_CREATES = 400;

// POST /api/pricebook/departments/sync
// Body: { creates: [{ store_id, name, source_store_id, source_dept }] }
//
// Adds departments that a store is missing, each copied (tax, age check,
// display settings) from `source_dept` in `source_store_id`. Owner-only.
//
// Every store's current list is re-read first: a department the store has
// gained since the plan was made (under any spelling that matches loosely)
// is skipped, never duplicated. Each create is independent and reported on
// its own, so one rejection doesn't stop the rest.
export async function POST(req) {
  try {
    const gate = await requireOwner();
    if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { creates } = await req.json();
    if (!Array.isArray(creates) || creates.length === 0) {
      return NextResponse.json({ error: 'creates array required' }, { status: 400 });
    }
    if (creates.length > MAX_CREATES) {
      return NextResponse.json({ error: `Too many departments in one request (max ${MAX_CREATES})` }, { status: 400 });
    }

    // Validate everything before touching NRS.
    const clean = [];
    const seen = new Set();
    for (const c of creates) {
      const storeId = String(c?.store_id || '').trim();
      const name = String(c?.name || '').trim();
      const sourceStoreId = String(c?.source_store_id || '').trim();
      const sourceDept = String(c?.source_dept || '').trim();
      if (!storeId || !name || !sourceStoreId || !sourceDept) {
        return NextResponse.json({ error: 'Each department needs store_id, name, source_store_id and source_dept' }, { status: 400 });
      }
      if (name.length > 60) return NextResponse.json({ error: `Department name too long: ${name}` }, { status: 400 });
      const key = `${storeId}|${similarKey(name)}`;
      if (seen.has(key)) return NextResponse.json({ error: `“${name}” listed twice for the same store` }, { status: 400 });
      seen.add(key);
      clean.push({ storeId, name, sourceStoreId, sourceDept });
    }

    const ids = [...new Set(clean.flatMap(c => [c.storeId, c.sourceStoreId]))];
    const { data: storeRows } = await gate.admin
      .from('stores').select('id, name, nrs_store_id, nrs_elmer_id').in('id', ids);
    const byId = new Map((storeRows || []).map(s => [s.id, s]));
    const bad = ids.find(id => !byId.get(id)?.nrs_store_id);
    if (bad) return NextResponse.json({ error: 'A selected store has no NRS ID configured' }, { status: 400 });

    // Fresh department records for every store involved: sources for the
    // settings to copy, targets for what they already have.
    const storeList = ids.map(id => byId.get(id));
    const lists = await mapWithConcurrency(storeList, STORE_CONCURRENCY, s => getDepartmentRecords(s.nrs_store_id));
    const records = new Map(storeList.map((s, i) => [s.id, lists[i].status === 'fulfilled' ? lists[i].value : null]));

    const results = [];
    const byTarget = [...new Set(clean.map(c => c.storeId))].map(storeId => ({
      store: byId.get(storeId),
      items: clean.filter(c => c.storeId === storeId),
    }));

    await mapWithConcurrency(byTarget, STORE_CONCURRENCY, async ({ store, items }) => {
      const existing = records.get(store.id);
      const have = new Set(Object.values(existing || {}).map(d => similarKey(d.label || d.dept)));
      for (const { name, sourceStoreId, sourceDept } of items) {
        const base = { store_id: store.id, store_name: store.name, name };
        if (!existing) { results.push({ ...base, ok: false, error: 'Could not read this store’s departments' }); continue; }
        if (have.has(similarKey(name))) { results.push({ ...base, ok: true, skipped: true, note: 'Already in this store' }); continue; }
        const template = records.get(sourceStoreId)?.[sourceDept];
        if (!template) {
          results.push({ ...base, ok: false, error: `“${sourceDept}” not found in ${byId.get(sourceStoreId)?.name || 'the source store'}` });
          continue;
        }
        try {
          const created = await createDepartment(store.nrs_store_id, store.nrs_elmer_id, name, template);
          have.add(similarKey(name));
          // Confirm the tax NRS stored matches what was copied.
          const sum = (arr) => (Array.isArray(arr) ? arr : []).reduce((s, a) => s + (Number(a?.rate_decibps) || 0), 0);
          const wanted = sum(template.auth_totals);
          const got = sum(created.auth_totals);
          results.push({
            ...base, ok: true,
            ...(created.auth_totals && wanted !== got ? { warning: `Tax saved as ${got / 1000}% (expected ${wanted / 1000}%)` } : {}),
          });
        } catch (e) {
          console.error(`[departments/sync] ${store.name} “${name}” failed:`, e.message);
          results.push({ ...base, ok: false, error: e.message || 'Create failed' });
        }
      }
    });

    return NextResponse.json({
      created: results.filter(r => r.ok && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      failed: results.filter(r => !r.ok).length,
      warnings: results.filter(r => r.warning).length,
      results,
    });
  } catch (e) {
    console.error('[departments/sync]', e);
    return NextResponse.json({ error: e.message || 'Department sync failed' }, { status: 500 });
  }
}
