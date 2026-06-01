import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getPricebookItemDetail } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Go-UPC lookup (paid, better coverage for vape/tobacco). Skipped when no
// GOUPC_API_KEY is configured. Best-effort with a short timeout.
async function lookupGoUpc(upc) {
  const key = process.env.GOUPC_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://go-upc.com/api/v1/code/${encodeURIComponent(upc)}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const name = (json?.product?.name || '').trim();
    return name ? { name, source: 'go-upc' } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Free, no-key UPC database (UPCItemDB trial — rate-limited per day).
async function lookupUpcItemDb(upc) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const name = (json?.items?.[0]?.title || '').trim();
    return name ? { name, source: 'catalog' } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// External name lookup: try Go-UPC first (best coverage), then the free DB.
async function lookupExternalUpc(upc) {
  return (await lookupGoUpc(upc)) || (await lookupUpcItemDb(upc));
}

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
    if (hit) {
      const pb = hit.value.pb;
      return NextResponse.json({
        found: true,
        source: 'store',
        foundInStore: hit.value.store,
        name: pb.name || '',
        size: pb.size || '',
        dept: pb.dept?.dept || pb.dept || '',
        costCents: pb.pricing?.cost_cents ?? 0,
        cents: pb.pricing?.cents ?? null,
      });
    }

    // Not in any store — fall back to a global product database so even a
    // brand-new item gets its name filled.
    const ext = await lookupExternalUpc(upc);
    if (ext?.name) {
      return NextResponse.json({ found: true, source: ext.source || 'catalog', foundInStore: 'product database', name: ext.name, size: '', dept: '', costCents: 0, cents: null });
    }

    return NextResponse.json({ found: false });
  } catch (e) {
    console.error('[pricebook/lookup]', e);
    return NextResponse.json({ error: e.message || 'Lookup failed' }, { status: 500 });
  }
}
