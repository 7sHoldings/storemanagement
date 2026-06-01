import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { updatePricebookItemPrice } from '@/lib/nrs-pricebook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/pricebook/update
// Body: { store_id, updates: [{ upc, cents }] }
// Applies price changes to the live NRS pricebook. Owner-only.
// Each item is processed independently so one failure doesn't block the rest;
// a per-item result list is returned.
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

    const { store_id, updates } = await req.json();
    if (!store_id) return NextResponse.json({ error: 'store_id required' }, { status: 400 });
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates array required' }, { status: 400 });
    }
    if (updates.length > 200) {
      return NextResponse.json({ error: 'Too many updates in one request (max 200)' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: store } = await admin
      .from('stores').select('id, name, nrs_store_id').eq('id', store_id).single();
    if (!store?.nrs_store_id) {
      return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });
    }

    // Normalize + validate before touching NRS.
    const clean = [];
    for (const u of updates) {
      const upc = String(u?.upc || '').trim();
      const cents = Number(u?.cents);
      if (!upc) return NextResponse.json({ error: 'Each update needs a upc' }, { status: 400 });
      if (!Number.isInteger(cents) || cents < 0) {
        return NextResponse.json({ error: `Invalid price for ${upc}` }, { status: 400 });
      }
      clean.push({ upc, cents });
    }

    const userLabel = profile.name ? `${profile.name} (StoreWise)` : '7S StoreWise';
    const results = [];
    // Sequential to be gentle on the NRS API and keep audit order deterministic.
    for (const { upc, cents } of clean) {
      try {
        const r = await updatePricebookItemPrice(store.nrs_store_id, upc, cents, { user: userLabel });
        results.push({ upc, ok: true, ...r });
      } catch (e) {
        console.error(`[pricebook/update] ${upc} failed:`, e.message);
        results.push({ upc, ok: false, error: e.message || 'Update failed' });
      }
    }

    const updated = results.filter(r => r.ok && !r.unchanged).length;
    const failed = results.filter(r => !r.ok).length;
    return NextResponse.json({ store: { id: store.id, name: store.name }, updated, failed, results });
  } catch (e) {
    console.error('[pricebook/update]', e);
    return NextResponse.json({ error: e.message || 'Update failed' }, { status: 500 });
  }
}
