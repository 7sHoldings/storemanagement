import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.NRS_USER_TOKEN = 'test-token'; });
vi.mock('@/lib/nrs-fetch', () => ({ nrsFetchJson: vi.fn() }));

import { nrsFetchJson } from '@/lib/nrs-fetch';
import { moveItemToDepartment } from '@/lib/nrs-pricebook';

const DETAIL = {
  data: {
    pricebook: {
      upc: '0012345', upcorplu: '0012345', name: 'Smok Novo 3 pod', desc: 'pod', size: '',
      dept: { dept: 'Pods/coils' },
      pricing: { cents: 1499, qty: 1, cost_cents: 700, cost_qty: 1 },
      extension: { picpak: [] },
    },
    master_image: null, custom_image: null,
  },
};

let posted;
beforeEach(() => {
  posted = null;
  vi.mocked(nrsFetchJson).mockImplementation(async (path, opts) => {
    if (opts?.method === 'POST') {
      posted = JSON.parse(opts.body);
      return { res: { rc: 0 }, data: { dept: { dept: posted.dept }, pricing: { cents: posted.cents } } };
    }
    if (path.startsWith('pbitems/')) return structuredClone(DETAIL);
    if (path.endsWith('/getid')) return { group_id: 7 };
    return { upcs: [] }; // item inventory
  });
});

describe('moveItemToDepartment', () => {
  it('re-saves the item with only the department changed', async () => {
    const r = await moveItemToDepartment(61345, '0012345', 'Coils & pods');
    expect(r).toMatchObject({ upc: '0012345', from: 'Pods/coils', to: 'Coils & pods' });
    expect(posted.dept).toBe('Coils & pods');
    expect(posted.cents).toBe(1499); // price unchanged
    expect(posted.cost_cents).toBe(700);
    expect(posted.data_before).toEqual({ cents: 1499, dept: 'Pods/coils' });
    expect(posted.data_after).toEqual({ cents: 1499, dept: 'Coils & pods' });
  });

  it('does nothing when the item is already there', async () => {
    const r = await moveItemToDepartment(61345, '0012345', 'Pods/coils');
    expect(r.unchanged).toBe(true);
    expect(posted).toBe(null);
  });

  it('fails loudly if NRS keeps the old department', async () => {
    vi.mocked(nrsFetchJson).mockImplementation(async (path, opts) => {
      if (opts?.method === 'POST') return { res: { rc: 0 }, data: { dept: { dept: 'Pods/coils' } } };
      if (path.startsWith('pbitems/')) return structuredClone(DETAIL);
      if (path.endsWith('/getid')) return { group_id: 7 };
      return { upcs: [] };
    });
    await expect(moveItemToDepartment(61345, '0012345', 'Coils & pods')).rejects.toThrow(/kept/);
  });

  it('reports an NRS rejection', async () => {
    vi.mocked(nrsFetchJson).mockImplementation(async (path, opts) => {
      if (opts?.method === 'POST') return { res: { rc: 5, msg: 'no such dept' } };
      if (path.startsWith('pbitems/')) return structuredClone(DETAIL);
      if (path.endsWith('/getid')) return { group_id: 7 };
      return { upcs: [] };
    });
    await expect(moveItemToDepartment(61345, '0012345', 'Coils & pods')).rejects.toThrow(/rejected/);
  });
});
