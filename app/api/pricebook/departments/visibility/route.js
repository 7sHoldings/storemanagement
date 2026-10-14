import { NextResponse } from 'next/server';
import { getDepartmentRecords, setDepartmentShown } from '@/lib/nrs-pricebook';
import { requireOwner } from '@/lib/pricebook-stores';
import { planRegister, isShown } from '@/lib/register-departments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/pricebook/departments/visibility
// Body: { store_id, show: [department names], apply?: boolean }
//
// Sets which department buttons one store's register shows: the named
// departments are shown, every other department is hidden (NRS "Do not
// show"). Without `apply` it only returns the plan. Owner-only.
//
// Only departments whose flag actually changes are saved. Each save sends
// the department's other settings back as read, and the department is
// read again afterwards to confirm the flag took and its tax did not move;
// anything that doesn't check out is reported against that department.
export async function POST(req) {
  try {
    const gate = await requireOwner();
    if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { store_id: storeId, show, apply } = await req.json();
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });
    if (!Array.isArray(show) || show.filter(s => String(s || '').trim()).length === 0) {
      return NextResponse.json({ error: 'Name at least one department to show' }, { status: 400 });
    }
    if (show.length > 60) return NextResponse.json({ error: 'Too many departments (max 60)' }, { status: 400 });

    const { data: store } = await gate.admin
      .from('stores').select('id, name, nrs_store_id, nrs_elmer_id').eq('id', storeId).maybeSingle();
    if (!store?.nrs_store_id) return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });

    const records = await getDepartmentRecords(store.nrs_store_id);
    const plan = planRegister(records, show);
    const base = { store_id: store.id, store: store.name, ...plan };
    if (!apply) return NextResponse.json(base);

    // A store with none of the chosen departments would end up with an empty
    // screen — never apply that.
    if (!plan.rows.some(r => r.shownAfter)) {
      return NextResponse.json({ error: `None of those departments exist in ${store.name}; nothing changed` }, { status: 400 });
    }

    const taxOf = (r) => (Array.isArray(r?.auth_totals) ? r.auth_totals : []).reduce((s, a) => s + (Number(a?.rate_decibps) || 0), 0);
    const results = [];
    for (const change of plan.changes) {
      const record = records[change.dept];
      try {
        await setDepartmentShown(store.nrs_store_id, store.nrs_elmer_id, record, change.shownAfter);
        results.push({ dept: change.dept, label: change.label, shown: change.shownAfter, ok: true });
      } catch (e) {
        console.error(`[departments/visibility] ${store.name} “${change.label}” failed:`, e.message);
        results.push({ dept: change.dept, label: change.label, shown: change.shownAfter, ok: false, error: e.message });
      }
    }

    // Read back and confirm: the flag is what was asked, and tax is unchanged.
    let after = null;
    try { after = await getDepartmentRecords(store.nrs_store_id); } catch { /* reported below */ }
    results.forEach(r => {
      if (!r.ok) return;
      const now = after?.[r.dept];
      if (!now) { r.warning = 'Could not re-read this department to confirm'; return; }
      if (isShown(now) !== r.shown) r.warning = `NRS still has it ${isShown(now) ? 'shown' : 'hidden'}`;
      else if (taxOf(now) !== taxOf(records[r.dept])) r.warning = `Tax changed from ${taxOf(records[r.dept]) / 1000}% to ${taxOf(now) / 1000}%`;
    });

    return NextResponse.json({
      ...base,
      applied: true,
      changed: results.filter(r => r.ok && !r.warning).length,
      failed: results.filter(r => !r.ok).length,
      warnings: results.filter(r => r.warning).length,
      results,
    });
  } catch (e) {
    console.error('[departments/visibility]', e);
    return NextResponse.json({ error: e.message || 'Failed to update register departments' }, { status: 500 });
  }
}
