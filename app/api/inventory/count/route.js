import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { setInventoryCount } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/inventory/count
// Body: { store_id, upc, name, cnt, case_pack? }
// Pushes a physical-count correction to NRS (sets on-hand + enables tracking).
// Optionally saves the box/case pack size for Auto Reorder. Owner (any store)
// or the store's assigned employee.
export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: profile } = await supabase
      .from('profiles').select('role, store_id').eq('id', user.id).maybeSingle();

    const { store_id, upc, name, cnt, case_pack } = await req.json();
    const cleanUpc = String(upc || '').trim();
    if (!store_id || !cleanUpc) return NextResponse.json({ error: 'store_id and upc required' }, { status: 400 });
    const count = Math.round(Number(cnt));
    if (!Number.isInteger(count) || count < 0) return NextResponse.json({ error: 'Enter a valid quantity' }, { status: 400 });

    const isOwner = profile?.role === 'owner';
    if (!isOwner && profile?.store_id !== store_id) {
      return NextResponse.json({ error: 'No access to this store' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: store } = await admin.from('stores').select('id, name, nrs_store_id').eq('id', store_id).single();
    if (!store?.nrs_store_id) return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });

    const result = await setInventoryCount(store.nrs_store_id, { upc: cleanUpc, name: name || '', cnt: count });

    // Optional: remember the case pack for Auto Reorder (graceful if unmigrated).
    let savedPack = null;
    const pack = Math.round(Number(case_pack));
    if (Number.isInteger(pack) && pack > 1) {
      try {
        await admin.from('reorder_settings')
          .upsert({ upc: cleanUpc, case_pack: pack, updated_at: new Date().toISOString() }, { onConflict: 'upc' });
        savedPack = pack;
      } catch (e) {
        console.warn('[inventory/count] case pack save skipped:', e.message);
      }
    }

    return NextResponse.json({ ok: true, ...result, case_pack: savedPack });
  } catch (e) {
    console.error('[inventory/count]', e);
    return NextResponse.json({ error: e.message || 'Count save failed' }, { status: 500 });
  }
}
