'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { DataTable, PageHeader, Modal, Field, Button, Loading, Alert, ConfirmModal, DateBar, useDateRange, StorePills, StoreBadge } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, dayLabel, today, downloadCSV } from '@/lib/utils';
import { logActivity, fmtMoney, shortDate } from '@/lib/activity';
import { chargesFromSales, buildLedger } from '@/lib/house-accounts';

// House Accounts — what each employee owes for goods taken on credit, and
// the payroll deductions (or cash repayments) that clear it.
//
// The credit is rung as cash in NRS; the database takes it back out of cash
// before reconciling the drop, so it never shows as short. It is neither
// cash nor card: it stays an open balance here until payroll deducts it.
export default function HouseAccountsPage() {
  const { supabase, isOwner, profile, effectiveStoreId } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thismonth');
  const [stores, setStores] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [sales, setSales] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState(effectiveStoreId || '');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);           // ledger entry being paid off
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const blank = { date: today(), amount: '', method: 'payroll', notes: '' };
  const [form, setForm] = useState(blank);

  const flash = (text, type = 'success') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), type === 'success' ? 2500 : 5000);
  };

  // Balances are all-time, so every house account and deduction is loaded;
  // the date range only drives the "in period" columns.
  const load = async () => {
    setLoading(true);
    const [{ data: st }, { data: profs }, { data: ds, error: dsErr }, { data: ded, error: dedErr }] = await Promise.all([
      supabase.from('stores').select('id, name, color').order('created_at'),
      supabase.from('profiles').select('id, name, username, nrs_employee_name, store_id, role'),
      supabase.from('daily_sales')
        .select('id, date, store_id, house_accounts, r1_house_account_name, r1_house_account_amount, credits, credit_receipt_urls')
        .or('r1_house_account_amount.gt.0,credits.gt.0')
        .order('date', { ascending: false }),
      supabase.from('house_account_deductions').select('*').order('date', { ascending: false }),
    ]);
    if (dsErr) flash(dsErr.message, 'error');
    if (dedErr) flash(`House account deductions are not set up yet — apply the database migration (docs/RUN-THIS-IN-SUPABASE.sql). ${dedErr.message}`, 'error');
    setStores(st || []);
    setProfiles(profs || []);
    setSales(ds || []);
    setDeductions(ded || []);
    setLoading(false);
  };
  useEffect(() => { if (isOwner) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOwner]);

  const storeById = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s])), [stores]);

  const ledger = useMemo(() => {
    const all = buildLedger({ charges: chargesFromSales(sales), deductions, profiles, range });
    return storeFilter ? all.filter(e => e.store_id === storeFilter) : all;
  }, [sales, deductions, profiles, range.start, range.end, storeFilter]);

  const totals = useMemo(() => ({
    open: ledger.reduce((s, e) => s + Math.max(e.balance, 0), 0),
    owing: ledger.filter(e => e.balance > 0.005).length,
    charged: ledger.reduce((s, e) => s + e.chargedRange, 0),
    deducted: ledger.reduce((s, e) => s + e.deductedRange, 0),
  }), [ledger]);

  const deductionsInRange = useMemo(() => ledger
    .flatMap(e => e.deductions.map(d => ({ ...d, _name: e.name })))
    .filter(d => d.date >= range.start && d.date <= range.end)
    .sort((a, b) => b.date.localeCompare(a.date)), [ledger, range.start, range.end]);

  const openDeduct = (entry) => {
    setModal(entry);
    setForm({ ...blank, amount: entry.balance > 0 ? entry.balance.toFixed(2) : '' });
  };

  const handleSave = async () => {
    const amount = Math.round((parseFloat(form.amount) || 0) * 100) / 100;
    if (amount <= 0) { flash('Enter an amount above zero.', 'error'); return; }
    if (!form.date) { flash('Date required.', 'error'); return; }
    setSaving(true);
    const payload = {
      employee_id: modal.employee_id || null,
      employee_name: modal.name,
      store_id: modal.store_id || null,
      date: form.date,
      amount,
      method: form.method,
      notes: (form.notes || '').trim() || null,
      created_by: profile?.id || null,
    };
    const { data: inserted, error } = await supabase
      .from('house_account_deductions').insert(payload).select().single();
    setSaving(false);
    if (error) { flash(error.message, 'error'); return; }
    await logActivity(supabase, profile, {
      action: 'create',
      entityType: 'house_account_deduction',
      entityId: inserted?.id,
      description: `${profile?.name} recorded ${fmtMoney(amount)} ${form.method === 'payroll' ? 'payroll deduction' : 'cash repayment'} on ${modal.name}'s house account (${shortDate(form.date)})`,
      storeName: storeById[modal.store_id]?.name,
    });
    setModal(null);
    flash('Saved');
    load();
  };

  const handleDelete = async () => {
    const d = confirmDelete;
    if (!d) return;
    const { error } = await supabase.from('house_account_deductions').delete().eq('id', d.id);
    if (error) flash(error.message, 'error');
    else {
      await logActivity(supabase, profile, {
        action: 'delete', entityType: 'house_account_deduction', entityId: d.id,
        description: `${profile?.name} deleted ${fmtMoney(d.amount)} house account deduction for ${d.employee_name} (${shortDate(d.date)})`,
        metadata: { deleted: d },
      });
    }
    setConfirmDelete(null);
    load();
  };

  const exportCSV = () => {
    downloadCSV(`house-accounts-${range.start}-to-${range.end}.csv`,
      ['Employee', 'Store', 'Charged (period)', 'Deducted (period)', 'Charged (all time)', 'Deducted (all time)', 'Open Balance'],
      ledger.map(e => [e.name, storeById[e.store_id]?.name || '', e.chargedRange, e.deductedRange, e.chargedAll, e.deductedAll, e.balance]));
  };

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  const balanceCell = (v) => (
    <span className="font-bold" style={{ color: v > 0.005 ? 'var(--color-warning)' : v < -0.005 ? 'var(--color-info)' : 'var(--text-muted)' }}>
      {v < -0.005 ? `${fmt(-v)} overpaid` : fmt(v)}
    </span>
  );

  return (
    <div>
      <PageHeader title="House Accounts" subtitle="Employee credit owed to the store, cleared at payroll">
        <Button variant="secondary" onClick={exportCSV} className="!text-[11px]">CSV</Button>
      </PageHeader>

      {msg && <Alert type={msgType}>{msg}</Alert>}

      <StorePills stores={stores} value={storeFilter} onChange={setStoreFilter} />
      <DateBar preset={preset} onPreset={selectPreset} startDate={range.start} endDate={range.end} onStartChange={setStart} onEndChange={setEnd} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard label="Open Balance" value={fmt(totals.open)} sub={`${totals.owing} employee${totals.owing === 1 ? '' : 's'} owe`} icon="🧾" variant={totals.open > 0.005 ? 'warning' : 'success'} />
        <V2StatCard label="Credit Taken (Period)" value={fmt(totals.charged)} icon="🛒" variant="info" />
        <V2StatCard label="Deducted (Period)" value={fmt(totals.deducted)} icon="💵" variant="success" />
        <V2StatCard label="Period" value={`${shortDate(range.start)} – ${shortDate(range.end)}`} icon="📅" />
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] p-3 mb-4 text-[11px] text-[var(--text-secondary)] space-y-1">
        <div className="text-[var(--text-primary)] font-bold text-[12px]">How it works</div>
        <div>1. The employee takes goods on credit. The cashier rings it as <b>cash</b> in NRS and enters it under House Account on Daily Sales with the receipt.</div>
        <div>2. The credit is taken back out of POS cash before the drop is checked, so it does <b>not</b> show as a cash short. It is neither cash nor card. It is money the employee owes.</div>
        <div>3. At payroll, pay the employee gross pay minus their open balance, then click <b>Record deduction</b>. Book the wages at the full gross amount.</div>
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">Employees</h3>
        </div>
        {ledger.length === 0 ? (
          <div className="text-[var(--text-muted)] text-[12px] text-center py-8">No house accounts recorded.</div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {ledger.map(e => {
              const st = storeById[e.store_id];
              const open = expanded === e.key;
              return (
                <div key={e.key}>
                  <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={() => setExpanded(open ? null : e.key)} className="flex-1 min-w-[160px] text-left">
                      <div className="text-[var(--text-primary)] text-[13px] font-bold">{open ? '▾' : '▸'} {e.name}</div>
                      <div className="text-[var(--text-muted)] text-[10px] mt-0.5 flex items-center gap-1.5">
                        {st && <StoreBadge name={st.name} color={st.color} />}
                        {!e.employee_id && <span>not linked to a profile</span>}
                      </div>
                    </button>
                    <div className="grid grid-cols-3 gap-4 text-right text-[11px] font-mono">
                      <div><div className="text-[var(--text-muted)] text-[9px] uppercase font-sans">Taken</div>{fmt(e.chargedRange)}</div>
                      <div><div className="text-[var(--text-muted)] text-[9px] uppercase font-sans">Deducted</div>{fmt(e.deductedRange)}</div>
                      <div><div className="text-[var(--text-muted)] text-[9px] uppercase font-sans">Owes</div>{balanceCell(e.balance)}</div>
                    </div>
                    <Button onClick={() => openDeduct(e)} className="!text-[11px]" disabled={e.balance <= 0.005}>Record deduction</Button>
                  </div>
                  {open && (
                    <div className="px-3 pb-3 grid md:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="text-[var(--text-secondary)] text-[10px] font-semibold uppercase mb-1">Credit taken · all time {fmt(e.chargedAll)}</div>
                        {e.charges.length === 0 && <div className="text-[var(--text-muted)]">None</div>}
                        {e.charges.map((c, i) => (
                          <div key={i} className="flex justify-between gap-2 py-0.5">
                            <span className="text-[var(--text-secondary)]">
                              {dayLabel(c.date)}
                              {c.receipts.map((u, j) => (
                                <a key={j} href={u} target="_blank" rel="noreferrer" className="ml-1.5 text-[var(--color-info)] underline">receipt{c.receipts.length > 1 ? ` ${j + 1}` : ''}</a>
                              ))}
                            </span>
                            <span className="font-mono text-[var(--color-warning)]">{fmt(c.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-[var(--text-secondary)] text-[10px] font-semibold uppercase mb-1">Paid back · all time {fmt(e.deductedAll)}</div>
                        {e.deductions.length === 0 && <div className="text-[var(--text-muted)]">None</div>}
                        {e.deductions.map(d => (
                          <div key={d.id} className="flex justify-between gap-2 py-0.5">
                            <span className="text-[var(--text-secondary)]">{dayLabel(d.date)} · {d.method === 'payroll' ? 'Payroll' : 'Cash'}{d.notes ? ` · ${d.notes}` : ''}</span>
                            <span className="font-mono text-[var(--color-success)]">{fmt(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-primary)] text-xs font-bold">Deductions · {range.start} → {range.end}</h3>
        </div>
        <DataTable
          emptyMessage="No deductions recorded in this period."
          columns={[
            { key: 'date', label: 'Date', render: v => dayLabel(v) },
            { key: '_name', label: 'Employee' },
            { key: 'method', label: 'How', render: v => v === 'payroll' ? 'Payroll deduction' : 'Paid in cash' },
            { key: 'amount', label: 'Amount', align: 'right', mono: true, render: v => fmt(v), sortValue: r => Number(r.amount || 0) },
            { key: 'notes', label: 'Notes', render: v => v || <span className="text-[var(--text-muted)]">—</span> },
          ]}
          rows={deductionsInRange}
          onDelete={(id) => setConfirmDelete(deductionsInRange.find(d => d.id === id))}
          isOwner={true}
        />
      </div>

      {modal && (
        <Modal title={`Record deduction — ${modal.name}`} onClose={() => setModal(null)}>
          <div className="text-[var(--text-secondary)] text-[12px] mb-3">
            Open balance: <span className="font-mono font-bold text-[var(--color-warning)]">{fmt(modal.balance)}</span>
          </div>
          <Field label="Date (payroll date)">
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Amount">
            <input type="number" min="0" step="0.01" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value.replace(/^-/, '') })} placeholder="0.00" />
          </Field>
          <Field label="How it was paid back">
            <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              <option value="payroll">Deducted from paycheck</option>
              <option value="cash">Employee paid in cash</option>
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Pay period Sep 15–28" />
          </Field>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete deduction?"
          message={`Delete the ${fmtMoney(confirmDelete.amount)} deduction for ${confirmDelete.employee_name} on ${shortDate(confirmDelete.date)}? Their open balance goes back up.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          confirmVariant="danger"
        />
      )}
    </div>
  );
}
