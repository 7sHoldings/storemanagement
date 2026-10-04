import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({ getPricebookItemDetail: vi.fn() }));

import { GET } from '@/app/api/pricebook/lookup/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getPricebookItemDetail } from '@/lib/nrs-pricebook';

const STORES = [
  { id: 'bells', name: 'Bells', nrs_store_id: 1 },
  { id: 'reno', name: 'Reno', nrs_store_id: 2 },
  { id: 'troup', name: 'Troup', nrs_store_id: 3 },
  { id: 'kerens', name: 'Kerens', nrs_store_id: 4 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) }) }),
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({ select: () => ({ not: () => ({ order: async () => ({ data: STORES }) }) }) }),
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
});

const req = (upc) => ({ url: `https://app.test/api/pricebook/lookup?upc=${upc}` });
const pb = (cents) => ({ pricebook: { name: 'Coke 20oz', size: '', dept: { dept: '7' }, pricing: { cents, cost_cents: 120 } } });
const notFound = (upc) => new Error(`Item ${upc} not found in pricebook`);

describe('GET /api/pricebook/lookup', () => {
  it('reports each store and suggests the most common price for the rest', async () => {
    const byStore = { 1: pb(249), 2: pb(229), 3: pb(249) };
    vi.mocked(getPricebookItemDetail).mockImplementation(async (id, upc) => {
      if (byStore[id]) return byStore[id];
      throw notFound(upc);
    });
    const body = await (await GET(req('049000000443'))).json();
    expect(body.found).toBe(true);
    expect(body.suggestedCents).toBe(249);
    expect(body.stores).toEqual([
      { store_id: 'bells', store: 'Bells', status: 'has', cents: 249 },
      { store_id: 'reno', store: 'Reno', status: 'has', cents: 229 },
      { store_id: 'troup', store: 'Troup', status: 'has', cents: 249 },
      { store_id: 'kerens', store: 'Kerens', status: 'missing', cents: null },
    ]);
  });

  it('marks a store whose lookup failed as unknown, not missing', async () => {
    vi.mocked(getPricebookItemDetail).mockImplementation(async (id, upc) => {
      if (id === 1) return pb(199);
      if (id === 2) throw new Error('NRS 502');
      throw notFound(upc);
    });
    const body = await (await GET(req('1'))).json();
    expect(body.stores.find(s => s.store_id === 'reno').status).toBe('unknown');
    expect(body.stores.find(s => s.store_id === 'troup').status).toBe('missing');
  });

  it('has no suggested price for an item no store carries', async () => {
    vi.mocked(getPricebookItemDetail).mockImplementation(async (_id, upc) => { throw notFound(upc); });
    const body = await (await GET(req('999'))).json();
    expect(body.found).toBe(false);
    expect(body.suggestedCents).toBeNull();
    expect(body.stores.every(s => s.status === 'missing')).toBe(true);
  });
});
