import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.NRS_USER_TOKEN = 'test-token'; });
vi.mock('@/lib/nrs-fetch', () => ({ nrsFetchJson: vi.fn() }));

import { nrsFetchJson } from '@/lib/nrs-fetch';
import { listDepartments, buildDepartmentPayload, setDepartmentShown } from '@/lib/nrs-pricebook';

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

describe('buildDepartmentPayload', () => {
  // The department as NRS returns it after the portal created "7-hydroxy" in
  // Denison, and the exact body the portal sent to create it (from a HAR).
  const RECORD = {
    dept: '7-hydroxy', label: '7-hydroxy', item_count: 0, oneclick_count: 0,
    auths: [{ type: 'Tax', name: 'Tax', rate_decibps: '8250', per_item_cents: '', taxable: false }],
    auth_totals: [{ type: 'Tax', rate_decibps: 8250, per_item_cents: null }],
    isebt: false, verify_age: 21,
    extension: {
      donotshow: false, nogpi: false, depttype: 'product', color: '#ffffff', bordercolor: '#000000',
      textcolor: '#000000', iscannabis: false, nopointsearning: false, kitchen_print_at: null,
      printToKitchen: { enabled: false, expoOnly: false, printerList: [] },
    },
    donotshow: false, nogpi: false, depttype: 'product', showonapp: false, appname: null, iscannabis: false,
  };
  const CAPTURED = {
    dept: '7-hydroxy', newdept: '7-hydroxy',
    revauths: [{ store_id: 61345, elmer_id: 60903, name: 'Tax', rate_decibps: 8250, per_item_cents: null, type: 'Tax', taxable: false, active: true }],
    isebt: false, verify_age: '21', donotshow: false, nogpi: false, depttype: 'product',
    color: '#ffffff', bordercolor: '#000000', textcolor: '#000000', nopointsearning: false, iscannabis: false,
    extension: { printToKitchen: { enabled: false, expoOnly: false, printerList: [] } },
  };

  it('rebuilds the portal’s create body from a department record', () => {
    expect(buildDepartmentPayload('7-hydroxy', RECORD, { storeId: 61345, elmerId: 60903 })).toEqual(CAPTURED);
  });

  it('attaches tax to the target store’s own ids', () => {
    const p = buildDepartmentPayload('7-hydroxy', RECORD, { storeId: 63560, elmerId: 63128 });
    expect(p.revauths[0]).toMatchObject({ store_id: 63560, elmer_id: 63128, rate_decibps: 8250 });
  });

  it('copies an untaxed department as untaxed, with defaults for blank settings', () => {
    const p = buildDepartmentPayload('Calling Card', { dept: 'Calling Card', auths: [], verify_age: null, extension: {} }, { storeId: 1, elmerId: 2 });
    expect(p.revauths).toEqual([]);
    expect(p.verify_age).toBeNull();
    expect(p.depttype).toBe('product');
    expect(p.color).toBe('#ffffff');
  });
});

describe('setDepartmentShown', () => {
  it('re-saves the department with its settings and only the flag changed', async () => {
    vi.mocked(nrsFetchJson).mockResolvedValueOnce({ res: { rc: 0 }, data: { dept: 'Vape' } });
    const record = {
      dept: 'Vape', label: 'Vape', isebt: false, verify_age: 21, donotshow: false,
      auths: [{ type: 'Tax', name: 'Tax', rate_decibps: '8250', per_item_cents: '', taxable: false }],
      extension: { depttype: 'product', color: '#ff0000' },
    };
    await setDepartmentShown(61345, 60903, record, false);
    const [path, opts] = vi.mocked(nrsFetchJson).mock.calls.at(-1);
    const body = JSON.parse(opts.body);
    expect(path).toBe('departments/61345');
    expect(body).toMatchObject({
      dept: 'Vape', newdept: 'Vape', donotshow: true, verify_age: '21', color: '#ff0000',
      revauths: [{ store_id: 61345, elmer_id: 60903, rate_decibps: 8250, active: true }],
    });
  });

  it('throws when NRS rejects the save', async () => {
    vi.mocked(nrsFetchJson).mockResolvedValueOnce({ res: { rc: 1, msg: 'nope' } });
    await expect(setDepartmentShown(61345, 60903, { dept: 'Vape' }, true)).rejects.toThrow(/rejected/);
  });
});
