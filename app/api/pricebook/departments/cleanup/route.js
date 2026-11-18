import { NextResponse } from 'next/server';
import { getDepartmentRecords, createDepartment, listPricebookItems, moveItemToDepartment } from '@/lib/nrs-pricebook';
import { requireOwner, mapWithConcurrency } from '@/lib/pricebook-stores';
import { planCreates, TARGET_DEPARTMENTS, taxOf } from '@/lib/dept-migration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// One request moves at most this many items, so each call stays well inside
// the time limit; the screen calls again until a store is done.
const MAX_MOVES = 30;
const MOVE_CONCURRENCY = 3;
const PAGE_MAX = 1000;

// POST /api/pricebook/departments/cleanup        (owner only)
//
//   { action: 'items',  store_id, start }           → one page of the store's products {upc, name, dept}
//   { action: 'create', store_id, apply? }          → the new departments this store lacks, and (with apply)
//                                                     creates them, copying tax/age settings from the
//                                                     department that feeds each one
//   { action: 'move',   store_id, moves: [{upc,to}] } → moves up to 30 products, each reported on its own
//
// Hiding every other department on the register is the existing
// /api/pricebook/departments/visibility call with the new list.
export async function POST(req) {
  try {
    const gate = await requireOwner();
    if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = await req.json();
    const { action, store_id: storeId } = body || {};
    if (!storeId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

    const { data: stores } = await gate.admin.from('stores').select('id, name, nrs_store_id, nrs_elmer_id');
    const store = (stores || []).find(s => s.id === storeId);
    if (!store?.nrs_store_id) return NextResponse.json({ error: 'Store has no NRS ID configured' }, { status: 400 });

    if (action === 'items') {
      const start = Math.max(0, Number(body.start) || 0);
      const { items, recordsFiltered } = await listPricebookItems(store.nrs_store_id, { start, length: PAGE_MAX });
      return NextResponse.json({
        items: items.map(i => ({ upc: i.upc, name: i.name || i.desc || '', dept: i.dept || '' })),
        total: Number(recordsFiltered) || 0,
        // NRS may return fewer than asked per page, so page by what came back.
        next: items.length && start + items.length < (Number(recordsFiltered) || 0) ? start + items.length : null,
      });
    }

    if (action === 'create') {
      const others = (stores || []).filter(s => s.nrs_store_id && s.id !== storeId);
      const [own, ...rest] = await mapWithConcurrency([store, ...others], 2, s => getDepartmentRecords(s.nrs_store_id));
      if (own.status !== 'fulfilled') throw new Error(`Could not read ${store.name}’s departments`);
      const otherRecords = others.map((s, i) => ({ store_id: s.id, records: rest[i].status === 'fulfilled' ? rest[i].value : {} }));
      const plan = planCreates(own.value, otherRecords, storeId);
      // A department nothing feeds (e.g. a brand-new name) copies the store's
      // standard taxable department so it is taxed like most products.
      const fallback = Object.values(own.value).find(r => /^taxable$/i.test(String(r.label || r.dept)))
        || Object.values(own.value).find(r => taxOf(r) > 0) || null;
      const recordsOf = (sid) => (sid === storeId ? own.value : otherRecords.find(o => o.store_id === sid)?.records || {});

      const rows = plan.map(p => {
        const template = p.template ? recordsOf(p.template.store_id)[p.template.dept] : fallback;
        const from = p.template
          ? `${p.template.label}${p.template.store_id === storeId ? '' : ` (${stores.find(s => s.id === p.template.store_id)?.name || 'other store'})`}`
          : fallback ? `${fallback.label || fallback.dept} (standard tax)` : null;
        return { name: p.name, copyFrom: from, tax: template ? taxOf(template) : null, template };
      });
      if (!body.apply) return NextResponse.json({ store: store.name, missing: rows.map(({ template, ...r }) => r) });

      const results = [];
      for (const r of rows) {
        if (!r.template) { results.push({ name: r.name, ok: false, error: 'No department to copy settings from' }); continue; }
        try {
          await createDepartment(store.nrs_store_id, store.nrs_elmer_id, r.name, r.template);
          results.push({ name: r.name, ok: true, copyFrom: r.copyFrom });
        } catch (e) {
          results.push({ name: r.name, ok: false, error: e.message || 'Create failed' });
        }
      }
      return NextResponse.json({ store: store.name, created: results.filter(r => r.ok).length, results });
    }

    if (action === 'move') {
      const moves = Array.isArray(body.moves) ? body.moves : [];
      if (!moves.length) return NextResponse.json({ error: 'moves required' }, { status: 400 });
      if (moves.length > MAX_MOVES) return NextResponse.json({ error: `At most ${MAX_MOVES} moves per request` }, { status: 400 });
      const bad = moves.find(m => !m?.upc || !TARGET_DEPARTMENTS.includes(m?.to));
      if (bad) return NextResponse.json({ error: `Moves must go to one of the new departments (got “${bad?.to}”)` }, { status: 400 });

      const settled = await mapWithConcurrency(moves, MOVE_CONCURRENCY, m => moveItemToDepartment(store.nrs_store_id, String(m.upc), m.to));
      const results = moves.map((m, i) => (settled[i].status === 'fulfilled'
        ? { upc: m.upc, ok: true, ...settled[i].value }
        : { upc: m.upc, to: m.to, ok: false, error: settled[i].reason?.message || 'Move failed' }));
      return NextResponse.json({
        moved: results.filter(r => r.ok && !r.unchanged).length,
        failed: results.filter(r => !r.ok).length,
        results,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('[departments/cleanup]', e);
    return NextResponse.json({ error: e.message || 'Department clean-up failed' }, { status: 500 });
  }
}
