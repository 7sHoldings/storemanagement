import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({ listDepartments: vi.fn(), createPricebookItem: vi.fn() }));

import { GET as deptGET } from '@/app/api/pricebook/departments/route';
import { POST as createPOST } from '@/app/api/pricebook/create/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { listDepartments, createPricebookItem } from '@/lib/nrs-pricebook';

const STORES = [
  { id: 'kerens', name: 'Kerens', nrs_store_id: 1 },
  { id: 'reno', name: 'Reno', nrs_store_id: 2 },
  { id: 'troup', name: 'Troup', nrs_store_id: 3 },
];
const DEPTS = {
  1: [{ dept: 'THC', label: 'THC' }, { dept: 'VAPE', label: 'Vape' }],
  2: [{ dept: 'thc', label: 'Thc' }, { dept: 'VAPE', label: 'Vape' }],
  3: [{ dept: 'VAPE', label: 'Vape' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  const profiles = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', name: 'Owner' } }) }) }) };
  const storesQuery = (rows) => ({
    select: () => storesQuery(rows),
    in: (_c, ids) => storesQuery(rows.filter(s => ids.includes(s.id))),
    order: async () => ({ data: rows }),
    then: (res) => res({ data: rows }),
  });
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => profiles,
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t) => (t === 'profiles' ? profiles : storesQuery(STORES)),
  });
  vi.mocked(listDepartments).mockImplementation(async (id) => {
    if (DEPTS[id]) return DEPTS[id];
    throw new Error('NRS down');
  });
  vi.mocked(createPricebookItem).mockImplementation(async (_id, item) => ({ upc: item.upc, name: item.name, cents: item.cents }));
});

describe('GET /api/pricebook/departments', () => {
  it('merges every store and marks the gaps', async () => {
    const body = await (await deptGET()).json();
    const thc = body.departments.find(d => d.key === 'thc');
    expect(thc.codes).toEqual({ kerens: 'THC', reno: 'thc' });
    expect(thc.missing).toEqual(['Troup']);
    expect(body.failedStores).toEqual([]);
  });

  it('reports a store that fails to load instead of marking it missing', async () => {
    vi.mocked(listDepartments).mockImplementation(async (id) => {
      if (id === 3) throw new Error('NRS down');
      return DEPTS[id];
    });
    const body = await (await deptGET()).json();
    expect(body.failedStores.map(f => f.store)).toEqual(['Troup']);
    expect(body.departments.find(d => d.key === 'thc').missing).toEqual([]);
  });
});

describe('POST /api/pricebook/create', () => {
  const req = (body) => ({ json: async () => body });
  const item = { upc: '123', name: 'Delta 8 Gummies', dept: 'THC', deptLabel: 'THC' };
  const targets = STORES.map(s => ({ store_id: s.id, cents: 1999 }));

  it('sends each store its own department code', async () => {
    await createPOST(req({ item, targets: targets.slice(0, 2) }));
    const sent = vi.mocked(createPricebookItem).mock.calls.map(([id, it]) => [id, it.dept]);
    expect(sent).toEqual([[1, 'THC'], [2, 'thc']]);
  });

  it('skips a store without the department with a clear error, and creates the rest', async () => {
    const body = await (await createPOST(req({ item, targets }))).json();
    expect(body.created).toBe(2);
    const troup = body.results.find(r => r.store_id === 'troup');
    expect(troup.ok).toBe(false);
    expect(troup.error).toMatch(/isn’t set up in this store/);
    expect(vi.mocked(createPricebookItem)).toHaveBeenCalledTimes(2);
  });

  it('falls back to the sent code when a store’s departments cannot be loaded', async () => {
    vi.mocked(listDepartments).mockImplementation(async (id) => {
      if (id === 3) throw new Error('NRS down');
      return DEPTS[id];
    });
    await createPOST(req({ item, targets: [{ store_id: 'troup', cents: 1999 }] }));
    expect(vi.mocked(createPricebookItem).mock.calls[0][1].dept).toBe('THC');
  });
});
