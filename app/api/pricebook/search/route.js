import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { listPricebookItems } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/pricebook/search?store_id=<uuid>&q=foger&start=0&length=25
// Searches the live NRS pricebook for a store. Owner-only.
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
    const storeId = searchParams.get('store_id');
    const q = (searchParams.get('q') || '').trim();
    const start = Math.max(parseInt(searchParams.get('start') || '0', 10), 0);
    const length = Math.min(Math.max(parseInt(searchParams.get('length') || '25', 10), 1), 100);
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

    const admin = createAdminClient();
    const { data: store } = await admin
      .from('stores').select('id, name, nrs_store_id').eq('id', storeId).single();
    if (!store?.nrs_store_id) {
      return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });
    }

    const { items, recordsFiltered } = await listPricebookItems(store.nrs_store_id, { search: q, start, length });
    return NextResponse.json({ items, recordsFiltered, store: { id: store.id, name: store.name } });
  } catch (e) {
    console.error('[pricebook/search]', e);
    return NextResponse.json({ error: e.message || 'Search failed' }, { status: 500 });
  }
}
