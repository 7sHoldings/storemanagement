import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({
  getDepartmentRecords: vi.fn(), createDepartment: vi.fn(), listPricebookItems: vi.fn(), moveItemToDepartment: vi.fn(),
}));

import { POST } from '@/app/api/pricebook/departments/cleanup/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getDepartmentRecords, createDepartment, listPricebookItems, moveItemToDepartment } from '@/lib/nrs-pricebook';

const DEN = { id: 'den', name: 'Denison', nrs_store_id: 61345, nrs_elmer_id: 60903 };
const RENO = { id: 'reno', name: 'Reno', nrs_store_id: 63560, nrs_elmer_id: 1 };
const tax = [{ rate_decibps: 8250 }];

beforeEach(() => {
  vi.clearAllMocks();
  const profiles = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner' } }) }) }) };
  vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t) => (t === 'profiles' ? profiles : { select: async () => ({ data: [DEN, RENO] }) }),
  });
});

const req = (body) => ({ json: async () => body });

describe('POST /api/pricebook/departments/cleanup', () => {
  it('pages through a store’s products', async () => {
    vi.mocked(listPricebookItems).mockResolvedValue({ items: [{ upc: '1', name: 'A', dept: 'Vape' }], recordsFiltered: 3 });
    const body = await (await POST(req({ action: 'items', store_id: 'den', start: 0 }))).json();
    expect(body.items).toEqual([{ upc: '1', name: 'A', dept: 'Vape' }]);
    expect(body.next).toBe(1);
  });

  it('plans the missing departments and copies tax from the department that feeds each', async () => {
    vi.mocked(getDepartmentRecords).mockImplementation(async (id) => (id === 61345
      ? { Vape: { dept: 'Vape', label: 'Vape', item_count: 400, auth_totals: tax }, Taxable: { dept: 'Taxable', label: 'Taxable', auth_totals: tax } }
      : {}));
    const body = await (await POST(req({ action: 'create', store_id: 'den' }))).json();
    const vapes = body.missing.find(m => m.name === 'Vapes');
    expect(vapes.copyFrom).toBe('Vape');
    expect(body.missing.find(m => m.name === 'Syringes').copyFrom).toMatch(/standard tax/);
    expect(createDepartment).not.toHaveBeenCalled();
  });

  it('creates them when applied', async () => {
    vi.mocked(getDepartmentRecords).mockResolvedValue({ Vape: { dept: 'Vape', label: 'Vape', item_count: 4, auth_totals: tax } });
    vi.mocked(createDepartment).mockResolvedValue({});
    const body = await (await POST(req({ action: 'create', store_id: 'den', apply: true }))).json();
    expect(createDepartment).toHaveBeenCalledWith(61345, 60903, 'Vapes', expect.objectContaining({ dept: 'Vape' }));
    expect(body.created).toBeGreaterThan(0);
  });

  it('only moves into the new departments, and reports each product', async () => {
    let r = await POST(req({ action: 'move', store_id: 'den', moves: [{ upc: '1', to: 'Flower' }] }));
    expect(r.status).toBe(400);
    vi.mocked(moveItemToDepartment)
      .mockResolvedValueOnce({ upc: '1', from: 'Vape', to: 'Vapes' })
      .mockRejectedValueOnce(new Error('NRS rejected'));
    const body = await (await POST(req({ action: 'move', store_id: 'den', moves: [{ upc: '1', to: 'Vapes' }, { upc: '2', to: 'Vapes' }] }))).json();
    expect(body.moved).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results[1].error).toMatch(/rejected/);
  });
});
