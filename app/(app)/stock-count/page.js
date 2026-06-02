'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Button, Alert, Loading, Field } from '@/components/UI';
import BarcodeScanModal from '@/components/BarcodeScanner';

export default function StockCountPage() {
  const { supabase, isOwner, isEmployee, profile, effectiveStoreId } = useAuth();
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [loadingStores, setLoadingStores] = useState(true);

  const [upc, setUpc] = useState('');
  const [name, setName] = useState('');
  const [found, setFound] = useState(null); // null | true | false
  const [looking, setLooking] = useState(false);
  const [qty, setQty] = useState('');
  const [comesInBox, setComesInBox] = useState(false);
  const [pcsPerBox, setPcsPerBox] = useState('');

  const [scan, setScan] = useState(null); // 'item' | 'box' | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [counted, setCounted] = useState([]); // {upc, name, qty, ok}
  const qtyRef = useRef(null);
  const lookedUp = useRef('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stores').select('id, name, nrs_store_id').order('created_at');
      const nrs = (data || []).filter(s => s.nrs_store_id);
      setStores(nrs);
      // Employees are scoped to their assigned store; owners pick.
      const initial = isEmployee ? (effectiveStoreId || '') : (nrs[0]?.id || '');
      setStoreId(initial);
      setLoadingStores(false);
    })();
  }, [supabase, isEmployee, effectiveStoreId]);

  const lookup = useCallback(async (code) => {
    const u = String(code || '').trim();
    if (!u || !storeId || u === lookedUp.current) return;
    lookedUp.current = u;
    setLooking(true); setError('');
    try {
      const res = await fetch(`/api/inventory/lookup?store_id=${storeId}&upc=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      setFound(!!json.found);
      setName(json.found ? (json.name || '') : '');
      setTimeout(() => qtyRef.current?.focus(), 50);
    } catch (e) {
      setError(e.message);
    } finally {
      setLooking(false);
    }
  }, [storeId]);

  const reset = () => {
    setUpc(''); setName(''); setFound(null); setQty('');
    setComesInBox(false); setPcsPerBox(''); lookedUp.current = '';
  };

  const save = async () => {
    setError('');
    const count = Math.round(Number(qty));
    if (!upc.trim()) { setError('Scan or enter a UPC first.'); return; }
    if (!Number.isInteger(count) || count < 0) { setError('Enter a valid quantity.'); return; }
    setSaving(true);
    try {
      const body = { store_id: storeId, upc: upc.trim(), name, cnt: count };
      if (comesInBox && Number(pcsPerBox) > 1) body.case_pack = Math.round(Number(pcsPerBox));
      const res = await fetch('/api/inventory/count', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setCounted(prev => [{ upc: upc.trim(), name: name || upc.trim(), qty: count, ok: true }, ...prev].slice(0, 50));
      reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner && !isEmployee) return <Alert type="warning">Sign in to count stock.</Alert>;
  if (loadingStores) return <Loading />;
  if (!stores.length) return <Alert type="warning">No stores with an NRS ID configured.</Alert>;

  const storeName = stores.find(s => s.id === storeId)?.name;

  return (
    <div className="py-4 md:py-6 max-w-[560px]">
      <PageHeader
        title="Stock Count"
        subtitle="Scan an item, enter how many are on the shelf. The count is saved to your POS."
      />

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">Store</span>
          <select value={storeId} onChange={e => { setStoreId(e.target.value); reset(); }}
            className="rounded-lg border border-sw-border bg-sw-card px-3 py-1.5 text-[13px] text-sw-text">
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="text-[13px] text-[var(--text-muted)] mb-4">Store: <span className="text-sw-text font-semibold">{storeName}</span></div>
      )}

      {/* Scan / enter item */}
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 mb-4">
        <Field label="Item barcode">
          <div className="flex gap-2">
            <input
              value={upc}
              onChange={e => { setUpc(e.target.value); if (e.target.value.trim() !== lookedUp.current) { setFound(null); setName(''); } }}
              onBlur={() => lookup(upc)}
              onKeyDown={e => { if (e.key === 'Enter') lookup(upc); }}
              placeholder="Scan or type…"
              className="flex-1 min-w-0 rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[15px] text-sw-text"
            />
            <Button variant="secondary" onClick={() => setScan('item')}>📷 Scan</Button>
          </div>
        </Field>

        {looking && <p className="text-[12px] text-[var(--text-muted)]">Looking up…</p>}
        {found === true && name && <p className="text-[13px] text-green-500 font-semibold">{name}</p>}
        {found === false && (
          <p className="text-[12px] text-amber-500">Not in this store’s pricebook yet — you can still set a count, or add it on the Pricebook page.</p>
        )}

        <div className="mt-3">
          <Field label="Quantity on shelf">
            <input ref={qtyRef} type="number" inputMode="numeric" min="0" value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="0"
              className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[15px] text-sw-text" />
          </Field>
        </div>

        {/* Box / case */}
        <label className="flex items-center gap-2 mt-2 text-[13px] text-sw-text cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={comesInBox} onChange={e => setComesInBox(e.target.checked)} />
          This item comes in a box/case
        </label>
        {comesInBox && (
          <div className="mt-2">
            <Field label="Pieces per box">
              <input type="number" inputMode="numeric" min="2" value={pcsPerBox}
                onChange={e => setPcsPerBox(e.target.value)} placeholder="e.g. 5"
                style={{ width: '6rem' }}
                className="rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[15px] text-sw-text" />
            </Field>
            <p className="text-[11px] text-[var(--text-muted)] -mt-1">Used to suggest how many boxes to reorder.</p>
          </div>
        )}

        {error && <div className="mt-3"><Alert type="error">{error}</Alert></div>}

        <div className="flex gap-2 mt-4">
          <Button variant="primary" className="flex-1" onClick={save} disabled={saving || !upc.trim()}>
            {saving ? 'Saving…' : 'Save count'}
          </Button>
          <Button variant="secondary" onClick={reset} disabled={saving}>Clear</Button>
        </div>
      </div>

      {/* Counted this session */}
      {counted.length > 0 && (
        <div className="rounded-xl border border-sw-border bg-sw-card p-4">
          <h3 className="text-sw-text text-[14px] font-bold mb-2">Counted this session ({counted.length})</h3>
          <ul className="divide-y divide-sw-border/60">
            {counted.map((c, i) => (
              <li key={`${c.upc}-${i}`} className="flex items-center gap-2 py-2 text-[13px]">
                <span className="text-green-500">✓</span>
                <span className="flex-1 min-w-0 truncate text-sw-text">{c.name}</span>
                <span className="text-[var(--text-muted)]">{c.qty}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scan && (
        <BarcodeScanModal
          title={scan === 'item' ? 'Scan item' : 'Scan box'}
          onClose={() => setScan(null)}
          onDetected={(code) => {
            if (scan === 'item') { setUpc(code); lookup(code); }
            setScan(null);
          }}
        />
      )}
    </div>
  );
}
