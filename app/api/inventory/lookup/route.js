import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getPricebookItemDetail } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/inventory/lookup?store_id=<uuid>&upc=XXXX
// Returns the item's name + current price for the Stock Count screen so the
// scanner can confirm what was scanned. Owner (any store) or the store's
// assigned employee.
export async function GET(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: profile } = await supabase
      .from('profiles').select('role, store_id').eq('id', user.id).maybeSingle();

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const upc = (searchParams.get('upc') || '').trim();
    if (!storeId || !upc) return NextResponse.json({ error: 'store_id and upc required' }, { status: 400 });

    const isOwner = profile?.role === 'owner';
    if (!isOwner && profile?.store_id !== storeId) {
      return NextResponse.json({ error: 'No access to this store' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: store } = await admin.from('stores').select('id, name, nrs_store_id').eq('id', storeId).single();
    if (!store?.nrs_store_id) return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });

    try {
      const { pricebook: pb } = await getPricebookItemDetail(store.nrs_store_id, upc);
      return NextResponse.json({
        found: true,
        upc,
        name: pb.name || '',
        size: pb.size || '',
        dept: pb.dept?.dept || pb.dept || '',
      });
    } catch {
      return NextResponse.json({ found: false, upc });
    }
  } catch (e) {
    console.error('[inventory/lookup]', e);
    return NextResponse.json({ error: e.message || 'Lookup failed' }, { status: 500 });
  }
}
