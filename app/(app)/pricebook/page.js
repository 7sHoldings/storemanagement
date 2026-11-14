'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Button, Alert, Loading, EmptyState, ConfirmModal, Field, Modal } from '@/components/UI';
import BarcodeScanModal from '@/components/BarcodeScanner';
import { decodeBarcodeFromFile } from '@/components/barcodeImage';
import { Camera, ImagePlus, X as XIcon, Loader2 } from 'lucide-react';
import MultiStorePanel from '@/components/pricebook/MultiStorePanel';
import CatalogPanel from '@/components/pricebook/CatalogPanel';
import DepartmentsPanel from '@/components/pricebook/DepartmentsPanel';
import DepartmentSalesPanel from '@/components/pricebook/DepartmentSalesPanel';
import RegisterScreenPanel from '@/components/pricebook/RegisterScreenPanel';
import { existingPrices, priceChanges as findPriceChanges } from '@/lib/pricebook-prefill';
import { findMergedDepartment, splitFrequentDepartments } from '@/lib/pricebook-departments';

const fmtCents = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
// "29.99" / "$29.99" / "2999¢"? → integer cents. Returns null if unparseable.
const dollarsToCents = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

export default function PricebookPage() {
  const { supabase, isOwner } = useAuth();
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [loadingStores, setLoadingStores] = useState(true);
  const [tab, setTab] = useState('update'); // 'update' | 'multi' | 'catalog' | 'add' | 'departments' | 'deptsales' | 'register'

  // pending edits: upc -> { item, newCents }
  const [pending, setPending] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stores').select('id, name, nrs_store_id').order('created_at');
      const nrs = (data || []).filter(s => s.nrs_store_id);
      setStores(nrs);
      if (nrs.length) setStoreId(nrs[0].id);
      setLoadingStores(false);
    })();
  }, [supabase]);

  // Changing store clears the basket to avoid cross-store mixups.
  const onStoreChange = (id) => {
    setStoreId(id);
    setPending({});
    setApplyResult(null);
  };

  const stageEdit = useCallback((item, dollars) => {
    const newCents = dollarsToCents(dollars);
    setPending((prev) => {
      const next = { ...prev };
      if (newCents == null || newCents === item.cents) {
        delete next[item.upc];
      } else {
        next[item.upc] = { item, newCents };
      }
      return next;
    });
  }, []);

  const removePending = (upc) => setPending((prev) => {
    const next = { ...prev }; delete next[upc]; return next;
  });

  const pendingList = Object.values(pending);

  const applyUpdates = async () => {
    setConfirmOpen(false);
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await fetch('/api/pricebook/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          updates: pendingList.map(p => ({ upc: p.item.upc, cents: p.newCents })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      setApplyResult(json);
      // Clear successfully-updated items from the basket.
      const failedUpcs = new Set((json.results || []).filter(r => !r.ok).map(r => r.upc));
      setPending((prev) => {
        const next = {};
        for (const [upc, v] of Object.entries(prev)) if (failedUpcs.has(upc)) next[upc] = v;
        return next;
      });
    } catch (e) {
      setApplyResult({ error: e.message });
    } finally {
      setApplying(false);
    }
  };

  if (!isOwner) return <Alert type="warning">Owner only.</Alert>;
  if (loadingStores) return <Loading />;
  if (!stores.length) return <Alert type="warning">No stores with an NRS ID configured.</Alert>;

  return (
    <div className="py-4 md:py-6 max-w-[1200px]">
      <PageHeader
        title="Pricebook"
        subtitle="Change prices in one store or across all of them, or add a brand-new item. Changes are written straight to your POS."
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-sw-border overflow-x-auto -mx-1 px-1">
        {[['update', 'One store'], ['multi', 'All stores'], ['catalog', 'By UPC'], ['add', 'Add new item'], ['departments', 'Departments'], ['deptsales', 'Department sales'], ['register', 'Register screen']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === key ? 'border-amber-500 text-sw-text' : 'border-transparent text-[var(--text-muted)] hover:text-sw-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'update' && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">Store</span>
            <select
              value={storeId}
              onChange={(e) => onStoreChange(e.target.value)}
              className="rounded-lg border border-sw-border bg-sw-card px-3 py-1.5 text-[13px] text-sw-text"
            >
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <SearchPanel storeId={storeId} stores={stores} pending={pending} onStage={stageEdit} />
            <ReviewPanel
              pendingList={pendingList}
              onRemove={removePending}
              onApply={() => setConfirmOpen(true)}
              applying={applying}
              result={applyResult}
            />
          </div>
        </>
      )}

      {tab === 'multi' && <MultiStorePanel />}

      {tab === 'catalog' && <CatalogPanel />}

      {tab === 'add' && <AddItemPanel stores={stores} />}

      {tab === 'departments' && <DepartmentsPanel />}

      {tab === 'deptsales' && <DepartmentSalesPanel stores={stores} />}

      {tab === 'register' && <RegisterScreenPanel stores={stores} />}

      {confirmOpen && (
        <ConfirmModal
          title="Apply price changes?"
          message={`This will update ${pendingList.length} item price${pendingList.length === 1 ? '' : 's'} in your live NRS pricebook. This takes effect immediately at the register.`}
          confirmLabel="Update prices"
          confirmVariant="primary"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={applyUpdates}
        />
      )}
    </div>
  );
}

// ── Search + results with inline price editing ──────────────────────────
function SearchPanel({ storeId, stores, pending, onStage }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [copyItem, setCopyItem] = useState(null); // item being cloned to other stores
  const [scanOpen, setScanOpen] = useState(false);
  const reqRef = useRef(0);

  const [total, setTotal] = useState(0);       // recordsFiltered for the query
  const [loadingMore, setLoadingMore] = useState(false);

  // Per-row editable text for the price box. Seeded from any staged change,
  // else the item's current price. Lets manual typing AND the bulk-set bar
  // both reflect in the inputs.
  const [draft, setDraft] = useState({}); // upc -> string
  const [selected, setSelected] = useState(() => new Set()); // upc set
  const [bulkPrice, setBulkPrice] = useState('');

  // View controls: sort order + filter to a single current price.
  const [sort, setSort] = useState('name'); // 'name' | 'price_asc' | 'price_desc'
  const [priceFilter, setPriceFilter] = useState(null); // cents | null

  const PAGE = 100;

  // Distinct current prices among loaded items, with counts — rendered as
  // clickable filter chips so a whole price group is one click to isolate.
  const priceChips = useMemo(() => {
    const counts = new Map();
    for (const it of items) counts.set(it.cents, (counts.get(it.cents) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([cents, count]) => ({ cents, count }));
  }, [items]);

  // The rows actually shown: filtered by chip, then sorted.
  const visible = useMemo(() => {
    let v = priceFilter == null ? items : items.filter(it => it.cents === priceFilter);
    const byName = (a, b) => (a.name || a.desc || '').localeCompare(b.name || b.desc || '');
    if (sort === 'price_asc') v = [...v].sort((a, b) => a.cents - b.cents || byName(a, b));
    else if (sort === 'price_desc') v = [...v].sort((a, b) => b.cents - a.cents || byName(a, b));
    else v = [...v].sort(byName);
    return v;
  }, [items, priceFilter, sort]);

  // Seed draft entries for rows that don't have one yet (keeps existing edits
  // and selection intact when appending more pages).
  const seedDrafts = useCallback((rows) => {
    setDraft((d) => {
      const next = { ...d };
      for (const it of rows) {
        if (next[it.upc] === undefined) {
          next[it.upc] = pending[it.upc]
            ? (pending[it.upc].newCents / 100).toFixed(2)
            : (it.cents / 100).toFixed(2);
        }
      }
      return next;
    });
  }, [pending]);

  const fetchPage = useCallback(async (term, start) => {
    const params = new URLSearchParams({ store_id: storeId, q: term, start: String(start), length: String(PAGE) });
    const res = await fetch(`/api/pricebook/search?${params}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Search failed');
    return { items: json.items || [], total: json.recordsFiltered ?? 0 };
  }, [storeId]);

  const editPrice = (it, value) => {
    setDraft((d) => ({ ...d, [it.upc]: value }));
    onStage(it, value);
  };

  const toggleRow = (upc) => setSelected((s) => {
    const n = new Set(s); n.has(upc) ? n.delete(upc) : n.add(upc); return n;
  });
  // Select-all targets the currently visible (filtered) rows, so "filter to
  // $27.49 → select all" only grabs that group.
  const allSelected = visible.length > 0 && visible.every(i => selected.has(i.upc));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) visible.forEach(i => n.delete(i.upc));
    else visible.forEach(i => n.add(i.upc));
    return n;
  });

  // Apply the bulk price to every selected row at once (stages, not applied).
  const applyBulk = () => {
    if (!bulkPrice.trim() || selected.size === 0) return;
    const val = (parseFloat(bulkPrice.replace(/[^0-9.]/g, '')) || 0).toFixed(2);
    setDraft((d) => {
      const next = { ...d };
      for (const it of items) {
        if (selected.has(it.upc)) { next[it.upc] = val; onStage(it, val); }
      }
      return next;
    });
  };

  // Fresh search — resets the list, selection stays cleared.
  const runSearch = useCallback(async (term) => {
    const myReq = ++reqRef.current;
    setLoading(true); setError('');
    try {
      const { items: rows, total: t } = await fetchPage(term, 0);
      if (myReq !== reqRef.current) return;
      setItems(rows); setTotal(t); setSearched(true);
      setSelected(new Set()); setDraft({});
      seedDrafts(rows);
    } catch (e) {
      if (myReq === reqRef.current) setError(e.message);
    } finally {
      if (myReq === reqRef.current) setLoading(false);
    }
  }, [fetchPage, seedDrafts]);

  // Append the next page (or keep going until everything is loaded).
  const loadMore = useCallback(async (all = false) => {
    const myReq = reqRef.current;
    setLoadingMore(true); setError('');
    try {
      let start = items.length;
      let acc = [];
      do {
        const { items: rows, total: t } = await fetchPage(q.trim(), start);
        if (myReq !== reqRef.current) return; // a new search superseded us
        acc = acc.concat(rows);
        setTotal(t);
        start += rows.length;
        if (rows.length === 0) break;
        if (!all) break;
        if (start >= t || start >= 2000) break; // hard safety cap
      } while (true);
      if (myReq !== reqRef.current) return;
      setItems((prev) => [...prev, ...acc]);
      seedDrafts(acc);
    } catch (e) {
      if (myReq === reqRef.current) setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [items.length, q, fetchPage, seedDrafts]);

  // Debounced search as the owner types.
  useEffect(() => {
    if (!storeId) return;
    const t = setTimeout(() => runSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q, storeId, runSearch]);

  return (
    <div className="rounded-xl border border-sw-border bg-sw-card p-4">
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or UPC…"
          className="flex-1 min-w-0 rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text"
        />
        <Button variant="secondary" onClick={() => setScanOpen(true)} title="Scan a barcode to find the item">Scan</Button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      {loading && <Loading text="Searching pricebook…" />}
      {!loading && searched && items.length === 0 && (
        <EmptyState icon="🔍" title="No items found" message="Try a different name or UPC." />
      )}

      {!loading && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[12px] text-[var(--text-muted)]">
            Showing <span className="text-sw-text font-semibold">{visible.length}</span>
            {priceFilter != null ? ` of ${items.length} loaded` : ` of ${total} matching`} item{visible.length === 1 ? '' : 's'}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-[var(--text-muted)]">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[12px] text-sw-text"
            >
              <option value="name">Name</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
            </select>
          </div>
        </div>
      )}

      {/* Price filter chips — click a current price to isolate that group. */}
      {!loading && priceChips.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setPriceFilter(null)}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${priceFilter == null ? 'bg-amber-500/15 border-amber-500/50 text-sw-text' : 'border-sw-border text-[var(--text-muted)] hover:text-sw-text'}`}
          >
            All ({items.length})
          </button>
          {priceChips.map(({ cents, count }) => (
            <button
              key={cents}
              onClick={() => setPriceFilter(priceFilter === cents ? null : cents)}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${priceFilter === cents ? 'bg-amber-500/15 border-amber-500/50 text-sw-text' : 'border-sw-border text-[var(--text-muted)] hover:text-sw-text'}`}
            >
              {fmtCents(cents)} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Bulk-set bar: appears once rows are selected. */}
      {!loading && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
          <span className="text-[12px] font-semibold text-sw-text">{selected.size} selected</span>
          <span className="text-[12px] text-[var(--text-muted)]">→ set all to</span>
          <div className="flex items-center gap-1">
            <span className="text-[var(--text-muted)]">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyBulk(); }}
              placeholder="27.49"
              style={{ width: '5rem' }} className="w-20 rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text"
            />
          </div>
          <Button variant="primary" onClick={applyBulk} disabled={!bulkPrice.trim()}>Apply to selected</Button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-[var(--text-muted)] hover:text-sw-text underline">Clear</button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div>
          {/* Select-all header (replaces a table header so it works on mobile). */}
          <label className="flex items-center gap-2 py-2 border-b border-sw-border text-[12px] font-semibold text-[var(--text-muted)] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 shrink-0 accent-amber-500" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
            Select all ({visible.length})
          </label>

          <ul>
            {visible.map((it) => {
              const staged = pending[it.upc];
              const checked = selected.has(it.upc);
              return (
                <li key={it.upc} className={`flex items-center gap-3 py-2.5 border-b border-sw-border/50 ${checked ? 'bg-amber-500/5' : ''}`}>
                  <input type="checkbox" className="w-4 h-4 shrink-0 accent-amber-500" checked={checked} onChange={() => toggleRow(it.upc)} aria-label={`Select ${it.name || it.upc}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sw-text truncate">{it.name || it.desc || '—'}</div>
                    <div className="text-[12px] text-[var(--text-muted)] truncate">{it.upc}{it.dept ? ` · ${it.dept}` : ''}</div>
                    {stores?.length > 1 && (
                      <button onClick={() => setCopyItem(it)} className="text-[12px] text-amber-500 hover:underline mt-0.5">
                        Copy to other stores →
                      </button>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[12px] text-[var(--text-muted)] mb-0.5">was {fmtCents(it.cents)}</div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-[var(--text-muted)]">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft[it.upc] ?? (it.cents / 100).toFixed(2)}
                        onChange={(e) => editPrice(it, e.target.value)}
                        style={{ width: '4.75rem' }} className={`w-[72px] rounded-md border bg-sw-bg px-2 py-1.5 text-[13px] text-sw-text ${staged ? 'border-amber-500' : 'border-sw-border'}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {items.length < total && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button variant="secondary" onClick={() => loadMore(false)} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Load more (${total - items.length} left)`}
              </Button>
              <Button variant="secondary" onClick={() => loadMore(true)} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Load all ${total}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {copyItem && (
        <CopyToStoresModal item={copyItem} sourceStoreId={storeId} stores={stores} onClose={() => setCopyItem(null)} />
      )}

      {scanOpen && (
        <BarcodeScanModal
          onDetected={(code) => { setQ(code); setScanOpen(false); }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}

// ── Clone an existing item into other stores ────────────────────────────
function CopyToStoresModal({ item, sourceStoreId, stores, onClose }) {
  const sourcePrice = (item.cents / 100).toFixed(2);
  const [rows, setRows] = useState(() =>
    stores.filter(s => s.id !== sourceStoreId).map(s => ({ id: s.id, name: s.name, selected: true, price: sourcePrice }))
  );
  const [bulkPrice, setBulkPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const setRow = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const applyBulk = () => {
    if (!bulkPrice.trim()) return;
    const v = (parseFloat(bulkPrice.replace(/[^0-9.]/g, '')) || 0).toFixed(2);
    setRows(rs => rs.map(r => r.selected ? { ...r, price: v } : r));
  };

  const selectedRows = rows.filter(r => r.selected);
  const canSubmit = selectedRows.length > 0 && selectedRows.every(r => r.price.trim() && Number(r.price) >= 0);

  const submit = async () => {
    setSubmitting(true); setResult(null);
    try {
      const targets = selectedRows.map(r => ({ store_id: r.id, cents: Math.round(parseFloat(r.price) * 100) }));
      const res = await fetch('/api/pricebook/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { upc: item.upc, name: item.name, size: item.size || '', dept: item.dept, costCents: item.cost_cents || 0 },
          targets,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Copy failed');
      setResult(json);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Copy "${item.name || item.upc}" to other stores`} onClose={onClose}>
      <p className="text-sw-sub text-[12px] mb-3">
        Clones this item ({item.upc}{item.dept ? ` · ${item.dept}` : ''}) into the selected stores. Price prefilled from the source — adjust per store if needed.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[var(--text-muted)] text-[13px]">$</span>
        <input value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} inputMode="decimal" placeholder="set all to"
          onKeyDown={e => { if (e.key === 'Enter') applyBulk(); }}
          style={{ width: '6rem' }} className="w-24 rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text" />
        <Button variant="secondary" onClick={applyBulk} disabled={!bulkPrice.trim()}>Set all</Button>
      </div>

      <ul className="space-y-2 mb-4 max-h-[280px] overflow-y-auto">
        {rows.map(r => (
          <li key={r.id} className="flex items-center gap-2">
            <input type="checkbox" className="w-4 h-4 shrink-0 accent-amber-500" checked={r.selected} onChange={e => setRow(r.id, { selected: e.target.checked })} />
            <span className="flex-1 min-w-0 truncate text-[13px] text-sw-text" title={r.name}>{r.name || r.id}</span>
            <span className="text-[var(--text-muted)] text-[13px]">$</span>
            <input value={r.price} onChange={e => setRow(r.id, { price: e.target.value })} inputMode="decimal" placeholder="0.00"
              disabled={!r.selected}
              style={{ width: '5rem' }} className={`w-20 rounded-md border bg-sw-bg px-2 py-1 text-[13px] text-sw-text ${r.selected ? 'border-sw-border' : 'border-sw-border/40 opacity-50'}`} />
          </li>
        ))}
      </ul>

      {result ? (
        result.error
          ? <Alert type="error">{result.error}</Alert>
          : <Alert type={result.failed ? 'warning' : 'success'}>
              Copied to {result.created} store{result.created === 1 ? '' : 's'}{result.failed ? `, ${result.failed} failed` : ''}.
              {result.failed > 0 && (
                <ul className="mt-2 text-[12px] list-disc pl-4">
                  {result.results.filter(r => !r.ok).map(r => <li key={r.store_id}>{r.store}: {r.error}</li>)}
                </ul>
              )}
            </Alert>
      ) : null}

      <div className="flex gap-2 justify-end mt-4">
        <Button variant="secondary" onClick={onClose}>{result && !result.error ? 'Close' : 'Cancel'}</Button>
        {!(result && !result.error) && (
          <Button variant="primary" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? 'Copying…' : `Copy to ${selectedRows.length || ''} store${selectedRows.length === 1 ? '' : 's'}`.trim()}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ── Basket of staged changes + apply ────────────────────────────────────
function ReviewPanel({ pendingList, onRemove, onApply, applying, result }) {
  return (
    <div className="rounded-xl border border-sw-border bg-sw-card p-4 h-fit lg:sticky lg:top-4">
      <h3 className="text-sw-text text-[15px] font-semibold mb-1">Pending changes</h3>
      <p className="text-sw-sub text-[12px] mb-3">Review before applying. Nothing is sent until you click Update.</p>

      {pendingList.length === 0 ? (
        <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">
          Edit a price in the list to stage a change.
        </div>
      ) : (
        <ul className="space-y-2 mb-4">
          {pendingList.map(({ item, newCents }) => (
            <li key={item.upc} className="flex items-center justify-between gap-2 text-[13px]">
              <div className="min-w-0">
                <div className="font-medium text-sw-text truncate">{item.name || item.desc || item.upc}</div>
                <div className="text-[12px] text-[var(--text-muted)]">
                  {fmtCents(item.cents)} → <span className="text-amber-500 font-semibold">{fmtCents(newCents)}</span>
                </div>
              </div>
              <button onClick={() => onRemove(item.upc)} className="text-[var(--text-muted)] hover:text-red-500 text-[16px] leading-none">×</button>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="primary"
        className="w-full"
        disabled={pendingList.length === 0 || applying}
        onClick={onApply}
      >
        {applying ? 'Updating…' : `Update ${pendingList.length || ''} price${pendingList.length === 1 ? '' : 's'}`.trim()}
      </Button>

      {result && (
        <div className="mt-4">
          {result.error ? (
            <Alert type="error">{result.error}</Alert>
          ) : (
            <Alert type={result.failed ? 'warning' : 'success'}>
              Updated {result.updated} price{result.updated === 1 ? '' : 's'}
              {result.failed ? `, ${result.failed} failed` : ''}.
              {result.failed > 0 && (
                <ul className="mt-2 text-[12px] list-disc pl-4">
                  {result.results.filter(r => !r.ok).map(r => (
                    <li key={r.upc}>{r.upc}: {r.error}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add a new item to one or more stores ────────────────────────────────
function AddItemPanel({ stores }) {
  const [upc, setUpc] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [cost, setCost] = useState('');
  // `dept` holds the merged department's key; each store's own code comes
  // from `departments[].codes` (codes differ between stores).
  const [dept, setDept] = useState('');
  const [departments, setDepartments] = useState([]);
  const [deptFailedStores, setDeptFailedStores] = useState([]);
  const [deptError, setDeptError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);

  // Per-store selection + price, keyed by store id. Names are read live from
  // the `stores` prop at render time (no snapshot) so they always show.
  const [sel, setSel] = useState(() => new Set(stores.map(s => s.id)));
  const [prices, setPrices] = useState({}); // id -> string
  const [bulkPrice, setBulkPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [lookup, setLookup] = useState(null); // { status:'searching'|'found'|'notfound', msg }
  // What the lookup found per store: id -> { status:'has'|'missing'|'unknown', cents }.
  // Stores that already carry the UPC are shown with their price and are
  // never added again; empty until a UPC has been looked up.
  const [storeStatus, setStoreStatus] = useState({});
  // The department of the item the lookup found, waiting to be matched to a
  // dropdown option (departments may still be loading when it arrives).
  const [foundDept, setFoundDept] = useState(null); // { dept, label, store }
  const [deptHint, setDeptHint] = useState('');
  const lookedUp = useRef('');
  const upcRef = useRef(null);

  // ── Barcodes from photos ────────────────────────────────────
  // One photo behaves like Scan. Several photos (e.g. flavours of the same
  // product) become a list of items that share department, cost, stores and
  // prices, and are all added in one go.
  const photoInputRef = useRef(null);
  const [batch, setBatch] = useState(null); // null | Array<row>
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const rowSeq = useRef(0);
  const deptRef = useRef('');
  deptRef.current = dept;

  // Load every store's departments once, merged by name.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/pricebook/departments');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load departments');
        setDepartments(json.departments || []);
        setDeptFailedStores(json.failedStores || []);
      } catch (e) {
        setDeptError(e.message);
      }
    })();
    upcRef.current?.focus();
  }, []);

  // An item already in a store brings its department with it, replacing
  // whatever was picked for the previous item.
  useEffect(() => {
    if (!foundDept || !departments.length) return;
    const match = findMergedDepartment(departments, foundDept);
    if (match) { setDept(match.key); setDeptHint(''); }
    else setDeptHint(`“${foundDept.label || foundDept.dept}” (from ${foundDept.store}) isn’t in this list — pick a department.`);
  }, [foundDept, departments]);

  // Untick stores that already carry the UPC and pre-fill every other
  // store with the price most stores charge. A UPC no store carries starts
  // every price at 0 so stale prices from the last item never carry over.
  const applyStoreResults = useCallback((json) => {
    const list = Array.isArray(json?.stores) ? json.stores : [];
    if (!list.length) return;
    const status = Object.fromEntries(list.map(r => [r.store_id, { status: r.status, cents: r.cents }]));
    setStoreStatus(status);
    setSel(new Set(stores.filter(s => status[s.id]?.status !== 'has').map(s => s.id)));
    // Stores that carry it start at their own price (editable); the rest at
    // the price most stores charge.
    const fill = Number.isFinite(json.suggestedCents) ? (json.suggestedCents / 100).toFixed(2) : '';
    setPrices(Object.fromEntries(stores.map(s => {
      const st = status[s.id];
      if (st?.status === 'has') return [s.id, Number.isFinite(st.cents) ? (st.cents / 100).toFixed(2) : ''];
      return [s.id, fill];
    })));
  }, [stores]);

  // Forget the last lookup's per-store results when the UPC changes.
  const resetStoreStatus = () => {
    setStoreStatus({});
    setFoundDept(null); setDeptHint('');
    setSel(new Set(stores.map(s => s.id)));
  };

  // Look a UPC up across all stores and auto-fill name/size/dept/cost. Only
  // fills fields the user hasn't already typed, so it never clobbers input.
  const lookupUpc = useCallback(async (code) => {
    const u = String(code || '').trim();
    if (!u || u === lookedUp.current) return;
    lookedUp.current = u;
    setLookup({ status: 'searching', msg: 'Looking up product…' });
    try {
      const res = await fetch(`/api/pricebook/lookup?upc=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      // The UPC was edited while this was in flight; its results are stale.
      if (lookedUp.current !== u) return;
      if (json.found) {
        setName(prev => prev.trim() ? prev : (json.name || ''));
        setSize(prev => prev.trim() ? prev : (json.size || ''));
        setCost(prev => prev.trim() ? prev : (json.costCents ? (json.costCents / 100).toFixed(2) : ''));
        if (json.source === 'store' && (json.dept || json.deptLabel)) {
          setFoundDept({ dept: json.dept, label: json.deptLabel, store: json.foundInStore });
        }
        applyStoreResults(json);
        setLookup({
          status: 'found',
          msg: json.source && json.source !== 'store'
            ? 'Name from product database — pick a department.'
            : `Auto-filled from ${json.foundInStore}`,
        });
      } else {
        applyStoreResults(json);
        setLookup({ status: 'notfound', msg: 'New product — type the name below.' });
      }
    } catch (e) {
      setLookup({ status: 'notfound', msg: '' });
    }
  }, [applyStoreResults]);

  // Look one batch row up: fills its name/size and records which stores
  // already carry it. The first department found becomes the shared one.
  const lookupRow = useCallback(async (key, code) => {
    const u = String(code || '').trim();
    if (!u) return;
    setBatch(b => b && b.map(r => r.key === key ? { ...r, lookup: 'searching' } : r));
    try {
      const res = await fetch(`/api/pricebook/lookup?upc=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      const list = Array.isArray(json.stores) ? json.stores : [];
      const status = Object.fromEntries(list.map(x => [x.store_id, { status: x.status, cents: x.cents }]));
      setBatch(b => b && b.map(r => r.key !== key || r.upc.trim() !== u ? r : {
        ...r,
        lookup: json.found ? 'found' : 'notfound',
        source: json.found ? (json.source === 'store' ? json.foundInStore : 'product database') : '',
        name: r.name.trim() ? r.name : (json.name || ''),
        size: r.size.trim() ? r.size : (json.size || ''),
        storeStatus: status,
      }));
      if (json.found && json.source === 'store' && (json.dept || json.deptLabel)) {
        if (!deptRef.current) setFoundDept({ dept: json.dept, label: json.deptLabel, store: json.foundInStore });
      }
      if (json.found && json.costCents) setCost(c => c.trim() ? c : (json.costCents / 100).toFixed(2));
      if (Number.isFinite(json.suggestedCents)) {
        const fill = (json.suggestedCents / 100).toFixed(2);
        setPrices(p => (Object.values(p).some(v => String(v ?? '').trim()) ? p : Object.fromEntries(stores.map(st => [st.id, fill]))));
      }
    } catch {
      setBatch(b => b && b.map(r => r.key === key ? { ...r, lookup: 'error' } : r));
    }
  }, [stores]);

  const updateRow = (key, patch) => setBatch(b => b && b.map(r => r.key === key ? { ...r, ...patch } : r));
  const removeRow = (key) => setBatch(b => {
    const left = (b || []).filter(r => r.key !== key);
    return left.length ? left : null;
  });

  const handlePhotos = async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!files.length) return;
    setPhotoNote(''); setResult(null);

    // A single photo with no list open works exactly like Scan.
    if (files.length === 1 && !batch) {
      setLookup({ status: 'searching', msg: 'Reading barcode from photo…' });
      try {
        const hit = await decodeBarcodeFromFile(files[0]);
        if (!hit?.upc) {
          setLookup({ status: 'notfound', msg: 'Couldn’t read a barcode in that photo. Try a closer, sharper photo, or type the number.' });
          return;
        }
        setUpc(hit.upc); lookedUp.current = ''; resetStoreStatus();
        lookupUpc(hit.upc);
      } catch (e) {
        setLookup({ status: 'notfound', msg: e.message || 'Couldn’t open that photo.' });
      }
      return;
    }

    // Several photos: build (or extend) the list. An item already typed in
    // the single form joins the list as its first row.
    const seed = !batch && upc.trim()
      ? [{ key: ++rowSeq.current, preview: '', fileName: 'Typed', read: 'read', upc: upc.trim(), name, size, lookup: lookup?.status === 'found' ? 'found' : 'idle', storeStatus: { ...storeStatus }, error: '' }]
      : [];
    const added = files.map(f => ({ key: ++rowSeq.current, preview: URL.createObjectURL(f), fileName: f.name, read: 'reading', upc: '', name: '', size: '', lookup: 'idle', storeStatus: {}, error: '' }));
    setBatch(b => [...(b || seed), ...added]);
    if (!batch && upc.trim()) { setUpc(''); setName(''); setSize(''); lookedUp.current = ''; setLookup(null); setStoreStatus({}); }

    // Barcodes already in the list (or read earlier in this upload).
    const known = new Set([...(batch || []), ...seed].map(r => r.upc.trim()).filter(Boolean));
    let dupes = 0;
    for (let i = 0; i < files.length; i++) {
      const row = added[i];
      let hit = null;
      try { hit = await decodeBarcodeFromFile(files[i]); } catch { /* unreadable image */ }
      const code = hit?.upc || '';
      if (code && known.has(code)) {
        dupes++;
        if (row.preview) URL.revokeObjectURL(row.preview);
        setBatch(b => { const left = (b || []).filter(r => r.key !== row.key); return left.length ? left : null; });
        continue;
      }
      if (code) known.add(code);
      setBatch(b => b && b.map(r => r.key === row.key ? { ...r, read: code ? 'read' : 'unread', upc: code } : r));
      if (code) lookupRow(row.key, code);
    }
    if (dupes) setPhotoNote(`${dupes} photo${dupes === 1 ? ' had' : 's had'} a barcode already in the list and ${dupes === 1 ? 'was' : 'were'} skipped.`);
  };

  const clearBatch = () => {
    (batch || []).forEach(r => r.preview && URL.revokeObjectURL(r.preview));
    setBatch(null); setPhotoNote('');
  };

  const toggleSel = (id) => storeStatus[id]?.status !== 'has' && setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setPrice = (id, v) => setPrices(p => ({ ...p, [id]: v }));
  // Every ticked store plus every store that already carries the item, so
  // one price can be lined up across all stores in one step.
  const applyPriceToAll = (v) => setPrices(p => {
    const n = { ...p };
    for (const s of stores) if (sel.has(s.id) || storeStatus[s.id]?.status === 'has') n[s.id] = v;
    return n;
  });
  const applyBulkPrice = () => {
    if (!bulkPrice.trim()) return;
    applyPriceToAll((parseFloat(bulkPrice.replace(/[^0-9.]/g, '')) || 0).toFixed(2));
  };

  const selectedStores = stores.filter(s => sel.has(s.id) && storeStatus[s.id]?.status !== 'has');
  const carried = stores.filter(s => storeStatus[s.id]?.status === 'has');
  const priceOptions = existingPrices(stores.map(s => ({ store: s.name, ...storeStatus[s.id] })));
  const changes = findPriceChanges(storeStatus, prices);
  // Busiest departments first (A–Z), then the rest (A–Z).
  const deptGroups = useMemo(() => splitFrequentDepartments(departments), [departments]);
  const deptOption = (d) => (
    <option key={d.key} value={d.key}>
      {d.label}{d.items ? ` (${d.items})` : ''}{d.missing.length ? ` — not in ${d.missing.length} store${d.missing.length === 1 ? '' : 's'}` : ''}
    </option>
  );
  // Ticked stores that have no such department; NRS would reject the item there.
  const deptRow = departments.find(d => d.key === dept) || null;
  const deptMissingIn = deptRow ? selectedStores.filter(s => deptRow.missingIds.includes(s.id)) : [];
  const untickDeptMissing = () => setSel(prev => {
    const n = new Set(prev);
    deptMissingIn.forEach(s => n.delete(s.id));
    return n;
  });
  const validPrice = (v) => String(v ?? '').trim() !== '' && Number(v) >= 0;
  const canSubmit = lookup?.status !== 'searching' && upc.trim()
    && (selectedStores.length > 0 || changes.length > 0)
    && (selectedStores.length === 0 || (name.trim() && deptRow && deptMissingIn.length === 0 && selectedStores.every(s => validPrice(prices[s.id]))))
    && carried.every(s => validPrice(prices[s.id]));
  const submitLabel = [
    selectedStores.length ? `Add to ${selectedStores.length} store${selectedStores.length === 1 ? '' : 's'}` : '',
    changes.length ? `${selectedStores.length ? 'update' : 'Update'} ${changes.length} price${changes.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ') || 'Add to stores';

  // ── Batch: who gets each item, and whether the list can be added ──
  const batchRows = batch || [];
  const rowTargets = (r) => stores.filter(s => sel.has(s.id) && r.storeStatus?.[s.id]?.status !== 'has');
  const batchBusy = batchRows.some(r => r.read === 'reading' || r.lookup === 'searching');
  const batchSelected = stores.filter(s => sel.has(s.id));
  const batchDeptMissing = deptRow ? batchSelected.filter(s => deptRow.missingIds.includes(s.id)) : [];
  const batchCanSubmit = batchRows.length > 0 && !batchBusy && !!deptRow && batchDeptMissing.length === 0
    && batchSelected.length > 0 && batchSelected.every(s => validPrice(prices[s.id]))
    && batchRows.every(r => r.upc.trim() && r.name.trim())
    && batchRows.some(r => rowTargets(r).length > 0);
  const batchNew = batchRows.filter(r => rowTargets(r).length > 0).length;

  // Adds every row to the ticked stores that don't carry it yet, one row at
  // a time through the same endpoint as a single item. Stores that already
  // carry a row's UPC are skipped for that row (their price is left alone).
  const submitBatch = async () => {
    setBatchSubmitting(true); setResult(null);
    const summary = { items: 0, stores: 0, skipped: 0, failed: 0, errors: [] };
    const failedKeys = new Set();
    for (const r of batchRows) {
      const targets = rowTargets(r);
      if (!targets.length) { summary.skipped++; continue; }
      try {
        const res = await fetch('/api/pricebook/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: { upc: r.upc.trim(), name: r.name.trim(), size: r.size.trim(), dept: deptRow.dept, deptLabel: deptRow.label, costCents: cost ? Math.round(parseFloat(cost) * 100) : 0 },
            targets: targets.map(s => ({ store_id: s.id, cents: Math.round(parseFloat(prices[s.id]) * 100) })),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Create failed');
        const bad = (json.results || []).filter(x => !x.ok);
        if (json.created) { summary.items++; summary.stores += json.created; }
        if (bad.length) {
          summary.failed += bad.length; failedKeys.add(r.key);
          bad.forEach(x => summary.errors.push(`${r.name.trim()} — ${x.store}: ${x.error}`));
          updateRow(r.key, { error: bad.map(x => `${x.store}: ${x.error}`).join('; ') });
        }
      } catch (e) {
        summary.failed++; failedKeys.add(r.key);
        summary.errors.push(`${r.name.trim()}: ${e.message}`);
        updateRow(r.key, { error: e.message });
      }
    }
    setResult({ batch: summary });
    // Done rows leave the list; rows that failed stay so they can be retried.
    setBatch(b => {
      const left = (b || []).filter(r => failedKeys.has(r.key));
      (b || []).filter(r => !failedKeys.has(r.key)).forEach(r => r.preview && URL.revokeObjectURL(r.preview));
      return left.length ? left : null;
    });
    setBatchSubmitting(false);
  };

  // Creates the item in the ticked stores that lack it and re-prices the
  // stores that already carry it, then reports both together.
  const submit = async () => {
    setSubmitting(true); setResult(null);
    const out = { name: name.trim() || upc.trim(), created: 0, updated: 0, failed: 0, errors: [] };
    try {
      if (selectedStores.length) {
        const targets = selectedStores.map(s => ({ store_id: s.id, cents: Math.round(parseFloat(prices[s.id]) * 100) }));
        const res = await fetch('/api/pricebook/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: { upc: upc.trim(), name: name.trim(), size: size.trim(), dept: deptRow.dept, deptLabel: deptRow.label, costCents: cost ? Math.round(parseFloat(cost) * 100) : 0 },
            targets,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Create failed');
        out.created = json.created || 0;
        out.failed += json.failed || 0;
        (json.results || []).filter(r => !r.ok).forEach(r => out.errors.push(`${r.store}: ${r.error}`));
      }
      if (changes.length) {
        const res = await fetch('/api/pricebook/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ writes: changes.map(c => ({ store_id: c.store_id, upc: upc.trim(), cents: c.cents })) }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Price update failed');
        out.updated = (json.updated || 0) + (json.unchanged || 0);
        out.failed += json.failed || 0;
        (json.results || []).filter(r => !r.ok).forEach(r => out.errors.push(`${r.store_name}: ${r.error}`));
      }
      setResult(out);
      if (out.failed === 0) {
        // Clear item fields for the next add; keep dept + store selection + prices.
        setUpc(''); setName(''); setSize(''); setCost('');
        lookedUp.current = ''; setLookup(null); resetStoreStatus();
        upcRef.current?.focus();
      }
    } catch (e) {
      setResult({ ...out, error: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Item details */}
      <div className="rounded-xl border border-sw-border bg-sw-card p-4">
        <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handlePhotos(e.target.files)} />
        {batch && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sw-text text-[15px] font-semibold">Items from photos ({batchRows.length})</h3>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => photoInputRef.current?.click()}><ImagePlus size={16} strokeWidth={1.75} aria-hidden="true" />Add photos</Button>
                <Button variant="secondary" onClick={clearBatch}>Clear list</Button>
              </div>
            </div>
            <p className="text-sw-dim text-[12px] mb-3">Department, cost, stores and prices below apply to every item in this list. Stores that already carry an item are skipped for that item.</p>
            {photoNote && <p className="text-[12px] text-amber-600 mb-2">{photoNote}</p>}
            <ul className="flex flex-col gap-2">
              {batchRows.map((r, i) => {
                const has = stores.filter(st => r.storeStatus?.[st.id]?.status === 'has');
                const targets = rowTargets(r);
                return (
                  <li key={r.key} className={`rounded-lg border ${r.error ? 'border-red-300 bg-red-50/40' : 'border-sw-border'} p-2.5 flex gap-3`}>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-md bg-[#F4F4F5] overflow-hidden shrink-0 flex items-center justify-center text-[11px] text-sw-dim">
                      {r.preview ? <img src={r.preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" /> : 'Typed'}
                    </div>
                    <div className="flex-1 min-w-0 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.6fr)]">
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[12px] text-sw-dim">UPC</span>
                        <input value={r.upc} inputMode="numeric"
                          onChange={e => updateRow(r.key, { upc: e.target.value, storeStatus: {}, lookup: 'idle', error: '' })}
                          onBlur={e => e.target.value.trim() && r.lookup === 'idle' && lookupRow(r.key, e.target.value)}
                          placeholder={r.read === 'reading' ? 'Reading photo…' : 'Type the number'}
                          className="w-full rounded-lg border border-sw-border bg-sw-bg px-2.5 py-1.5 text-[14px] text-sw-text" />
                      </label>
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[12px] text-sw-dim">Item name</span>
                        <input value={r.name} onChange={e => updateRow(r.key, { name: e.target.value })} placeholder="e.g. Geek Bar Pulse Blue Razz"
                          className="w-full rounded-lg border border-sw-border bg-sw-bg px-2.5 py-1.5 text-[14px] text-sw-text" />
                      </label>
                      <label className="flex flex-col gap-1 min-w-0">
                        <span className="text-[12px] text-sw-dim">Size</span>
                        <input value={r.size} onChange={e => updateRow(r.key, { size: e.target.value })} placeholder="1 ct"
                          className="w-full rounded-lg border border-sw-border bg-sw-bg px-2.5 py-1.5 text-[14px] text-sw-text" />
                      </label>
                      <div className="sm:col-span-3 text-[12px] flex items-center gap-1.5">
                        {r.read === 'reading' && <><Loader2 size={13} className="animate-spin text-sw-dim" aria-hidden="true" /><span className="text-sw-dim">Reading barcode…</span></>}
                        {r.read === 'unread' && !r.upc.trim() && <span className="text-amber-600">Couldn’t read a barcode in this photo — type the number.</span>}
                        {r.lookup === 'searching' && <><Loader2 size={13} className="animate-spin text-sw-dim" aria-hidden="true" /><span className="text-sw-dim">Looking up…</span></>}
                        {r.lookup === 'found' && <span className="text-green-700">Found in {r.source || 'a store'}.</span>}
                        {r.lookup === 'notfound' && <span className="text-sw-dim">New product — check the name.</span>}
                        {r.lookup === 'error' && <span className="text-amber-600">Lookup failed — check the details.</span>}
                        {has.length > 0 && <span className="text-sw-dim">· Already in {has.map(st => st.name?.split(' - ').pop()).join(', ')}{targets.length ? '' : ' — nothing to add'}</span>}
                        {r.error && <span className="text-red-700">· {r.error}</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove item ${i + 1}`} className="self-start w-8 h-8 rounded-md text-sw-dim hover:bg-[#F4F4F5] flex items-center justify-center shrink-0">
                      <XIcon size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <h3 className="text-sw-text text-[15px] font-semibold mb-3">{batch ? 'Shared details' : 'Item details'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {!batch && <Field label="UPC / barcode">
            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              <input ref={upcRef} value={upc}
                onChange={e => {
                  setUpc(e.target.value);
                  if (e.target.value.trim() !== lookedUp.current) {
                    lookedUp.current = ''; setLookup(null); resetStoreStatus();
                  }
                }}
                onBlur={() => lookupUpc(upc)}
                onKeyDown={e => { if (e.key === 'Enter') lookupUpc(upc); }}
                placeholder="Scan or type…"
                className="w-full sm:w-auto sm:flex-1 min-w-0 rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text" />
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setScanOpen(true)} title="Scan with camera"><Camera size={16} strokeWidth={1.75} aria-hidden="true" />Scan</Button>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => photoInputRef.current?.click()} title="Read barcodes from photos — pick several for flavours of one product">
                <ImagePlus size={16} strokeWidth={1.75} aria-hidden="true" />Photos
              </Button>
            </div>
            {lookup?.msg && (
              <span className={`text-[12px] ${lookup.status === 'found' ? 'text-green-500' : lookup.status === 'searching' ? 'text-[var(--text-muted)]' : 'text-amber-500'}`}>
                {lookup.msg}
              </span>
            )}
          </Field>}
          <Field label="Department">
            <select value={dept} onChange={e => setDept(e.target.value)}
              className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text">
              <option value="">Select department…</option>
              {deptGroups.frequent.length > 0 && (
                <optgroup label="Most used">
                  {deptGroups.frequent.map(deptOption)}
                </optgroup>
              )}
              <optgroup label={deptGroups.frequent.length ? 'All other departments' : 'Departments'}>
                {deptGroups.rest.map(deptOption)}
              </optgroup>
            </select>
            {deptError && <span className="text-[12px] text-red-500">{deptError}</span>}
            {deptHint && <span className="text-[12px] text-amber-500">{deptHint}</span>}
            {deptRow?.missing.length > 0 && (
              <span className="text-[12px] text-amber-500">
                “{deptRow.label}” isn’t set up in {deptRow.missing.join(', ')}. See the Departments tab.
              </span>
            )}
            {deptFailedStores.length > 0 && (
              <span className="text-[12px] text-[var(--text-muted)]">
                Couldn’t load departments for {deptFailedStores.map(f => f.store).join(', ')}.
              </span>
            )}
          </Field>
          {!batch && <Field label="Item name">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Zig Zag Orange"
              className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text" />
          </Field>}
          {!batch && <Field label="Size (optional)">
            <input value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. 1 ct"
              className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text" />
          </Field>}
          <Field label="Cost (optional)">
            <div className="flex items-center gap-1">
              <span className="text-[var(--text-muted)]">$</span>
              <input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0.00"
                className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text" />
            </div>
          </Field>
        </div>
      </div>

      {/* Stores + per-store price */}
      <div className="rounded-xl border border-sw-border bg-sw-card p-4 h-fit lg:sticky lg:top-4">
        <h3 className="text-sw-text text-[15px] font-semibold mb-1">Add to stores</h3>
        <p className="text-sw-sub text-[12px] mb-3">Tick stores and set each price. Use “set all” when the price is the same.</p>

        {carried.length > 0 && (
          <div className="mb-3 rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[12px]">
            {carried.length === stores.length ? (
              <span className="text-green-500 font-semibold">Already in every store. Change a price below to update it.</span>
            ) : (
              <>
                <div className="text-sw-sub mb-1">
                  Already in {carried.length} store{carried.length === 1 ? '' : 's'}. The others are pre-filled with
                  {priceOptions.length > 1 ? ' the most common price.' : ' the same price.'} You can change any price, including stores that already have it.
                </div>
                {priceOptions.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {priceOptions.map(o => (
                      <button key={o.cents} type="button" onClick={() => applyPriceToAll((o.cents / 100).toFixed(2))}
                        title={`Use ${fmtCents(o.cents)} at every store`}
                        className="rounded-md border border-sw-border bg-sw-card px-2 py-0.5 text-[12px] text-sw-text hover:border-amber-500">
                        <span className="font-mono font-semibold">{fmtCents(o.cents)}</span>
                        <span className="text-[var(--text-muted)]"> · {o.stores.join(', ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <span className="text-[var(--text-muted)] text-[13px]">$</span>
          <input value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} inputMode="decimal" placeholder="set all to"
            onKeyDown={e => { if (e.key === 'Enter') applyBulkPrice(); }}
            style={{ width: '6rem' }} className="w-24 rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text" />
          <Button variant="secondary" onClick={applyBulkPrice} disabled={!bulkPrice.trim()}>Set all</Button>
        </div>

        <ul className="space-y-2 mb-4">
          {stores.map(s => {
            const st = storeStatus[s.id];
            if (st?.status === 'has') {
              const changed = changes.some(c => c.store_id === s.id);
              return (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-center text-green-500" title="Already in this store">✓</span>
                  <span className="flex-1 min-w-0 truncate text-[13px] text-sw-text" title={s.name}>
                    {s.name || s.id}
                    <span className={`block text-[12px] ${changed ? 'text-amber-500' : 'text-green-500'}`}>
                      {changed
                        ? `In system · was ${Number.isFinite(st.cents) ? fmtCents(st.cents) : '—'}, will update`
                        : 'In system'}
                    </span>
                  </span>
                  <span className="text-[var(--text-muted)] text-[13px]">$</span>
                  <input value={prices[s.id] ?? ''} onChange={e => setPrice(s.id, e.target.value)} inputMode="decimal" placeholder="0.00"
                    style={{ width: '5rem' }} className={`w-20 rounded-md border bg-sw-bg px-2 py-1 text-[13px] text-sw-text ${changed ? 'border-amber-500' : 'border-sw-border'}`} />
                </li>
              );
            }
            const checked = sel.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4 shrink-0 accent-amber-500" checked={checked} onChange={() => toggleSel(s.id)} />
                <span className="flex-1 min-w-0 truncate text-[13px] text-sw-text" title={s.name}>{s.name || s.id}</span>
                <span className="text-[var(--text-muted)] text-[13px]">$</span>
                <input value={prices[s.id] ?? ''} onChange={e => setPrice(s.id, e.target.value)} inputMode="decimal" placeholder="0.00"
                  disabled={!checked}
                  style={{ width: '5rem' }} className={`w-20 rounded-md border bg-sw-bg px-2 py-1 text-[13px] text-sw-text ${checked ? 'border-sw-border' : 'border-sw-border/40 opacity-50'}`} />
                {st?.status === 'unknown' && (
                  <span className="text-[12px] text-amber-500" title="This store could not be checked. It may already have the item.">couldn’t check</span>
                )}
              </li>
            );
          })}
        </ul>

        {deptMissingIn.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-500">
            The “{deptRow.label}” department isn’t set up in {deptMissingIn.map(s => s.name).join(', ')}, so NRS would
            reject the item there. Add the department in NRS for {deptMissingIn.length === 1 ? 'that store' : 'those stores'}, or
            <button type="button" onClick={untickDeptMissing} className="ml-1 underline font-semibold">untick {deptMissingIn.length === 1 ? 'it' : 'them'}</button>.
          </div>
        )}

        {batch && batchDeptMissing.length > 0 && deptMissingIn.length === 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
            The “{deptRow.label}” department isn’t set up in {batchDeptMissing.map(s => s.name).join(', ')}. Add it in NRS or untick {batchDeptMissing.length === 1 ? 'that store' : 'those stores'}.
          </div>
        )}
        {batch ? (
          <Button variant="primary" className="w-full" disabled={!batchCanSubmit || batchSubmitting} onClick={submitBatch}>
            {batchSubmitting ? 'Adding items…' : batchBusy ? 'Reading photos…' : `Add ${batchNew} item${batchNew === 1 ? '' : 's'} to ${batchSelected.length} store${batchSelected.length === 1 ? '' : 's'}`}
          </Button>
        ) : (
          <Button variant="primary" className="w-full" disabled={!canSubmit || submitting} onClick={submit}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        )}
        {batch && !batchCanSubmit && !batchBusy && (
          <p className="mt-2 text-[12px] text-sw-dim">
            {!deptRow ? 'Pick a department. ' : ''}
            {batchRows.some(r => !r.upc.trim() || !r.name.trim()) ? 'Every item needs a UPC and a name. ' : ''}
            {batchSelected.length === 0 ? 'Tick at least one store. ' : ''}
            {batchSelected.some(s => !validPrice(prices[s.id])) ? 'Set a price for each ticked store.' : ''}
          </p>
        )}

        {result?.batch && (
          <div className="mt-4">
            <Alert type={result.batch.failed ? 'warning' : 'success'}>
              {[
                result.batch.items ? `Added ${result.batch.items} item${result.batch.items === 1 ? '' : 's'} (${result.batch.stores} store listing${result.batch.stores === 1 ? '' : 's'})` : 'Nothing was added',
                result.batch.skipped ? `${result.batch.skipped} already in every ticked store` : '',
                result.batch.failed ? `${result.batch.failed} failed — still in the list to retry` : '',
              ].filter(Boolean).join(', ')}.
              {result.batch.errors.length > 0 && (
                <ul className="mt-2 text-[12px] list-disc pl-4">
                  {result.batch.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </Alert>
          </div>
        )}
        {result && !result.batch && (
          <div className="mt-4">
            {result.error && <Alert type="error">{result.error}</Alert>}
            {(result.created > 0 || result.updated > 0 || result.failed > 0) && (
              <Alert type={result.failed ? 'warning' : 'success'}>
                {[
                  result.created ? `Added “${result.name}” to ${result.created} store${result.created === 1 ? '' : 's'}` : '',
                  result.updated ? `updated the price in ${result.updated} store${result.updated === 1 ? '' : 's'}` : '',
                  result.failed ? `${result.failed} failed` : '',
                ].filter(Boolean).join(', ')}.
                {result.errors?.length > 0 && (
                  <ul className="mt-2 text-[12px] list-disc pl-4">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </Alert>
            )}
          </div>
        )}
      </div>

      {scanOpen && (
        <BarcodeScanModal
          onDetected={(code) => { setUpc(code); setScanOpen(false); lookupUpc(code); }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}

// ── Camera barcode scanner lives in components/BarcodeScanner.js ─────────
