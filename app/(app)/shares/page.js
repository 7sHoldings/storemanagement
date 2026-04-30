'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Modal, Field, Button, Loading, Alert, ConfirmModal, StoreBadge } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, dayLabel, today } from '@/lib/utils';
import { logActivity, fmtMoney, shortDate } from '@/lib/activity';

// Per-store ownership tracker. Each store has 0+ shareholders with a
// percentage; the page shows what each shareholder is owed (their %
// of the store's all-time net profit) minus payouts already made.
export default function SharesPage() {
  const { supabase, isOwner, profile } = useAuth();
  const [stores, setStores] = useState([]);
  const [shareholders, setShareholders] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [storeProfits, setStoreProfits] = useState({}); // { store_id: net_profit }
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Modal state
  const [editing, setEditing] = useState(null);   // { mode: 'shareholder', store, row? }
  const [payoutModal, setPayoutModal] = useState(null); // { shareholder }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const blankShareholder = { name: '', share_pct: '', notes: '', is_active: true };
  const blankPayout = { date: today(), amount: '', payment_method: 'cash', notes: '' };
  const [shForm, setShForm] = useState(blankShareholder);
  const [poForm, setPoForm] = useState(blankPayout);

  const load = async () => {
    setLoading(true);
    const [
      { data: st },
      { data: sh },
      { data: po },
      { data: sales },
      { data: purch },
      { data: exps },
    ] = await Promise.all([
      supabase.from('stores').select('id, name, color').eq('is_active', true).order('created_at'),
      supabase.from('store_shareholders').select('*').order('created_at'),
      supabase.from('share_payouts').select('*').order('date', { ascending: false }),
      supabase.from('daily_sales').select('store_id, total_sales, net_sales'),
      supabase.from('purchases').select('store_id, total_cost, unit_cost'),
      supabase.from('expenses').select('store_id, amount'),
    ]);
    // Compute net profit per store (revenue − purchases − expenses).
    const profits = {};
    (st || []).forEach(s => { profits[s.id] = 0; });
    (sales || []).forEach(r => { profits[r.store_id] = (profits[r.store_id] || 0) + (r.total_sales ?? r.net_sales ?? 0); });
    (purch || []).forEach(r => { profits[r.store_id] = (profits[r.store_id] || 0) - (r.total_cost || r.unit_cost || 0); });
    (exps || []).forEach(r => { profits[r.store_id] = (profits[r.store_id] || 0) - (r.amount || 0); });
    setStores(st || []);
    setShareholders(sh || []);
    setPayouts(po || []);
    setStoreProfits(profits);
    setLoading(false);
  };
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  // ── Aggregated view ─────────────────────────────────────
  const grouped = useMemo(() => {
    const payoutsBySh = {};
    payouts.forEach(p => { payoutsBySh[p.shareholder_id] = (payoutsBySh[p.shareholder_id] || 0) + (p.amount || 0); });
    const lastPayoutBySh = {};
    payouts.forEach(p => {
      const prev = lastPayoutBySh[p.shareholder_id];
      if (!prev || (p.date && p.date > prev)) lastPayoutBySh[p.shareholder_id] = p.date;
    });
    return stores.map(store => {
      const profit = storeProfits[store.id] || 0;
      const list = shareholders
        .filter(h => h.store_id === store.id)
        .map(h => {
          const owed = +(profit * (Number(h.share_pct) || 0) / 100).toFixed(2);
          const paid = +(payoutsBySh[h.id] || 0).toFixed(2);
          const remaining = +(owed - paid).toFixed(2);
          return { ...h, owed, paid, remaining, lastPayout: lastPayoutBySh[h.id] || null };
        })
        .sort((a, b) => (a.is_active === b.is_active ? a.name.localeCompare(b.name) : (a.is_active ? -1 : 1)));
      const allocated = list.filter(h => h.is_active).reduce((s, h) => s + (Number(h.share_pct) || 0), 0);
      return { store, profit, shareholders: list, allocatedPct: allocated };
    });
  }, [stores, shareholders, payouts, storeProfits]);

  const grandTotals = useMemo(() => {
    let owed = 0, paid = 0;
    grouped.forEach(g => g.shareholders.forEach(h => { owed += h.owed; paid += h.paid; }));
    const totalProfit = stores.reduce((s, st) => s + (storeProfits[st.id] || 0), 0);
    return { owed: +owed.toFixed(2), paid: +paid.toFixed(2), remaining: +(owed - paid).toFixed(2), totalProfit };
  }, [grouped, stores, storeProfits]);

  // ── Shareholder add/edit ────────────────────────────────
  const openAddSh = (store) => {
    setEditing({ mode: 'shareholder', store, row: null });
    setShForm({ ...blankShareholder });
  };
  const openEditSh = (store, row) => {
    setEditing({ mode: 'shareholder', store, row });
    setShForm({
      name: row.name || '',
      share_pct: String(row.share_pct ?? ''),
      notes: row.notes || '',
      is_active: row.is_active !== false,
    });
  };
  const closeEditing = () => { setEditing(null); setShForm(blankShareholder); };

  const handleSaveSh = async () => {
    if (!editing) return;
    if (!shForm.name.trim()) { setMsg('Name required'); setTimeout(() => setMsg(''), 2500); return; }
    const pct = parseFloat(shForm.share_pct);
    if (!(pct >= 0 && pct <= 100)) { setMsg('Share % must be between 0 and 100'); setTimeout(() => setMsg(''), 2500); return; }
    setSaving(true);
    const payload = {
      store_id: editing.store.id,
      name: shForm.name.trim(),
      share_pct: pct,
      notes: (shForm.notes || '').trim() || null,
      is_active: !!shForm.is_active,
    };
    const { error } = editing.row
      ? await supabase.from('store_shareholders').update(payload).eq('id', editing.row.id)
      : await supabase.from('store_shareholders').insert(payload);
    setSaving(false);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); return; }
    await logActivity(supabase, profile, {
      action: editing.row ? 'update' : 'create',
      entityType: 'store_shareholder',
      entityId: editing.row?.id,
      description: `${profile?.name} ${editing.row ? 'updated' : 'added'} shareholder ${payload.name} (${pct}%) on ${editing.store.name}`,
      storeName: editing.store.name,
    });
    setMsg('Saved');
    setTimeout(() => setMsg(''), 2000);
    closeEditing();
    load();
  };

  // ── Delete shareholder ──────────────────────────────────
  const handleDeleteSh = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('store_shareholders').delete().eq('id', confirmDelete.id);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); }
    else {
      await logActivity(supabase, profile, {
        action: 'delete', entityType: 'store_shareholder', entityId: confirmDelete.id,
        description: `${profile?.name} removed shareholder ${confirmDelete.name}`,
        metadata: { deleted: confirmDelete },
      });
    }
    setConfirmDelete(null);
    load();
  };

  // ── Payouts ─────────────────────────────────────────────
  const openPayout = (shareholder) => {
    setPayoutModal({ shareholder });
    setPoForm({ ...blankPayout });
  };
  const closePayout = () => { setPayoutModal(null); setPoForm(blankPayout); };

  const handleSavePayout = async () => {
    if (!payoutModal) return;
    const amt = parseFloat(poForm.amount);
    if (!(amt > 0)) { setMsg('Enter a positive amount'); setTimeout(() => setMsg(''), 2500); return; }
    if (!poForm.date) { setMsg('Date required'); setTimeout(() => setMsg(''), 2500); return; }
    setSaving(true);
    const payload = {
      shareholder_id: payoutModal.shareholder.id,
      amount: amt,
      date: poForm.date,
      payment_method: poForm.payment_method || null,
      notes: (poForm.notes || '').trim() || null,
      created_by: profile?.id || null,
    };
    const { error } = await supabase.from('share_payouts').insert(payload);
    setSaving(false);
    if (error) { setMsg(error.message); setTimeout(() => setMsg(''), 4000); return; }
    await logActivity(supabase, profile, {
      action: 'create', entityType: 'share_payout',
      description: `${profile?.name} paid ${fmtMoney(amt)} to ${payoutModal.shareholder.name} on ${shortDate(poForm.date)}`,
    });
    setMsg('Payout recorded');
    setTimeout(() => setMsg(''), 2000);
    closePayout();
    load();
  };

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Shares" subtitle="Per-store ownership split. Track each partner's share, payouts, and remaining balance." />
      {msg && <Alert type={msg === 'Saved' || msg === 'Payout recorded' ? 'success' : 'error'}>{msg}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard label="Total Net Profit" value={fmt(grandTotals.totalProfit)} sub="All stores · all-time" icon="📈" variant="success" />
        <V2StatCard label="Owed to Shareholders" value={fmt(grandTotals.owed)} sub="Sum of all shares earned" icon="🤝" variant="info" />
        <V2StatCard label="Already Paid" value={fmt(grandTotals.paid)} sub={`${payouts.length} payout${payouts.length === 1 ? '' : 's'}`} icon="💵" />
        <V2StatCard label="Remaining" value={fmt(grandTotals.remaining)} sub="Owed − Paid" icon="🏦" variant={grandTotals.remaining < 0 ? 'danger' : 'warning'} />
      </div>

      <div className="space-y-4">
        {grouped.map(g => (
          <div key={g.store.id} className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <StoreBadge name={g.store.name} color={g.store.color} />
                <span className="text-[var(--text-secondary)] text-[11px]">
                  Net Profit: <span className="text-[var(--text-primary)] font-mono font-bold">{fmt(g.profit)}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-mono font-bold ${
                  Math.abs(g.allocatedPct - 100) < 0.01 ? 'text-[var(--color-success)]' :
                  g.allocatedPct > 100 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'
                }`} title={
                  Math.abs(g.allocatedPct - 100) < 0.01 ? 'Fully allocated'
                  : g.allocatedPct > 100 ? 'Over-allocated — sum exceeds 100%'
                  : 'Under-allocated — some equity unassigned'
                }>
                  {g.allocatedPct.toFixed(1)}% allocated
                </span>
                <Button onClick={() => openAddSh(g.store)} className="!text-[11px] !py-1">+ Add Shareholder</Button>
              </div>
            </div>

            {g.shareholders.length === 0 ? (
              <div className="px-4 py-6 text-center text-[var(--text-muted)] text-[12px]">
                No shareholders yet. Click + Add Shareholder to set up the split.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {g.shareholders.map(h => (
                  <div key={h.id} className={`px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${!h.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-primary)] text-[14px] font-bold">{h.name}</span>
                        <span className="text-[var(--color-info)] font-mono text-[11px] font-semibold">{Number(h.share_pct).toFixed(2)}%</span>
                        {!h.is_active && <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Inactive</span>}
                      </div>
                      {h.notes && <div className="text-[var(--text-muted)] text-[11px] mt-0.5">{h.notes}</div>}
                      {h.lastPayout && <div className="text-[var(--text-muted)] text-[10px] mt-0.5">Last payout: {dayLabel(h.lastPayout)}</div>}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[11px] text-right min-w-[280px]">
                      <div>
                        <div className="text-[var(--text-muted)] uppercase text-[9px] font-bold">Earned</div>
                        <div className="font-mono font-bold text-[var(--text-primary)]">{fmt(h.owed)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)] uppercase text-[9px] font-bold">Paid</div>
                        <div className="font-mono font-bold text-[var(--color-info)]">{fmt(h.paid)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--text-muted)] uppercase text-[9px] font-bold">Remaining</div>
                        <div className={`font-mono font-bold ${h.remaining > 0.01 ? 'text-[var(--color-warning)]' : h.remaining < -0.01 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                          {fmt(h.remaining)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 ml-2">
                      <button
                        onClick={() => openPayout(h)}
                        disabled={!h.is_active}
                        className="px-3 rounded-md bg-sw-greenD border border-sw-green/30 text-[var(--color-success)] text-[12px] font-semibold disabled:opacity-40"
                        style={{ minHeight: 32 }}
                      >
                        💵 Pay
                      </button>
                      <button
                        onClick={() => openEditSh(g.store, h)}
                        className="px-3 rounded-md bg-sw-blueD border border-sw-blue/30 text-[var(--color-info)] text-[12px] font-semibold"
                        style={{ minHeight: 32 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDelete(h)}
                        className="px-3 rounded-md bg-sw-redD border border-sw-red/30 text-[var(--color-danger)] text-[12px] font-semibold"
                        style={{ minHeight: 32 }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recent payouts */}
      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mt-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">Recent Payouts</h3>
        </div>
        {payouts.length === 0 ? (
          <div className="px-4 py-6 text-center text-[var(--text-muted)] text-[12px]">No payouts yet.</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {payouts.slice(0, 25).map(p => {
              const sh = shareholders.find(h => h.id === p.shareholder_id);
              const st = stores.find(s => s.id === sh?.store_id);
              return (
                <div key={p.id} className="px-4 py-2 flex items-center justify-between text-[12px] gap-2 flex-wrap">
                  <span className="text-[var(--text-secondary)]">{dayLabel(p.date)}</span>
                  <span className="text-[var(--text-primary)] font-semibold">{sh?.name || '—'}</span>
                  <span className="text-[var(--text-muted)]">{st?.name || '—'}</span>
                  <span className="text-[var(--text-muted)]">{p.payment_method || '—'}</span>
                  <span className="font-mono font-bold text-[var(--color-info)] ml-auto">{fmt(p.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Shareholder modal */}
      {editing && editing.mode === 'shareholder' && (
        <Modal title={editing.row ? `Edit ${editing.row.name}` : `Add Shareholder · ${editing.store.name}`} onClose={closeEditing}>
          <Field label="Name">
            <input type="text" value={shForm.name} onChange={e => setShForm({ ...shForm, name: e.target.value })} placeholder="Shareholder name" />
          </Field>
          <Field label="Share %">
            <input type="number" min="0" max="100" step="0.001" value={shForm.share_pct}
              onChange={e => setShForm({ ...shForm, share_pct: e.target.value.replace(/^-/, '') })}
              placeholder="e.g. 33.33" />
          </Field>
          <Field label="Notes">
            <input type="text" value={shForm.notes} onChange={e => setShForm({ ...shForm, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <label className="flex items-center gap-2 text-[12px] mb-3 cursor-pointer">
            <input type="checkbox" checked={!!shForm.is_active} onChange={e => setShForm({ ...shForm, is_active: e.target.checked })} />
            <span className="text-[var(--text-secondary)]">Active (uncheck to hide without losing payout history)</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeEditing}>Cancel</Button>
            <Button onClick={handleSaveSh} disabled={saving}>{saving ? 'Saving…' : editing.row ? 'Update' : 'Save'}</Button>
          </div>
        </Modal>
      )}

      {/* Payout modal */}
      {payoutModal && (
        <Modal title={`Pay ${payoutModal.shareholder.name}`} onClose={closePayout}>
          <Field label="Date">
            <input type="date" value={poForm.date} onChange={e => setPoForm({ ...poForm, date: e.target.value })} />
          </Field>
          <Field label="Amount">
            <input type="number" min="0" step="0.01" value={poForm.amount}
              onChange={e => setPoForm({ ...poForm, amount: e.target.value.replace(/^-/, '') })}
              placeholder="0.00" />
          </Field>
          <Field label="Payment Method">
            <select value={poForm.payment_method} onChange={e => setPoForm({ ...poForm, payment_method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })} placeholder="Optional" />
          </Field>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={closePayout}>Cancel</Button>
            <Button onClick={handleSavePayout} disabled={saving}>{saving ? 'Saving…' : 'Record Payout'}</Button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${confirmDelete.name}?`}
          message="This removes the shareholder and all their recorded payouts. This cannot be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDeleteSh}
          confirmVariant="danger"
        />
      )}
    </div>
  );
}
