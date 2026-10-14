import { NextResponse } from 'next/server';
import { getDepartmentRecords, setDepartmentShown, createDepartment } from '@/lib/nrs-pricebook';
import { requireOwner, mapWithConcurrency, STORE_CONCURRENCY } from '@/lib/pricebook-stores';
import { planRegister, isShown, findTemplate } from '@/lib/register-departments';

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
// A named department the store doesn't have is created first, copied (tax,
// age check, display) from another store that has it — the exact spelling
// preferred — so every register ends up with the same buttons. The plan
// lists these under `toCreate`, with the store each is copied from.
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

    let records = await getDepartmentRecords(store.nrs_store_id);
    let plan = planRegister(records, show);

    // Where each missing department would be copied from.
    let toCreate = [];
    if (plan.missing.length) {
      const { data: others } = await gate.admin
        .from('stores').select('id, name, nrs_store_id').neq('id', store.id).not('nrs_store_id', 'is', null).order('created_at');
      const lists = await mapWithConcurrency(others || [], STORE_CONCURRENCY, o => getDepartmentRecords(o.nrs_store_id));
      const otherRecords = (others || []).map((o, i) => ({
        store_id: o.id, store: o.name, records: lists[i].status === 'fulfilled' ? lists[i].value : null,
      }));
      toCreate = plan.missing.map(name => {
        const t = findTemplate(otherRecords, name);
        return t
          ? { name, from_store: t.store, from_dept: t.record.dept, template: t.record }
          : { name, from_store: null, error: 'No store has this department to copy' };
      });
    }
    const describe = () => ({
      store_id: store.id, store: store.name, ...plan,
      toCreate: toCreate.map(({ template, ...rest }) => rest),
    });
    if (!apply) return NextResponse.json(describe());

    // Create the missing ones, then plan again against the store as it now is.
    const created = [];
    for (const c of toCreate) {
      if (!c.template) { created.push({ name: c.name, ok: false, error: c.error }); continue; }
      try {
        await createDepartment(store.nrs_store_id, store.nrs_elmer_id, c.name, c.template);
        created.push({ name: c.name, ok: true, from_store: c.from_store });
      } catch (e) {
        console.error(`[departments/visibility] ${store.name} create “${c.name}” failed:`, e.message);
        created.push({ name: c.name, ok: false, error: e.message });
      }
    }
    if (created.some(c => c.ok)) {
      records = await getDepartmentRecords(store.nrs_store_id);
      plan = planRegister(records, show);
    }
    const base = { ...describe(), created };

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
      failed: results.filter(r => !r.ok).length + created.filter(c => !c.ok).length,
      warnings: results.filter(r => r.warning).length,
      results,
    });
  } catch (e) {
    console.error('[departments/visibility]', e);
    return NextResponse.json({ error: e.message || 'Failed to update register departments' }, { status: 500 });
  }
}
