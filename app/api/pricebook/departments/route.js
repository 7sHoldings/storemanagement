import { NextResponse } from 'next/server';
import { listDepartments } from '@/lib/nrs-pricebook';
import { requireOwner, loadNrsStores, mapWithConcurrency, STORE_CONCURRENCY } from '@/lib/pricebook-stores';
import { mergeDepartments } from '@/lib/pricebook-departments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/pricebook/departments
// Every store's NRS departments, merged by name. Each department carries the
// code it has in each store and the stores that lack it, so the Add-item form
// can send every store its own code and warn before a store would reject the
// item. A store whose list fails to load is listed in `failedStores` and is
// never reported as missing a department. Owner-only.
export async function GET() {
  try {
    const gate = await requireOwner();
    if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const stores = await loadNrsStores(gate.admin);
    if (!stores.length) {
      return NextResponse.json({ error: 'No store with an NRS ID configured' }, { status: 400 });
    }

    const settled = await mapWithConcurrency(stores, STORE_CONCURRENCY, s => listDepartments(s.nrs_store_id));
    const perStore = stores.map((s, i) => ({
      store_id: s.id,
      store: s.name,
      departments: settled[i].status === 'fulfilled' ? settled[i].value : null,
    }));
    const failedStores = stores
      .map((s, i) => ({ store_id: s.id, store: s.name, result: settled[i] }))
      .filter(x => x.result.status === 'rejected')
      .map(x => ({ store_id: x.store_id, store: x.store, error: x.result.reason?.message || 'Failed to load' }));
    if (failedStores.length === stores.length) {
      throw new Error(`Could not load departments: ${failedStores[0].error}`);
    }

    return NextResponse.json({
      departments: mergeDepartments(perStore),
      stores: stores.map(s => ({ id: s.id, name: s.name })),
      failedStores,
    });
  } catch (e) {
    console.error('[pricebook/departments]', e);
    return NextResponse.json({ error: e.message || 'Failed to load departments' }, { status: 500 });
  }
}
