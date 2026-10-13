import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.NRS_USER_TOKEN = 'test-token'; });
vi.mock('@/lib/nrs-fetch', () => ({ nrsFetchJson: vi.fn() }));

import { nrsFetchJson } from '@/lib/nrs-fetch';
import { listDepartments } from '@/lib/nrs-pricebook';

// Shape captured from the NRS portal's GET departments/{store_id}.
const RESPONSE = {
  res: { rc: 0, msg: 'OK' },
  data: {
    Cartridges: {
      dept: 'Cartridges', label: 'Cartridges', item_count: 20,
      auth_totals: [{ type: 'Tax', rate_decibps: 8250, per_item_cents: null }],
      verify_age: null, extension: { depttype: 'other' },
    },
    'BR Portal': {
      dept: 'BR Portal', label: 'BR Portal', item_count: 0, auth_totals: [], verify_age: 21,
    },
  },
};

beforeEach(() => { vi.mocked(nrsFetchJson).mockResolvedValue(RESPONSE); });

describe('listDepartments', () => {
  it('reads item counts and total tax for each department', async () => {
    const list = await listDepartments(61345);
    expect(vi.mocked(nrsFetchJson).mock.calls[0][0]).toBe('departments/61345');
    expect(list).toEqual([
      { dept: 'BR Portal', label: 'BR Portal', item_count: 0, tax_decibps: 0, verify_age: 21 },
      { dept: 'Cartridges', label: 'Cartridges', item_count: 20, tax_decibps: 8250, verify_age: null },
    ]);
  });
});
