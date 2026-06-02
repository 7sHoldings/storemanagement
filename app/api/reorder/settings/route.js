import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/reorder/settings  { upc, case_pack }
// Upserts the case/box pack size for a product. Owner-only.
export async function POST(req) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'owner') {
      return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
    }

    const { upc, case_pack } = await req.json();
    const cleanUpc = String(upc || '').trim();
    const pack = Math.round(Number(case_pack));
    if (!cleanUpc) return NextResponse.json({ error: 'upc required' }, { status: 400 });
    if (!Number.isInteger(pack) || pack < 1) return NextResponse.json({ error: 'case_pack must be ≥ 1' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('reorder_settings')
      .upsert({ upc: cleanUpc, case_pack: pack, updated_at: new Date().toISOString() }, { onConflict: 'upc' });
    if (error) throw error;

    return NextResponse.json({ ok: true, upc: cleanUpc, case_pack: pack });
  } catch (e) {
    console.error('[api/reorder/settings]', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status: 500 });
  }
}
