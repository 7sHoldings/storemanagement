import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { createPricebookItem, listDepartments } from '@/lib/nrs-pricebook';
import { mapWithConcurrency, STORE_CONCURRENCY } from '@/lib/pricebook-stores';
import { mergeDepartments, findMergedDepartment } from '@/lib/pricebook-departments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/pricebook/create
// Body: { item: { upc, name, size, dept, deptLabel?, costCents }, targets: [{ store_id, cents }] }
// Creates the same item across the selected stores, each with its own price.
// Owner-only. Per-store result list returned.
//
// A department can carry a different code in each store, so `dept` is
// translated to each store's own code (matched by code or name) before the
// item is created. A store that has no such department is reported as failed
// without calling NRS, rather than having NRS reject the item.
export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role, name').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'owner') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const { item, targets } = await req.json();
    const upc = String(item?.upc || '').trim();
    const name = String(item?.name || '').trim();
    const size = String(item?.size || '').trim();
    const dept = item?.dept;
    const deptLabel = String(item?.deptLabel || '').trim();
    const costCents = Number.isFinite(Number(item?.costCents)) ? Math.round(Number(item.costCents)) : 0;

    if (!upc) return NextResponse.json({ error: 'UPC is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
    if (!dept) return NextResponse.json({ error: 'Department is required' }, { status: 400 });
    if (!Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'Select at least one store' }, { status: 400 });
    }

    // Validate prices per target up front.
    const clean = [];
    for (const t of targets) {
      const cents = Number(t?.cents);
      if (!t?.store_id) return NextResponse.json({ error: 'Each target needs a store_id' }, { status: 400 });
      if (!Number.isInteger(cents) || cents < 0) {
        return NextResponse.json({ error: 'Each selected store needs a valid price' }, { status: 400 });
      }
      clean.push({ store_id: t.store_id, cents });
    }

    const admin = createAdminClient();
    const { data: stores } = await admin
      .from('stores').select('id, name, nrs_store_id')
      .in('id', clean.map(c => c.store_id));
    const byId = new Map((stores || []).map(s => [s.id, s]));

    // Each target store's departments. A store whose list cannot be loaded
    // falls back to the code as sent.
    const nrsStores = (stores || []).filter(s => s.nrs_store_id);
    const lists = await mapWithConcurrency(nrsStores, STORE_CONCURRENCY, s => listDepartments(s.nrs_store_id));
    const merged = mergeDepartments(nrsStores.map((s, i) => ({
      store_id: s.id, store: s.name,
      departments: lists[i].status === 'fulfilled' ? lists[i].value : null,
    })));
    const deptRow = findMergedDepartment(merged, { dept, label: deptLabel });
    const loadedIds = new Set(nrsStores.filter((_, i) => lists[i].status === 'fulfilled').map(s => s.id));
    const deptName = deptRow?.label || deptLabel || dept;

    const userLabel = profile.name ? `${profile.name} (StoreWise)` : '7S StoreWise';
    const results = [];
    for (const { store_id, cents } of clean) {
      const store = byId.get(store_id);
      const storeName = store?.name || store_id;
      if (!store?.nrs_store_id) {
        results.push({ store_id, store: storeName, ok: false, error: 'Store has no NRS ID configured' });
        continue;
      }
      const storeDept = deptRow?.codes[store_id] || (loadedIds.has(store_id) ? null : dept);
      if (!storeDept) {
        results.push({ store_id, store: storeName, ok: false, missingDept: true,
          error: `Department “${deptName}” isn’t set up in this store — add it in NRS first` });
        continue;
      }
      try {
        const r = await createPricebookItem(store.nrs_store_id, { upc, name, size, dept: storeDept, cents, costCents }, { user: userLabel });
        results.push({ store_id, store: storeName, ok: true, ...r });
      } catch (e) {
        console.error(`[pricebook/create] ${storeName} failed:`, e.message);
        results.push({ store_id, store: storeName, ok: false, error: e.message || 'Create failed' });
      }
    }

    const created = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    return NextResponse.json({ upc, name, created, failed, results });
  } catch (e) {
    console.error('[pricebook/create]', e);
    return NextResponse.json({ error: e.message || 'Create failed' }, { status: 500 });
  }
}
