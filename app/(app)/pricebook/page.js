'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Button, Alert, Loading, EmptyState, ConfirmModal } from '@/components/UI';

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
        subtitle="Search your live NRS pricebook and update item prices. Changes are written straight to your POS."
      />

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
        <SearchPanel storeId={storeId} pending={pending} onStage={stageEdit} />
        <ReviewPanel
          pendingList={pendingList}
          onRemove={removePending}
          onApply={() => setConfirmOpen(true)}
          applying={applying}
          result={applyResult}
        />
      </div>

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
function SearchPanel({ storeId, pending, onStage }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
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
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or UPC…"
        className="w-full rounded-lg border border-sw-border bg-sw-bg px-3 py-2 text-[14px] text-sw-text mb-3"
      />
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
            <span className="text-[11px] text-[var(--text-muted)]">Sort</span>
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
              className="w-20 rounded-md border border-sw-border bg-sw-bg px-2 py-1 text-[13px] text-sw-text"
            />
          </div>
          <Button variant="primary" onClick={applyBulk} disabled={!bulkPrice.trim()}>Apply to selected</Button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-[var(--text-muted)] hover:text-sw-text underline">Clear</button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[var(--text-muted)] border-b border-sw-border">
                <th className="py-2 pr-2 w-6">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="py-2 pr-2 font-semibold">Item</th>
                <th className="py-2 px-2 font-semibold">Current</th>
                <th className="py-2 pl-2 font-semibold">New price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => {
                const staged = pending[it.upc];
                const checked = selected.has(it.upc);
                return (
                  <tr key={it.upc} className={`border-b border-sw-border/50 ${checked ? 'bg-amber-500/5' : ''}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={checked} onChange={() => toggleRow(it.upc)} aria-label={`Select ${it.name || it.upc}`} />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="font-medium text-sw-text">{it.name || it.desc || '—'}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{it.upc}{it.dept ? ` · ${it.dept}` : ''}</div>
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-sw-text">{fmtCents(it.cents)}</td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--text-muted)]">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft[it.upc] ?? (it.cents / 100).toFixed(2)}
                          onChange={(e) => editPrice(it, e.target.value)}
                          className={`w-20 rounded-md border bg-sw-bg px-2 py-1 text-[13px] text-sw-text ${staged ? 'border-amber-500' : 'border-sw-border'}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {items.length < total && (
            <div className="flex items-center gap-2 mt-3">
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
    </div>
  );
}

// ── Basket of staged changes + apply ────────────────────────────────────
function ReviewPanel({ pendingList, onRemove, onApply, applying, result }) {
  return (
    <div className="rounded-xl border border-sw-border bg-sw-card p-4 h-fit lg:sticky lg:top-4">
      <h3 className="text-sw-text text-[15px] font-bold mb-1">Pending changes</h3>
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
                <div className="text-[11px] text-[var(--text-muted)]">
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
