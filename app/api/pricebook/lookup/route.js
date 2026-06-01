import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getPricebookItemDetail } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/pricebook/lookup?upc=XXXX
// Looks a UPC up across all the owner's stores' NRS pricebooks and returns
// the first match's details, so the Add-item form can auto-fill name / size
// / department / cost when scanning a product that already exists somewhere.
// Owner-only.
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
    const upc = (searchParams.get('upc') || '').trim();
    if (!upc) return NextResponse.json({ error: 'upc required' }, { status: 400 });

    const admin = createAdminClient();
    const { data: stores } = await admin
      .from('stores').select('id, name, nrs_store_id')
      .not('nrs_store_id', 'is', null)
      .order('created_at');
    if (!stores?.length) return NextResponse.json({ found: false });

    // Query every store in parallel; take the first that has the item.
    const results = await Promise.allSettled(
      stores.map(async (s) => {
        const { pricebook: pb } = await getPricebookItemDetail(s.nrs_store_id, upc);
        return { store: s.name, pb };
      })
    );
    const hit = results.find(r => r.status === 'fulfilled' && r.value?.pb);
    if (!hit) return NextResponse.json({ found: false });

    const pb = hit.value.pb;
    return NextResponse.json({
      found: true,
      foundInStore: hit.value.store,
      name: pb.name || '',
      size: pb.size || '',
      dept: pb.dept?.dept || pb.dept || '',
      costCents: pb.pricing?.cost_cents ?? 0,
      cents: pb.pricing?.cents ?? null,
    });
  } catch (e) {
    console.error('[pricebook/lookup]', e);
    return NextResponse.json({ error: e.message || 'Lookup failed' }, { status: 500 });
  }
}
