import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { createPricebookItem } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/pricebook/create
// Body: { item: { upc, name, size, dept, costCents }, targets: [{ store_id, cents }] }
// Creates the same item across the selected stores, each with its own price.
// Owner-only. Per-store result list returned.
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

    const userLabel = profile.name ? `${profile.name} (StoreWise)` : '7S StoreWise';
    const results = [];
    for (const { store_id, cents } of clean) {
      const store = byId.get(store_id);
      const storeName = store?.name || store_id;
      if (!store?.nrs_store_id) {
        results.push({ store_id, store: storeName, ok: false, error: 'Store has no NRS ID configured' });
        continue;
      }
      try {
        const r = await createPricebookItem(store.nrs_store_id, { upc, name, size, dept, cents, costCents }, { user: userLabel });
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
