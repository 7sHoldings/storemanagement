'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { DataTable, PageHeader, Modal, Field, Button, Loading, Alert, ConfirmModal } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, dayLabel, today, downloadCSV } from '@/lib/utils';
import { logActivity, fmtMoney, shortDate } from '@/lib/activity';

// Cross-store ledger of money pulled from the business pool to invest
// or distribute elsewhere. "Available profit" = all-time net profit
// (sales − purchases − expenses) minus all takeouts to date.
export default function ProfitTakeoutPage() {
  const { supabase, isOwner, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profitMetrics, setProfitMetrics] = useState({ revenue: 0, purchases: 0, expenses: 0 });
  const [salesCashCollected, setSalesCashCollected] = useState(0);
  const [gameCashCollected, setGameCashCollected] = useState(0);
  const [modal, setModal] = useState(null);   // 'add' | 'edit' | null
  const [editRow, setEditRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const blank = { date: today(), source: 'sales', cash_amount: '', card_amount: '', destination: '', notes: '' };
  const [form, setForm] = useState(blank);

  const load = async () => {
    setLoading(true);
    const [{ data: tk }, { data: sales }, { data: purch }, { data: exps }, { data: salesCash }, { data: gameCash }] = await Promise.all([
      supabase.from('profit_takeouts').select('*').order('date', { ascending: false }),
      supabase.from('daily_sales').select('total_sales, gross_sales, net_sales'),
      supabase.from('purchases').select('total_cost, unit_cost'),
      supabase.from('expenses').select('amount'),
      supabase.from('cash_collections').select('cash_collected'),
      supabase.from('game_machine_collections').select('amount'),
    ]);
    setRows(tk || []);
    setProfitMetrics({
      revenue: (sales || []).reduce((s, r) => s + (r.total_sales ?? r.net_sales ?? 0), 0),
      purchases: (purch || []).reduce((s, r) => s + (r.total_cost || r.unit_cost || 0), 0),
      expenses: (exps || []).reduce((s, r) => s + (r.amount || 0), 0),
    });
    setSalesCashCollected((salesCash || []).reduce((s, r) => s + (r.cash_collected || 0), 0));
    setGameCashCollected((gameCash || []).reduce((s, r) => s + (r.amount || 0), 0));
    setLoading(false);
  };
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  const stats = useMemo(() => {
    const totalCash = rows.reduce((s, r) => s + (r.cash_amount || 0), 0);
    const totalCard = rows.reduce((s, r) => s + (r.card_amount || 0), 0);
    const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
    const netProfit = profitMetrics.revenue - profitMetrics.purchases - profitMetrics.expenses;
    const available = netProfit - total;
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const thisMonth = rows
      .filter(r => (r.date || '').slice(0, 7) === monthKey)
      .reduce((s, r) => s + (r.amount || 0), 0);
    // Per-source cash availability — what's left in each pool after take-outs.
    const salesTaken = rows.filter(r => (r.source || 'sales') === 'sales').reduce((s, r) => s + (r.amount || 0), 0);
    const gameTaken = rows.filter(r => r.source === 'game_machines').reduce((s, r) => s + (r.amount || 0), 0);
    const salesCashAvail = salesCashCollected - salesTaken;
    const gameCashAvail = gameCashCollected - gameTaken;
    return { totalCash, totalCard, total, netProfit, available, thisMonth, salesTaken, gameTaken, salesCashAvail, gameCashAvail };
  }, [rows, profitMetrics, salesCashCollected, gameCashCollected]);

  const openAdd = () => { setEditRow(null); setForm({ ...blank }); setModal('add'); };
  const openEdit = (r) => {
    setEditRow(r);
    setForm({
      date: r.date,
      source: r.source || 'sales',
      cash_amount: String(r.cash_amount || ''),
      card_amount: String(r.card_amount || ''),
      destination: r.destination || '',
      notes: r.notes || '',
    });
    setModal('edit');
  };
  const closeModal = () => { setModal(null); setEditRow(null); };

  const handleSave = async () => {
    const isGame = form.source === 'game_machines';
    const cash = parseFloat(form.cash_amount) || 0;
    // Game machines only produce cash — card field is hidden and forced to 0.
    const card = isGame ? 0 : (parseFloat(form.card_amount) || 0);
    const total = +(cash + card).toFixed(2);
    if (total <= 0) { setMsg(isGame ? 'Enter a cash amount.' : 'Enter a cash or card amount.'); setTimeout(() => setMsg(''), 2500); return; }
    if (!form.date) { setMsg('Date required.'); setTimeout(() => setMsg(''), 2500); return; }
    setSaving(true);
    const payload = {
      date: form.date,
      source: form.source || 'sales',
      amount: total,
      cash_amount: cash,
      card_amount: card,
      destination: (form.destination || '').trim() || null,
      notes: (form.notes || '').trim() || null,
      created_by: profile?.id || null,
    };
    const { error } = editRow
      ? await supabase.from('profit_takeouts').update(payload).eq('id', editRow.id)
      : await supabase.from('profit_takeouts').insert(payload);
    setSaving(false);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); return; }
    await logActivity(supabase, profile, {
      action: editRow ? 'update' : 'create',
      entityType: 'profit_takeout',
      entityId: editRow?.id,
      description: `${profile?.name} ${editRow ? 'updated' : 'recorded'} profit take-out of ${fmtMoney(total)} from ${form.source === 'game_machines' ? 'game machines' : 'sales'}${payload.destination ? ` → ${payload.destination}` : ''} on ${shortDate(form.date)}`,
    });
    setMsg('Saved');
    setTimeout(() => setMsg(''), 2000);
    closeModal();
    load();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('profit_takeouts').delete().eq('id', confirmDelete.id);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); }
    else {
      await logActivity(supabase, profile, {
        action: 'delete', entityType: 'profit_takeout', entityId: confirmDelete.id,
        description: `${profile?.name} deleted profit take-out of ${fmtMoney(confirmDelete.amount)} on ${shortDate(confirmDelete.date)}`,
        metadata: { deleted: confirmDelete },
      });
    }
    setConfirmDelete(null);
    load();
  };

  const exportCSV = () => {
    downloadCSV('profit-takeouts.csv',
      ['Date', 'Source', 'Cash', 'Card', 'Total', 'Destination', 'Notes'],
      rows.map(r => [r.date, r.source === 'game_machines' ? 'Game Machines' : 'Sales', r.cash_amount || 0, r.card_amount || 0, r.amount || 0, r.destination || '', r.notes || '']));
  };

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Profit Take Out" subtitle="Cash and card pulled from the business pool for other investments">
        <Button variant="secondary" onClick={exportCSV} className="!text-[11px] mr-2">CSV</Button>
        <Button onClick={openAdd}>+ Record Take Out</Button>
      </PageHeader>

      {msg && <Alert type={msg === 'Saved' ? 'success' : 'error'}>{msg}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard label="All-Time Net Profit" value={fmt(stats.netProfit)} sub="Revenue − Purchases − Expenses" icon="📈" variant="success" />
        <V2StatCard label="Total Taken Out" value={fmt(stats.total)} sub={`${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`} icon="💸" variant="warning" />
        <V2StatCard label="Available" value={fmt(stats.available)} sub="Net Profit − Total Taken Out" icon="🏦" variant={stats.available < 0 ? 'danger' : 'info'} />
        <V2StatCard label="This Month" value={fmt(stats.thisMonth)} sub="Taken out in current month" icon="📅" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <V2StatCard
          label="Cash Available — Sales"
          value={fmt(stats.salesCashAvail)}
          sub={`${fmt(salesCashCollected)} collected · ${fmt(stats.salesTaken)} taken out`}
          icon="💵"
          variant={stats.salesCashAvail < 0 ? 'danger' : 'info'}
        />
        <V2StatCard
          label="Cash Available — Game Machines"
          value={fmt(stats.gameCashAvail)}
          sub={`${fmt(gameCashCollected)} collected · ${fmt(stats.gameTaken)} taken out`}
          icon="🎮"
          variant={stats.gameCashAvail < 0 ? 'danger' : 'info'}
        />
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">All Take Outs</h3>
          <span className="text-[var(--text-muted)] text-[10px]">
            Cash {fmt(stats.totalCash)} · Card {fmt(stats.totalCard)} · Total {fmt(stats.total)}
          </span>
        </div>
        <DataTable
          emptyMessage="No take-outs recorded yet. Click + Record Take Out to add one."
          columns={[
            { key: 'date', label: 'Date', render: v => dayLabel(v) },
            { key: 'source', label: 'Source', render: v => (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                v === 'game_machines'
                  ? 'bg-sw-pinkD text-sw-pink'
                  : 'bg-sw-greenD text-[var(--color-success)]'
              }`}>
                {v === 'game_machines' ? 'Games' : 'Sales'}
              </span>
            )},
            { key: 'cash_amount', label: 'Cash', align: 'right', mono: true,
              render: v => v ? <span className="text-[var(--color-success)]">{fmt(v)}</span> : <span className="text-[var(--text-muted)]">—</span>,
              sortValue: r => Number(r.cash_amount || 0) },
            { key: 'card_amount', label: 'Card', align: 'right', mono: true,
              render: v => v ? <span className="text-[var(--color-info)]">{fmt(v)}</span> : <span className="text-[var(--text-muted)]">—</span>,
              sortValue: r => Number(r.card_amount || 0) },
            { key: 'amount', label: 'Total', align: 'right', mono: true,
              render: v => <span className="font-bold text-[var(--text-primary)]">{fmt(v)}</span>,
              sortValue: r => Number(r.amount || 0) },
            { key: 'destination', label: 'Destination', render: v => v || <span className="text-[var(--text-muted)]">—</span> },
            { key: 'notes', label: 'Notes', render: v => v || <span className="text-[var(--text-muted)]">—</span> },
          ]}
          rows={rows}
          onEdit={openEdit}
          onDelete={(id) => setConfirmDelete(rows.find(r => r.id === id))}
          isOwner={true}
        />
      </div>

      {modal && (
        <Modal title={modal === 'edit' ? 'Edit Take Out' : 'Record Take Out'} onClose={closeModal}>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Source — which money is being taken out">
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value, ...(e.target.value === 'game_machines' ? { card_amount: '' } : {}) })}>
              <option value="sales">Sales (cash collected from stores)</option>
              <option value="game_machines">Game Machines</option>
            </select>
          </Field>
          {form.source === 'game_machines' ? (
            <Field label="Cash Amount">
              <input type="number" min="0" step="0.01" value={form.cash_amount}
                onChange={e => setForm({ ...form, cash_amount: e.target.value.replace(/^-/, '') })}
                placeholder="0.00" />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cash Amount">
                <input type="number" min="0" step="0.01" value={form.cash_amount}
                  onChange={e => setForm({ ...form, cash_amount: e.target.value.replace(/^-/, '') })}
                  placeholder="0.00" />
              </Field>
              <Field label="Card Amount">
                <input type="number" min="0" step="0.01" value={form.card_amount}
                  onChange={e => setForm({ ...form, card_amount: e.target.value.replace(/^-/, '') })}
                  placeholder="0.00" />
              </Field>
            </div>
          )}
          <div className="text-[var(--text-muted)] text-[11px] -mt-1 mb-2">
            Total: <span className="text-[var(--text-primary)] font-mono font-bold">
              {fmt((parseFloat(form.cash_amount) || 0) + (form.source === 'game_machines' ? 0 : (parseFloat(form.card_amount) || 0)))}
            </span>
          </div>
          <Field label="Destination (where the money went)">
            <input type="text" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}
              placeholder="e.g. Coffee shop investment, Personal" />
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
          title="Delete take-out?"
          message={`Delete the ${fmtMoney(confirmDelete.amount)} take-out on ${shortDate(confirmDelete.date)}?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          confirmVariant="danger"
        />
      )}
    </div>
  );
}
