import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/nrs-pricebook', () => ({ getDepartmentRecords: vi.fn(), setDepartmentShown: vi.fn() }));

import { POST } from '@/app/api/pricebook/departments/visibility/route';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getDepartmentRecords, setDepartmentShown } from '@/lib/nrs-pricebook';

const STORE = { id: 'den', name: 'Denison', nrs_store_id: 61345, nrs_elmer_id: 60903 };
const tax = [{ rate_decibps: 8250 }];
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
    from: (t) => (t === 'profiles' ? profiles : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: STORE }) }) }) }),
  });
  vi.mocked(getDepartmentRecords).mockImplementation(async () => structuredClone(live));
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
});
