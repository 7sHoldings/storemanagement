import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({ getDepartmentRecords: vi.fn(), createDepartment: vi.fn() }));

import { POST } from '@/app/api/pricebook/departments/sync/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getDepartmentRecords, createDepartment } from '@/lib/nrs-pricebook';

const STORES = [
  { id: 'bells', name: 'Bells', nrs_store_id: 58968, nrs_elmer_id: 58511 },
  { id: 'reno', name: 'Reno', nrs_store_id: 63560, nrs_elmer_id: 63128 },
];
const ALCOHOL = { dept: 'Alcohol', label: 'Alcohol', auths: [], auth_totals: [] };
const BUTANE = { dept: 'Butane', label: 'Butane', auths: [{ type: 'Tax', name: 'Tax', rate_decibps: '8250' }], auth_totals: [{ rate_decibps: 8250 }] };
let RECORDS;

beforeEach(() => {
  vi.clearAllMocks();
  RECORDS = {
    58968: { Alcohol: ALCOHOL, Butane: BUTANE },
    63560: { 'butane ': { dept: 'butane ', label: 'butane ' } },
  };
  const profiles = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', name: 'Owner' } }) }) }) };
  vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t) => (t === 'profiles' ? profiles : { select: () => ({ in: async (_c, ids) => ({ data: STORES.filter(s => ids.includes(s.id)) }) }) }),
  });
  vi.mocked(getDepartmentRecords).mockImplementation(async (id) => RECORDS[id]);
  vi.mocked(createDepartment).mockImplementation(async (_s, _e, name, rec) => ({ dept: name, auth_totals: rec.auth_totals }));
});

const req = (creates) => ({ json: async () => ({ creates }) });
const add = (name, store_id = 'reno') => ({ store_id, name, source_store_id: 'bells', source_dept: name });

describe('POST /api/pricebook/departments/sync', () => {
  it('copies a missing department from the source store into the target', async () => {
    const body = await (await POST(req([add('Alcohol')]))).json();
    expect(body.created).toBe(1);
    expect(vi.mocked(createDepartment)).toHaveBeenCalledWith(63560, 63128, 'Alcohol', ALCOHOL);
  });

  it('skips a department the store already has under a loose match, never duplicating it', async () => {
    const body = await (await POST(req([add('Butane')]))).json();
    expect(body.skipped).toBe(1);
    expect(vi.mocked(createDepartment)).not.toHaveBeenCalled();
  });

  it('reports one rejection without stopping the rest', async () => {
    vi.mocked(createDepartment).mockImplementationOnce(async () => { throw new Error('NRS rejected'); });
    RECORDS[63560] = {};
    const body = await (await POST(req([add('Alcohol'), add('Butane')]))).json();
    expect(body.failed).toBe(1);
    expect(body.created).toBe(1);
  });

  it('flags a department whose tax was not stored as copied', async () => {
    RECORDS[63560] = {};
    vi.mocked(createDepartment).mockResolvedValueOnce({ dept: 'Butane', auth_totals: [] });
    const body = await (await POST(req([add('Butane')]))).json();
    expect(body.warnings).toBe(1);
    expect(body.results[0].warning).toMatch(/expected 8.25%/);
  });

  it('rejects the same department twice for one store before touching NRS', async () => {
    const res = await POST(req([add('Alcohol'), add('alcohol')]));
    expect(res.status).toBe(400);
    expect(vi.mocked(getDepartmentRecords)).not.toHaveBeenCalled();
  });

  it('is owner-only', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'employee' } }) }) }) }),
    });
    expect((await POST(req([add('Alcohol')]))).status).toBe(403);
  });
});
