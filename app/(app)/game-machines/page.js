'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { DataTable, PageHeader, Modal, Field, Button, Loading, Alert, ConfirmModal, DateBar, useDateRange } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, dayLabel, today, downloadCSV } from '@/lib/utils';
import { logActivity, fmtMoney, shortDate } from '@/lib/activity';
import { compressImage, uploadReceipt } from '@/lib/storage';
import ImageGallery from '@/components/ImageGallery';

// Convert a public receipts URL back to its storage path so we can delete it.
const pathFromReceiptUrl = (url) => {
  if (!url) return null;
  const m = String(url).match(/\/receipts\/(.+?)(?:\?.*)?$/);
  return m ? decodeURIComponent(m[1]) : null;
};

// Per-store ledger of cash collected from in-store game machines.
// Counts toward the "cash in hand" pool that Profit Take Out can pull
// from (with source='game_machines'), but never toward sales revenue.
export default function GameMachinesPage() {
  const { supabase, isOwner, profile } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thismonth');
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [takeouts, setTakeouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const blank = { date: today(), date_to: today(), store_id: '', amount: '', notes: '' };
  const [form, setForm] = useState(blank);

  // Receipt / photo attachments
  const [pendingReceipts, setPendingReceipts] = useState([]); // [{ id, file, preview }]
  const [existingReceipts, setExistingReceipts] = useState([]); // [url] kept from editRow
  const [removedReceipts, setRemovedReceipts] = useState([]);   // [url] removed during this edit
  const [galleryImages, setGalleryImages] = useState(null);
  const receiptCameraRef = useRef(null);
  const receiptLibraryRef = useRef(null);
  const resetReceipts = () => { setPendingReceipts([]); setExistingReceipts([]); setRemovedReceipts([]); };

  const handleReceiptPick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const additions = await Promise.all(files.map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ id: `pend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file, preview: ev.target.result });
      reader.readAsDataURL(file);
    })));
    setPendingReceipts(prev => [...prev, ...additions]);
    e.target.value = '';
  };
  const removePendingReceipt = (id) => setPendingReceipts(prev => prev.filter(p => p.id !== id));
  const removeExistingReceipt = (url) => {
    setExistingReceipts(prev => prev.filter(u => u !== url));
    setRemovedReceipts(prev => [...prev, url]);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: gm }, { data: st }, { data: tk }] = await Promise.all([
      supabase.from('game_machine_collections').select('*').order('date', { ascending: false }),
      supabase.from('stores').select('id, name').order('created_at'),
      supabase.from('profit_takeouts').select('amount, source').eq('source', 'game_machines'),
    ]);
    setRows(gm || []);
    setStores(st || []);
    setTakeouts(tk || []);
    setLoading(false);
  };
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  const storeName = (id) => stores.find(s => s.id === id)?.name || '—';

  // Collections in the active date range — drives the table and the
  // "Collected (Range)" stat. "Available Cash" stays all-time because it's
  // a cumulative pool: total ever collected minus everything ever taken out.
  const filteredRows = useMemo(
    () => rows.filter(r => r.date >= range.start && r.date <= range.end),
    [rows, range.start, range.end]
  );

  const stats = useMemo(() => {
    const totalAllTime = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const totalRange = filteredRows.reduce((s, r) => s + (r.amount || 0), 0);
    const takenOut = takeouts.reduce((s, r) => s + (r.amount || 0), 0);
    const available = totalAllTime - takenOut;
    const monthKey = new Date().toISOString().slice(0, 7);
    const thisMonth = rows
      .filter(r => (r.date || '').slice(0, 7) === monthKey)
      .reduce((s, r) => s + (r.amount || 0), 0);
    const lastDate = rows[0]?.date || null;
    return { totalAllTime, totalRange, takenOut, available, thisMonth, lastDate, countRange: filteredRows.length, countAll: rows.length };
  }, [rows, filteredRows, takeouts]);

  const openAdd = () => {
    setEditRow(null);
    setForm({ ...blank, store_id: stores[0]?.id || '' });
    resetReceipts();
    setModal('add');
  };
  const openEdit = (r) => {
    setEditRow(r);
    setForm({
      date: r.date,
      date_to: r.date_to || r.date,
      store_id: r.store_id,
      amount: String(r.amount || ''),
      notes: r.notes || '',
    });
    setPendingReceipts([]);
    setExistingReceipts(Array.isArray(r.receipt_urls) ? r.receipt_urls : []);
    setRemovedReceipts([]);
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditRow(null); resetReceipts(); };

  const handleSave = async () => {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) { setMsg('Enter an amount.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.store_id) { setMsg('Select a store.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.date) { setMsg('From date required.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.date_to) { setMsg('To date required.'); setTimeout(() => setMsg(''), 2500); return; }
    if (form.date_to < form.date) { setMsg('To date must be on or after the From date.'); setTimeout(() => setMsg(''), 3000); return; }
    setSaving(true);
    try {
      const sName = storeName(form.store_id);

      // Upload any newly attached photos first.
      const newUrls = [];
      for (const p of pendingReceipts) {
        try {
          const compressed = await compressImage(p.file);
          const { url } = await uploadReceipt(supabase, compressed, { storeName: sName, date: form.date, kind: 'game_machine' });
          if (url) newUrls.push(url);
        } catch (upErr) {
          console.error('[game-machines] receipt upload failed:', upErr);
        }
      }
      // Delete any photos the user removed during this edit.
      const removedPaths = removedReceipts.map(pathFromReceiptUrl).filter(Boolean);
      if (removedPaths.length) {
        const { error: rmErr } = await supabase.storage.from('receipts').remove(removedPaths);
        if (rmErr) console.warn('[game-machines] receipt cleanup failed (non-fatal):', rmErr);
      }

      const payload = {
        store_id: form.store_id,
        date: form.date,
        date_to: form.date_to,
        amount,
        notes: (form.notes || '').trim() || null,
        collected_by: profile?.id || null,
        receipt_urls: [...existingReceipts, ...newUrls],
      };
      const { error } = editRow
        ? await supabase.from('game_machine_collections').update(payload).eq('id', editRow.id)
        : await supabase.from('game_machine_collections').insert(payload);
      if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); return; }
      await logActivity(supabase, profile, {
        action: editRow ? 'update' : 'create',
        entityType: 'game_machine_collection',
        entityId: editRow?.id,
        description: `${profile?.name} ${editRow ? 'updated' : 'recorded'} game machine collection of ${fmtMoney(amount)} at ${sName} for ${shortDate(form.date)}${form.date_to && form.date_to !== form.date ? ` – ${shortDate(form.date_to)}` : ''}`,
        storeName: sName,
      });
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('game_machine_collections').delete().eq('id', confirmDelete.id);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); }
    else {
      await logActivity(supabase, profile, {
        action: 'delete',
        entityType: 'game_machine_collection',
        entityId: confirmDelete.id,
        description: `${profile?.name} deleted game machine collection of ${fmtMoney(confirmDelete.amount)} at ${storeName(confirmDelete.store_id)} on ${shortDate(confirmDelete.date)}`,
        storeName: storeName(confirmDelete.store_id),
        metadata: { deleted: confirmDelete },
      });
    }
    setConfirmDelete(null);
    load();
  };

  const exportCSV = () => {
    downloadCSV(`game-machine-collections-${range.start}-to-${range.end}.csv`,
      ['Date From', 'Date To', 'Store', 'Amount', 'Notes'],
      filteredRows.map(r => [r.date, r.date_to || r.date, storeName(r.store_id), r.amount || 0, r.notes || '']));
  };

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Game Machines" subtitle="Cash collected from in-store game machines — separate from sales revenue, available for profit take-out">
        <Button variant="secondary" onClick={exportCSV} className="!text-[11px] mr-2">CSV</Button>
        <Button onClick={openAdd}>+ Collect</Button>
      </PageHeader>

      {msg && <Alert type={msg === 'Saved' ? 'success' : 'error'}>{msg}</Alert>}

      <DateBar
        preset={preset}
        onPreset={selectPreset}
        startDate={range.start}
        endDate={range.end}
        onStartChange={setStart}
        onEndChange={setEnd}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard
          label="Collected (Range)"
          value={fmt(stats.totalRange)}
          sub={`${stats.countRange} entr${stats.countRange === 1 ? 'y' : 'ies'} · all-time ${fmt(stats.totalAllTime)}`}
          icon="🎮"
          variant="success"
        />
        <V2StatCard label="Available Cash" value={fmt(stats.available)} sub={`${fmt(stats.takenOut)} taken out · cumulative pool`} icon="🏦" variant={stats.available < 0 ? 'danger' : 'info'} />
        <V2StatCard label="This Month" value={fmt(stats.thisMonth)} sub="Collected in current month" icon="📅" />
        <V2StatCard label="Last Collection" value={stats.lastDate ? shortDate(stats.lastDate) : '—'} sub={stats.lastDate ? dayLabel(stats.lastDate) : 'No collections yet'} icon="🕒" />
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">Collections · {range.start} → {range.end}</h3>
          <span className="text-[var(--text-muted)] text-[10px]">
            Total {fmt(stats.totalRange)}
          </span>
        </div>
        <DataTable
          emptyMessage={rows.length === 0
            ? "No game machine collections yet. Click + Collect to add one."
            : "No collections in this date range. Try a different range or click + Collect."}
          columns={[
            { key: 'date', label: 'Period', render: (v, r) => r.date_to && r.date_to !== v ? `${dayLabel(v)} → ${dayLabel(r.date_to)}` : dayLabel(v) },
            { key: 'store_id', label: 'Store', render: v => storeName(v) },
            { key: 'amount', label: 'Amount', align: 'right', mono: true,
              render: v => <span className="font-bold text-[var(--color-success)]">{fmt(v)}</span>,
              sortValue: r => Number(r.amount || 0) },
            { key: 'notes', label: 'Notes', render: v => v || <span className="text-[var(--text-muted)]">—</span> },
            { key: '_receipt', label: '📷', align: 'center', sortable: false, render: (_, r) => {
              const urls = Array.isArray(r.receipt_urls) ? r.receipt_urls : [];
              if (!urls.length) return <span className="text-[var(--text-muted)]">—</span>;
              return (
                <button
                  onClick={() => setGalleryImages(urls.map((u, i) => ({ image_url: u, caption: `${storeName(r.store_id)} · ${r.date}`, downloadName: `game-machine-${r.date}-${i + 1}.jpg` })))}
                  title={`View ${urls.length} receipt${urls.length > 1 ? 's' : ''}`}
                  className="inline-flex items-center gap-0.5 text-[var(--color-info)]"
                >
                  <span className="text-base">📷</span><span className="text-[10px] font-bold">{urls.length}</span>
                </button>
              );
            } },
          ]}
          rows={filteredRows}
          onEdit={openEdit}
          onDelete={(id) => setConfirmDelete(filteredRows.find(r => r.id === id))}
          isOwner={true}
        />
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit Collection' : 'Record Collection'} onClose={closeModal}>
          {/* data-theme="dark" keeps the form inputs dark even when the app
              is in light mode (the modal chrome itself is dark-only). */}
          <div data-theme="dark">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              <Field label="From Date">
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="To Date">
                <input type="date" value={form.date_to} min={form.date} onChange={e => setForm({ ...form, date_to: e.target.value })} />
              </Field>
            </div>
            <Field label="Store">
              <select value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })}>
                <option value="">Select store…</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Amount Collected">
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value.replace(/^-/, '') })}
                placeholder="0.00" />
            </Field>
            <Field label="Notes">
              <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional" />
            </Field>

            <Field label={`Photo (Optional)${(existingReceipts.length + pendingReceipts.length) > 0 ? ` — ${existingReceipts.length + pendingReceipts.length} attached` : ''}`}>
              <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <button type="button" onClick={() => receiptCameraRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-lg border-2 border-dashed border-sw-blue/40 bg-sw-blueD text-[var(--color-info)] text-[13px] font-semibold min-h-[44px]">
                  <span className="text-lg">📷</span><span>Take Photo</span>
                </button>
                <button type="button" onClick={() => receiptLibraryRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-lg border-2 border-dashed border-sw-blue/40 bg-sw-blueD text-[var(--color-info)] text-[13px] font-semibold min-h-[44px]">
                  <span className="text-lg">📁</span><span>From Library</span>
                </button>
                <input ref={receiptCameraRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptPick} className="hidden" />
                <input ref={receiptLibraryRef} type="file" accept="image/*" multiple onChange={handleReceiptPick} className="hidden" />
              </div>
              {(existingReceipts.length + pendingReceipts.length) > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {existingReceipts.map((url, i) => (
                    <div key={`ex-${i}`} className="relative">
                      <button type="button" onClick={() => setGalleryImages([...existingReceipts, ...pendingReceipts.map(p => p.preview)].map(u => ({ image_url: u })))}
                        className="block w-full aspect-square rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-black/20">
                        <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                      </button>
                      <button type="button" onClick={() => removeExistingReceipt(url)} title="Remove"
                        className="absolute top-1 right-1 w-7 h-7 rounded-md bg-sw-redD border border-sw-red/50 text-[var(--color-danger)] text-sm flex items-center justify-center">✕</button>
                    </div>
                  ))}
                  {pendingReceipts.map(p => (
                    <div key={p.id} className="relative">
                      <button type="button" onClick={() => setGalleryImages([{ image_url: p.preview }])}
                        className="block w-full aspect-square rounded-lg overflow-hidden border border-sw-blue/40 bg-black/20">
                        <img src={p.preview} alt="New receipt" className="w-full h-full object-cover" />
                      </button>
                      <span className="absolute top-1 left-1 bg-sw-blueD text-[var(--color-info)] border border-sw-blue/40 text-[9px] font-bold px-1 rounded">NEW</span>
                      <button type="button" onClick={() => removePendingReceipt(p.id)} title="Remove"
                        className="absolute top-1 right-1 w-7 h-7 rounded-md bg-sw-redD border border-sw-red/50 text-[var(--color-danger)] text-sm flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            <div className="flex justify-end gap-2 mt-2">
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : modal === 'edit' ? 'Update' : 'Save'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete collection?"
          message={`Delete the ${fmtMoney(confirmDelete.amount)} collection at ${storeName(confirmDelete.store_id)} on ${shortDate(confirmDelete.date)}?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          confirmVariant="danger"
        />
      )}

      <ImageGallery images={galleryImages || []} isOpen={!!galleryImages} onClose={() => setGalleryImages(null)} />
    </div>
  );
}
