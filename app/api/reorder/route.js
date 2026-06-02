import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { listInventory } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/reorder?store_id=all|<uuid>
// Returns tracked items at/below their NRS reorder point across stores, with
// a suggested number of boxes to order (units short ÷ case pack). Owner-only.
export async function GET(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'owner') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const storeFilter = searchParams.get('store_id') || 'all';

    const admin = createAdminClient();
    let q = admin.from('stores').select('id, name, nrs_store_id').not('nrs_store_id', 'is', null).order('created_at');
    if (storeFilter !== 'all') q = q.eq('id', storeFilter);
    const { data: stores } = await q;
    if (!stores?.length) return NextResponse.json({ items: [], stores: [] });

    // Pull inventory per store (parallel); skip a store if NRS errors.
    const perStore = await Promise.allSettled(
      stores.map(async (s) => ({ store: s, inv: await listInventory(s.nrs_store_id) }))
    );

    // Case pack per UPC (graceful if the table isn't migrated yet).
    let packByUpc = new Map();
    try {
      const { data: settings } = await admin.from('reorder_settings').select('upc, case_pack');
      packByUpc = new Map((settings || []).map(s => [s.upc, s.case_pack]));
    } catch { /* table may not exist yet */ }

    const items = [];
    for (const r of perStore) {
      if (r.status !== 'fulfilled') continue;
      const { store, inv } = r.value;
      for (const it of inv) {
        if (!it.tracked || it.reorderPoint == null || it.onhand == null) continue;
        if (it.onhand > it.reorderPoint) continue; // not low yet
        const casePack = packByUpc.get(it.upc) || 1;
        // Refill back up to the reorder point; always at least one box.
        const shortUnits = Math.max(it.reorderPoint - it.onhand, 0);
        const boxes = Math.max(1, Math.ceil((shortUnits || 1) / casePack));
        items.push({
          store_id: store.id,
          store: store.name,
          upc: it.upc,
          name: it.name,
          dept: it.dept,
          onhand: it.onhand,
          reorderPoint: it.reorderPoint,
          sold: it.sold,
          salesPerDay: it.salesPerDay,
          daysLeft: it.exhaustedIn,
          casePack,
          boxes,
        });
      }
    }

    // Most urgent first (lowest days-left / most negative on-hand).
    items.sort((a, b) => (a.onhand - a.reorderPoint) - (b.onhand - b.reorderPoint));

    return NextResponse.json({ items, stores: stores.map(s => ({ id: s.id, name: s.name })) });
  } catch (e) {
    console.error('[api/reorder]', e);
    return NextResponse.json({ error: e.message || 'Failed to build reorder list' }, { status: 500 });
  }
}
