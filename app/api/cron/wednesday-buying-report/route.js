import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { sendTelegram, buildBuyingPacingMessage } from '@/lib/telegram';
import { computeBuyingPacing } from '@/lib/buying-pacing';

// Weekly "buying vs sales" pacing report — meant to run every Wednesday so
// the owner can see month-to-date buying as a % of sales (target ≤ each
// store's buying_target_pct) before the weekend buying trip. Triggered by
// Vercel Cron (see vercel.json) or any external scheduler (cron-job.org)
// with the `Authorization: Bearer ${CRON_SECRET}` header.

export const dynamic = 'force-dynamic';

function centralToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function run(supabase) {
  const today = centralToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, color, buying_target_pct, is_active')
    .order('created_at');
  const activeStores = (stores || []).filter(s => s.is_active !== false);

  const [{ data: salesRows }, { data: purchaseRows }] = await Promise.all([
    supabase.from('daily_sales').select('store_id, total_sales, net_sales').gte('date', monthStart).lte('date', today),
    supabase.from('purchases').select('store_id, total_cost, unit_cost').gte('week_of', monthStart).lte('week_of', today),
  ]);

  const pacing = computeBuyingPacing({ stores: activeStores, salesRows, purchaseRows, today });
  const result = await sendTelegram(buildBuyingPacingMessage(pacing));
  return { success: result.sent, asOf: today, overall: pacing.overall, stores: pacing.perStore.length, telegram: result };
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    return NextResponse.json(await run(supabase));
  } catch (e) {
    console.error('[wednesday-buying-report]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
