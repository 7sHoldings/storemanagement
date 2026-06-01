import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { listDepartments } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/pricebook/departments?store_id=<uuid>
// Returns the NRS departments for a store (used to populate the Add Item
// department dropdown). Owner-only.
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

    const admin = createAdminClient();
    // If no store given, use any store that has an NRS ID (departments match
    // across stores per the owner's setup).
    let query = admin.from('stores').select('id, name, nrs_store_id').not('nrs_store_id', 'is', null);
    if (storeId) query = query.eq('id', storeId);
    const { data: stores } = await query.order('created_at').limit(1);
    const store = stores?.[0];
    if (!store?.nrs_store_id) {
      return NextResponse.json({ error: 'No store with an NRS ID configured' }, { status: 400 });
    }

    const departments = await listDepartments(store.nrs_store_id);
    return NextResponse.json({ departments });
  } catch (e) {
    console.error('[pricebook/departments]', e);
    return NextResponse.json({ error: e.message || 'Failed to load departments' }, { status: 500 });
  }
}
