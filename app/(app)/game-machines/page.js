'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { DataTable, PageHeader, Modal, Field, Button, Loading, Alert, ConfirmModal } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, dayLabel, today, downloadCSV } from '@/lib/utils';
import { logActivity, fmtMoney, shortDate } from '@/lib/activity';

// Per-store ledger of cash collected from in-store game machines.
// Counts toward the "cash in hand" pool that Profit Take Out can pull
// from (with source='game_machines'), but never toward sales revenue.
export default function GameMachinesPage() {
  const { supabase, isOwner, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [takeouts, setTakeouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const blank = { date: today(), store_id: '', amount: '', notes: '' };
  const [form, setForm] = useState(blank);

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

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const takenOut = takeouts.reduce((s, r) => s + (r.amount || 0), 0);
    const available = total - takenOut;
    const monthKey = new Date().toISOString().slice(0, 7);
    const thisMonth = rows
      .filter(r => (r.date || '').slice(0, 7) === monthKey)
      .reduce((s, r) => s + (r.amount || 0), 0);
    const lastDate = rows[0]?.date || null;
    return { total, takenOut, available, thisMonth, lastDate, count: rows.length };
  }, [rows, takeouts]);

  const openAdd = () => {
    setEditRow(null);
    setForm({ ...blank, store_id: stores[0]?.id || '' });
    setModal('add');
  };
  const openEdit = (r) => {
    setEditRow(r);
    setForm({
      date: r.date,
      store_id: r.store_id,
      amount: String(r.amount || ''),
      notes: r.notes || '',
    });
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditRow(null); };

  const handleSave = async () => {
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) { setMsg('Enter an amount.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.store_id) { setMsg('Select a store.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.date) { setMsg('Date required.'); setTimeout(() => setMsg(''), 2500); return; }
    setSaving(true);
    const payload = {
      store_id: form.store_id,
      date: form.date,
      amount,
      notes: (form.notes || '').trim() || null,
      collected_by: profile?.id || null,
    };
    const { error } = editRow
      ? await supabase.from('game_machine_collections').update(payload).eq('id', editRow.id)
      : await supabase.from('game_machine_collections').insert(payload);
    setSaving(false);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); return; }
    await logActivity(supabase, profile, {
      action: editRow ? 'update' : 'create',
      entityType: 'game_machine_collection',
      entityId: editRow?.id,
      description: `${profile?.name} ${editRow ? 'updated' : 'recorded'} game machine collection of ${fmtMoney(amount)} at ${storeName(form.store_id)} on ${shortDate(form.date)}`,
      storeName: storeName(form.store_id),
    });
    setMsg('Saved');
    setTimeout(() => setMsg(''), 2000);
    closeModal();
    load();
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
    downloadCSV('game-machine-collections.csv',
      ['Date', 'Store', 'Amount', 'Notes'],
      rows.map(r => [r.date, storeName(r.store_id), r.amount || 0, r.notes || '']));
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard label="Total Collected" value={fmt(stats.total)} sub={`${stats.count} entr${stats.count === 1 ? 'y' : 'ies'}`} icon="🎮" variant="success" />
        <V2StatCard label="Available Cash" value={fmt(stats.available)} sub={`${fmt(stats.takenOut)} taken out`} icon="🏦" variant={stats.available < 0 ? 'danger' : 'info'} />
        <V2StatCard label="This Month" value={fmt(stats.thisMonth)} sub="Collected in current month" icon="📅" />
        <V2StatCard label="Last Collection" value={stats.lastDate ? shortDate(stats.lastDate) : '—'} sub={stats.lastDate ? dayLabel(stats.lastDate) : 'No collections yet'} icon="🕒" />
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">All Collections</h3>
          <span className="text-[var(--text-muted)] text-[10px]">
            Total {fmt(stats.total)}
          </span>
        </div>
        <DataTable
          emptyMessage="No game machine collections yet. Click + Collect to add one."
          columns={[
            { key: 'date', label: 'Date', render: v => dayLabel(v) },
            { key: 'store_id', label: 'Store', render: v => storeName(v) },
            { key: 'amount', label: 'Amount', align: 'right', mono: true,
              render: v => <span className="font-bold text-[var(--color-success)]">{fmt(v)}</span>,
              sortValue: r => Number(r.amount || 0) },
            { key: 'notes', label: 'Notes', render: v => v || <span className="text-[var(--text-muted)]">—</span> },
          ]}
          rows={rows}
          onEdit={openEdit}
          onDelete={(id) => setConfirmDelete(rows.find(r => r.id === id))}
          isOwner={true}
        />
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit Collection' : 'Record Collection'} onClose={closeModal}>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </Field>
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
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : modal === 'edit' ? 'Update' : 'Save'}</Button>
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
    </div>
  );
}
