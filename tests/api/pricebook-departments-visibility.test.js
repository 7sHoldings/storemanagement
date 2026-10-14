import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({ getDepartmentRecords: vi.fn(), setDepartmentShown: vi.fn(), createDepartment: vi.fn() }));

import { POST } from '@/app/api/pricebook/departments/visibility/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getDepartmentRecords, setDepartmentShown, createDepartment } from '@/lib/nrs-pricebook';

const STORE = { id: 'den', name: 'Denison', nrs_store_id: 61345, nrs_elmer_id: 60903 };
const RENO = { id: 'reno', name: 'Reno', nrs_store_id: 63560 };
const tax = [{ rate_decibps: 8250 }];
const RENO_RECORDS = {
  '7-hydroxy': { dept: '7-hydroxy', label: '7-hydroxy', item_count: 26, donotshow: false, auth_totals: tax },
};
let live;

beforeEach(() => {
  vi.clearAllMocks();
  live = {
    Vape: { dept: 'Vape', label: 'Vape', item_count: 437, donotshow: false, auth_totals: tax },
    DEFAULT: { dept: 'DEFAULT', label: 'DEFAULT', item_count: 489, donotshow: false, auth_totals: tax },
    'BR Portal': { dept: 'BR Portal', label: 'BR Portal', donotshow: true, auth_totals: [] },
  };
  const profiles = { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', name: 'Owner' } }) }) }) };
  vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t) => (t === 'profiles' ? profiles : {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: STORE }) }),
        neq: () => ({ not: () => ({ order: async () => ({ data: [RENO] }) }) }),
      }),
    }),
  });
  vi.mocked(getDepartmentRecords).mockImplementation(async (id) => structuredClone(id === 63560 ? RENO_RECORDS : live));
  vi.mocked(createDepartment).mockImplementation(async (_s, _e, name, template) => {
    live[name] = { ...structuredClone(template), dept: name, label: name, item_count: 0 };
    return live[name];
  });
  vi.mocked(setDepartmentShown).mockImplementation(async (_s, _e, rec, shown) => {
    live[rec.dept] = { ...live[rec.dept], donotshow: !shown };
    return live[rec.dept];
  });
});

const req = (body) => ({ json: async () => body });

describe('POST /api/pricebook/departments/visibility', () => {
  it('previews without touching NRS', async () => {
    const body = await (await POST(req({ store_id: 'den', show: ['Vape'] }))).json();
    expect(body.changes.map(c => c.label)).toEqual(['DEFAULT']);
    expect(setDepartmentShown).not.toHaveBeenCalled();
  });

  it('saves only the departments whose flag changes, and confirms them', async () => {
    const body = await (await POST(req({ store_id: 'den', show: ['Vape'], apply: true }))).json();
    expect(vi.mocked(setDepartmentShown).mock.calls.map(c => [c[2].dept, c[3]])).toEqual([['DEFAULT', false]]);
    expect(vi.mocked(setDepartmentShown).mock.calls[0].slice(0, 2)).toEqual([61345, 60903]);
    expect(body.changed).toBe(1);
    expect(body.warnings).toBe(0);
  });

  it('flags a department NRS did not actually change', async () => {
    vi.mocked(setDepartmentShown).mockResolvedValue({});
    const body = await (await POST(req({ store_id: 'den', show: ['Vape'], apply: true }))).json();
    expect(body.results[0].warning).toMatch(/still has it shown/);
  });

  it('flags a tax change after saving', async () => {
    vi.mocked(setDepartmentShown).mockImplementation(async (_s, _e, rec, shown) => {
      live[rec.dept] = { ...live[rec.dept], donotshow: !shown, auth_totals: [] };
      return live[rec.dept];
    });
    const body = await (await POST(req({ store_id: 'den', show: ['Vape'], apply: true }))).json();
    expect(body.results[0].warning).toMatch(/Tax changed from 8.25% to 0%/);
  });

  it('refuses to leave a register with no department buttons', async () => {
    const res = await POST(req({ store_id: 'den', show: ['Kratom'], apply: true }));
    expect(res.status).toBe(400);
    expect(setDepartmentShown).not.toHaveBeenCalled();
  });

  it('previews a missing department with the store it would be copied from', async () => {
    const body = await (await POST(req({ store_id: 'den', show: ['Vape', '7-hydroxy', 'Kratom'] }))).json();
    expect(body.toCreate).toEqual([
      { name: '7-hydroxy', from_store: 'Reno', from_dept: '7-hydroxy' },
      { name: 'Kratom', from_store: null, error: 'No store has this department to copy' },
    ]);
    expect(createDepartment).not.toHaveBeenCalled();
  });

  it('creates a missing department from another store, then shows it', async () => {
    RENO_RECORDS['7-hydroxy'].donotshow = true; // copied hidden, still ends up shown
    const body = await (await POST(req({ store_id: 'den', show: ['Vape', '7-hydroxy'], apply: true }))).json();
    expect(vi.mocked(createDepartment).mock.calls[0].slice(0, 3)).toEqual([61345, 60903, '7-hydroxy']);
    expect(body.created).toEqual([{ name: '7-hydroxy', ok: true, from_store: 'Reno' }]);
    expect(live['7-hydroxy'].donotshow).toBe(false);
    expect(live.DEFAULT.donotshow).toBe(true);
    RENO_RECORDS['7-hydroxy'].donotshow = false;
  });
});
