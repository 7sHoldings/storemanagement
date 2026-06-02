'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Button, Alert, Loading, EmptyState } from '@/components/UI';
import { downloadCSV, today } from '@/lib/utils';

export default function AutoReorderPage() {
  const { isOwner } = useAuth();
  const [storeFilter, setStoreFilter] = useState('all');
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Local edits (boxes per row + case pack per upc) keyed for quick lookup.
  const [boxEdits, setBoxEdits] = useState({});   // key `${store_id}:${upc}` -> number
  const [packEdits, setPackEdits] = useState({}); // upc -> number (in-flight)

  const load = useCallback(async (filter) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/reorder?store_id=${encodeURIComponent(filter)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.items || []);
      if (json.stores) setStores(json.stores);
      setBoxEdits({});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOwner) load(storeFilter); }, [isOwner, storeFilter, load]);

  if (!isOwner) return <Alert type="warning">Owner only.</Alert>;

  const keyOf = (it) => `${it.store_id}:${it.upc}`;
  const boxesFor = (it) => boxEdits[keyOf(it)] ?? it.boxes;

  const saveCasePack = async (upc, value) => {
    const pack = Math.max(1, Math.round(Number(value) || 1));
    setPackEdits(p => ({ ...p, [upc]: pack }));
    try {
      await fetch('/api/reorder/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upc, case_pack: pack }),
      });
      // Reflect the new pack + recompute suggested boxes locally.
      setItems(prev => prev.map(it => {
        if (it.upc !== upc) return it;
        const shortUnits = Math.max(it.reorderPoint - it.onhand, 0);
        const boxes = Math.max(1, Math.ceil((shortUnits || 1) / pack));
        return { ...it, casePack: pack, boxes };
      }));
    } catch { /* best-effort; value stays for the session */ }
  };

  const exportCSV = () => {
    const rows = items.map(it => [
      it.store, it.name, it.upc, it.dept || '', it.onhand, it.reorderPoint,
      it.casePack, boxesFor(it), boxesFor(it) * it.casePack,
      it.daysLeft ?? '', it.salesPerDay?.toFixed?.(2) ?? '',
    ]);
    downloadCSV(
      `auto-reorder-${today()}.csv`,
      ['Store', 'Item', 'UPC', 'Dept', 'On hand', 'Reorder pt', 'Pcs/box', 'Boxes', 'Total units', 'Days left', 'Sold/day'],
      rows,
    );
  };

  const totalBoxes = items.reduce((s, it) => s + boxesFor(it), 0);

  return (
    <div className="py-4 md:py-6 max-w-[1100px]">
      <PageHeader
        title="Auto Reorder"
        subtitle="Items at or below their NRS reorder point. On-hand updates automatically as you sell. Order suggestions are in boxes/cases."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[12px] font-semibold text-[var(--text-muted)]">Store</span>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="rounded-lg border border-sw-border bg-sw-card px-3 py-1.5 text-[13px] text-sw-text"
        >
          <option value="all">All stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => load(storeFilter)} disabled={loading}>Refresh</Button>
        <Button variant="secondary" onClick={exportCSV} disabled={!items.length}>Export CSV</Button>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {loading && <Loading text="Checking stock across stores…" />}

      {!loading && !error && items.length === 0 && (
        <EmptyState icon="✅" title="Nothing to reorder" message="No tracked items are at or below their reorder point right now." />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="text-[12px] text-[var(--text-muted)] mb-2">
            <span className="text-sw-text font-semibold">{items.length}</span> item{items.length === 1 ? '' : 's'} to reorder · <span className="text-sw-text font-semibold">{totalBoxes}</span> box{totalBoxes === 1 ? '' : 'es'} total
          </div>
          <div className="rounded-xl border border-sw-border bg-sw-card divide-y divide-sw-border/60">
            {items.map((it) => (
              <div key={keyOf(it)} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sw-text truncate">{it.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {it.store} · {it.upc}{it.dept ? ` · ${it.dept}` : ''}
                  </div>
                  <div className="text-[11px] mt-0.5">
                    <span className={it.onhand <= 0 ? 'text-red-500 font-semibold' : 'text-amber-500'}>
                      {it.onhand} on hand
                    </span>
                    <span className="text-[var(--text-muted)]"> · reorder at {it.reorderPoint}
                      {it.daysLeft != null ? ` · ~${it.daysLeft}d left` : ''}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">pcs/box</label>
                  <input
                    type="number" min="1"
                    defaultValue={it.casePack}
                    onBlur={(e) => { if (Number(e.target.value) !== it.casePack) saveCasePack(it.upc, e.target.value); }}
                    style={{ width: '3.5rem' }}
                    className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text text-center"
                  />
                </div>

                <div className="shrink-0 text-right">
                  <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">boxes</label>
                  <input
                    type="number" min="0"
                    value={boxesFor(it)}
                    onChange={(e) => setBoxEdits(b => ({ ...b, [keyOf(it)]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                    style={{ width: '4rem' }}
                    className="rounded-md border border-amber-500 bg-sw-bg px-2 py-1 text-[13px] text-sw-text text-center font-semibold"
                  />
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">= {boxesFor(it) * it.casePack} units</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
