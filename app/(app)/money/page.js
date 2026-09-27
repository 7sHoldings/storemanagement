'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  PageHeader, Loading, DateBar, useDateRange, StorePills, Alert,
  Modal, Field, Button,
} from '@/components/UI';
import { fmt, today, storeShortName } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { profitSummary, cashSummary, safeBalance, handBalance } from '@/lib/profit';

// ── Building blocks ────────────────────────────────────────
// Each section is a card with one headline figure and the lines that make
// it up underneath. The previous layout put seven numbers at equal weight
// in a single list, which is what made it hard to read.

function Section({ title, badge, headline, headlineLabel, tone = 'plain', children, action }) {
  const headlineColour =
    tone === 'good' ? 'text-sw-green'
    : tone === 'bad' ? 'text-sw-red'
    : tone === 'cost' ? 'text-sw-red'
    : 'text-sw-text';
  return (
    <section className="rounded-xl border border-sw-border bg-sw-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-sw-sub">{title}</h2>
          {badge && <span className="text-[10px] text-sw-dim truncate">{badge}</span>}
        </div>
        {action}
      </header>
      {headline !== undefined && (
        <div className="px-4 pb-2">
          <div className={`font-mono tabular-nums text-[26px] font-bold leading-none ${headlineColour}`}>
            {headline < 0 ? '−' : ''}{fmt(Math.abs(headline))}
          </div>
          {headlineLabel && <div className="text-[11px] text-sw-dim mt-1">{headlineLabel}</div>}
        </div>
      )}
      {children && <div className="px-4 pb-3.5">{children}</div>}
    </section>
  );
}

// One make-up line. `emphasis` marks a subtotal.
function Row({ label, hint, value, sign = '', tone = 'plain', emphasis = false }) {
  // Without this a negative value with no explicit sign rendered as positive,
  // because the number is printed as an absolute. A held balance of
  // −$5,667.02 showed as $5,667.02 — the exact opposite of the truth.
  const shown = sign || (value < 0 ? '−' : '');
  const negative = value < 0 && !sign;
  const colour =
    tone === 'minus' ? 'text-sw-red'
    : tone === 'plus' ? 'text-sw-green'
    : negative ? 'text-sw-red'
    : emphasis ? 'text-sw-text'
    : 'text-sw-sub';
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${emphasis ? 'border-t border-sw-border mt-1 pt-2' : ''}`}>
      <div className="min-w-0">
        <div className={`text-[12.5px] ${emphasis ? 'font-semibold text-sw-text' : 'text-sw-sub'}`}>{label}</div>
        {hint && <div className="text-[10.5px] text-sw-dim mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className={`shrink-0 font-mono tabular-nums text-[13px] ${emphasis ? 'font-bold' : ''} ${colour}`}>
        {shown}{fmt(Math.abs(value))}
      </div>
    </div>
  );
}

// The last 12 calendar months, newest first, as { key, label, start, end }.
// Built from date parts rather than by parsing strings, and the current
// month stops at today rather than running to a future date.
function recentMonths(todayStr, count = 12) {
  const [y0, m0] = todayStr.split('-').map(Number);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${key}-${String(last).padStart(2, '0')}`;
    out.push({
      key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      start: `${key}-01`,
      // Never run past today: a month-to-date view must not claim days that
      // have not happened.
      end: end > todayStr ? todayStr : end,
    });
  }
  return out;
}

function MonthPills({ months, activeKey, onPick }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {months.map(m => (
        <button
          key={m.key}
          type="button"
          onClick={() => onPick(m)}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold border transition-colors ${
            m.key === activeKey
              ? 'bg-sw-green/15 border-sw-green/40 text-sw-green'
              : 'bg-sw-card2 border-sw-border text-sw-sub hover:text-sw-text'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default function MoneyPage() {
  const { supabase, isOwner, profile, effectiveStoreId } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd, setRange } = useDateRange('thismonth');
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState([]);
  const [summary, setSummary] = useState(null);
  const [cash, setCash] = useState(null);
  const [takeouts, setTakeouts] = useState([]);
  const [perStore, setPerStore] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Take-out form
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: today(), amount: '', destination: '', notes: '' });
  const [formErr, setFormErr] = useState('');

  useEffect(() => {
    supabase.from('stores').select('id, name').order('created_at')
      .then(({ data }) => setStores(data || []));
  }, [supabase]);

  const activeStore = isOwner ? storeId : (effectiveStoreId || '');

  const load = useCallback(async () => {
    setErr('');
    const scope = (q) => (activeStore ? q.eq('store_id', activeStore) : q);
    try {
      const [sales, purchases, expenses, collections, games, cashExp, outs,
             priorColl, priorOuts, priorCashExp, priorGames, priorDrops] = await Promise.all([
        scope(supabase.from('daily_sales')
          .select('date, store_id, gross_sales, total_sales, tax_collected, cash_sales, r2_net, card_sales, register2_card, r1_safe_drop, r2_safe_drop, short_over')
          .gte('date', range.start).lte('date', range.end)),
        scope(supabase.from('purchases').select('store_id, total_cost, unit_cost')
          .gte('week_of', range.start).lte('week_of', range.end)),
        // One figure per month, shared out by day inside profitSummary.
        scope(supabase.from('expenses').select('store_id, month, amount')
          .gte('month', range.start.slice(0, 7)).lte('month', range.end.slice(0, 7))),
        scope(supabase.from('cash_collections').select('store_id, cash_collected')
          .gte('date', range.start).lte('date', range.end)),
        scope(supabase.from('game_machine_collections').select('store_id, amount')
          .gte('date', range.start).lte('date', range.end)),
        // Expenses settled out of collected cash. Dated by expense_date, not
        // by month, since this is about when the cash actually left.
        scope(supabase.from('expenses').select('store_id, amount, expense_date')
          .eq('paid_from', 'cash_collection')
          .gte('expense_date', range.start).lte('expense_date', range.end)),
        // profit_takeouts has no store_id — takeouts belong to the group, so
        // they are only meaningful with every store in view.
        supabase.from('profit_takeouts')
          .select('id, date, amount, cash_amount, card_amount, destination, notes')
          .gte('date', range.start).lte('date', range.end)
          .order('date', { ascending: false }),

        // Everything dated BEFORE this period, for the balance carried in.
        // Cash does not belong to a month: money collected in August is
        // still there in September, and taking it out in September must not
        // make September look like it lost cash it never held.
        scope(supabase.from('cash_collections').select('cash_collected').lt('date', range.start)),
        supabase.from('profit_takeouts').select('cash_amount').lt('date', range.start),
        scope(supabase.from('expenses').select('amount')
          .eq('paid_from', 'cash_collection').lt('expense_date', range.start)),
        scope(supabase.from('game_machine_collections').select('amount').lt('date', range.start)),
        // Safe drops before the period: the safe carries forward as much as
        // the hand does, so its balance needs its own history.
        scope(supabase.from('daily_sales').select('r1_safe_drop, r2_safe_drop').lt('date', range.start)),
      ]);

      // A discarded error reads as "nothing happened" and shows a confident
      // zero, which is worse than saying so.
      for (const r of [sales, purchases, expenses, collections, games, cashExp, outs,
                       priorColl, priorOuts, priorCashExp, priorGames, priorDrops]) {
        if (r.error) throw new Error(r.error.message);
      }

      setSummary(profitSummary({
        sales: sales.data, purchases: purchases.data, expenses: expenses.data,
        collections: collections.data, games: games.data,
        start: range.start, end: range.end,
      }));
      // Takeouts are group-level, so a single-store view cannot carry a
      // meaningful held balance; the page says so rather than showing one.
      const opening = {
        safe: safeBalance({ sales: priorDrops.data, collections: priorColl.data }),
        hand: handBalance({
          collections: priorColl.data,
          games: priorGames.data,
          takeouts: activeStore ? [] : priorOuts.data,
          cashExpenses: priorCashExp.data,
        }),
      };
      setCash(cashSummary({
        sales: sales.data,
        collections: collections.data,
        takeouts: activeStore ? [] : outs.data,
        cashExpenses: cashExp.data,
        games: games.data,
        opening,
      }));
      setTakeouts(activeStore ? [] : (outs.data || []));

      const ids = [...new Set((sales.data || []).map(r => r.store_id))];
      setPerStore(ids.map(id => ({
        id,
        name: storeShortName(stores.find(s => s.id === id)?.name || 'Store'),
        ...profitSummary({
          sales: (sales.data || []).filter(r => r.store_id === id),
          purchases: (purchases.data || []).filter(r => r.store_id === id),
          expenses: (expenses.data || []).filter(r => r.store_id === id),
          collections: (collections.data || []).filter(r => r.store_id === id),
          games: (games.data || []).filter(r => r.store_id === id),
          start: range.start, end: range.end,
        }),
      })).sort((a, b) => b.totalSales - a.totalSales));
    } catch (e) {
      setErr(e.message);
      setSummary(null); setCash(null); setPerStore([]); setTakeouts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, range.start, range.end, activeStore, stores]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Sales and expenses are corrected on other pages, often in another tab.
  // Re-reading on focus means coming back to current figures rather than a
  // stale screen there is no reason to distrust.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const saveTakeout = async () => {
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormErr('Enter how much cash you took out.');
      return;
    }
    setSaving(true);
    setFormErr('');
    // Recorded as cash in full: this button is specifically for cash out of
    // the safe. Mixed cash/card takeouts are entered on Profit Take Out.
    const { error } = await supabase.from('profit_takeouts').insert({
      date: form.date,
      amount,
      cash_amount: amount,
      card_amount: 0,
      destination: form.destination || null,
      notes: form.notes || null,
      created_by: profile?.id || null,
    });
    if (error) { setFormErr(error.message); setSaving(false); return; }
    await logActivity(supabase, profile, {
      action: 'create',
      entityType: 'profit_takeouts',
      description: `${profile?.name} took out ${fmt(amount)} cash${form.destination ? ` for ${form.destination}` : ''}`,
    });
    setSaving(false);
    setModal(false);
    setForm({ date: today(), amount: '', destination: '', notes: '' });
    load();
  };

  const months = recentMonths(today());
  // A pill is lit only when the range is exactly that whole month, so a
  // custom range or a week never lights one misleadingly.
  const activeMonthKey = months.find(m => m.start === range.start && m.end === range.end)?.key;
  const periodLabel = months.find(m => m.key === activeMonthKey)?.label
    || `${range.start} → ${range.end}`;

  if (loading && !summary) return <Loading text="Working out the numbers…" />;

  const s = summary;
  const rangeLabel = range.start === range.end ? range.start : `${range.start} → ${range.end}`;

  return (
    <div className="pb-10">
      <PageHeader title="Money" subtitle="Where it came from and where it went" />

      <DateBar
        preset={preset} onPreset={selectPreset}
        startDate={range.start} endDate={range.end}
        onStartChange={setStart} onEndChange={setEnd}
      />
      <div className="mt-3">
        <MonthPills
          months={months}
          activeKey={activeMonthKey}
          onPick={(m) => setRange({ start: m.start, end: m.end })}
        />
      </div>
      {isOwner && stores.length > 1 && (
        <div className="mt-3"><StorePills stores={stores} value={storeId} onChange={setStoreId} /></div>
      )}

      {err && <div className="mt-3"><Alert type="error">Could not load the figures: {err}</Alert></div>}

      {s && cash && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* ── 1. SALES ── */}
          <Section
            title="Sales"
            badge={rangeLabel}
            headline={s.totalSales}
            headlineLabel="What the business earned, tax excluded"
          >
            <Row label="Gross sales" hint="What customers paid, sales tax included" value={s.grossSales} />
            <Row label="Sales tax" hint="The state's share — never yours" value={s.tax} sign="−" tone="minus" />
            <Row label="Total sales" value={s.totalSales} emphasis />
          </Section>

          {/* ── 2. PRODUCT BUYING ── */}
          <Section
            title="Product buying"
            headline={s.productBuying}
            headlineLabel="Stock bought in during this period"
            tone="cost"
          >
            {/* A ratio, not money — Row formats currency, so this is its own line. */}
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <div className="text-[12.5px] text-sw-sub">
                Share of sales
                <div className="text-[10.5px] text-sw-dim mt-0.5">Of every sales dollar, this went on stock</div>
              </div>
              <div className="shrink-0 font-mono tabular-nums text-[13px] text-sw-sub">
                {s.totalSales > 0 ? `${((s.productBuying / s.totalSales) * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </Section>

          {/* ── 3. EXPENSES ── */}
          <Section
            title="Expenses"
            badge={s.expensesProrated ? 'shared out by day' : undefined}
            headline={s.expenses}
            headlineLabel="Rent, wages, bills and everything else"
            tone="cost"
          >
            {s.expensesProrated && (
              <div className="text-[10.5px] text-sw-dim leading-snug">
                Expenses are recorded one figure per month, so this range
                carries its share of the month rather than all of it.
              </div>
            )}
            {cash.hand.paidInCash > 0 && (
              <Row label="Of which paid in cash" hint="Settled out of collected cash, not the bank" value={cash.hand.paidInCash} />
            )}
          </Section>

          {/* ── 4. PROFIT ── */}
          <Section
            title="Profit"
            headline={s.profit}
            headlineLabel={`${s.margin.toFixed(1)}% of what came in`}
            tone={s.profit >= 0 ? 'good' : 'bad'}
          >
            <Row label="Total sales" value={s.totalSales} />
            {s.otherIncome > 0 && (
              <Row label="Game machines" hint="Earned without selling stock" value={s.otherIncome} sign="+" tone="plus" />
            )}
            <Row label="Product buying" value={s.productBuying} sign="−" tone="minus" />
            <Row label="Expenses" value={s.expenses} sign="−" tone="minus" />
            <Row label={s.profit >= 0 ? 'Profit' : 'Loss'} value={s.profit} emphasis />
          </Section>

          {/* ── 5. CASH — THIS PERIOD, on its own ── */}
          <Section
            title={`Cash · ${periodLabel}`}
            badge="this period only"
            headline={activeStore ? undefined : cash.period.left}
            headlineLabel={activeStore ? undefined
              : cash.period.left >= 0
                ? `Left over from ${periodLabel} alone`
                : `${periodLabel} paid out more than it took in — the difference came from earlier months`}
            tone={activeStore ? 'plain' : cash.period.left >= 0 ? 'good' : 'bad'}
            action={isOwner && !activeStore && (
              <Button onClick={() => setModal(true)} className="!py-1 !px-2.5 !text-[11px] !rounded-lg">
                Take out cash
              </Button>
            )}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-sw-dim mt-1 mb-0.5">
              Came in
            </div>
            <Row label="Put in the safes by staff" value={cash.safe.putIn} />
            {cash.gameCash > 0 && (
              <Row label="Game machine cash" hint="Cash, but not a sale" value={cash.gameCash} />
            )}
            <Row label="Total came in" value={cash.period.cameIn} emphasis />

            <div className="text-[10px] font-bold uppercase tracking-wide text-sw-dim mt-3 mb-0.5">
              Went out
            </div>
            <Row label="You took out" value={cash.hand.takenOut} />
            {cash.hand.paidInCash > 0 && (
              <Row label="Paid out in cash" hint="Expenses settled from cash" value={cash.hand.paidInCash} />
            )}
            <Row label="Total went out" value={cash.period.wentOut} emphasis />

            <div className="mt-3 pt-2 border-t border-sw-border">
              <Row label={`Left from ${periodLabel}`} value={cash.period.left} emphasis />
            </div>

            {Math.abs(cash.notDropped) >= 0.01 && (
              <div className="mt-3 pt-2 border-t border-sw-border">
                <Row
                  label={cash.notDropped > 0 ? 'Missing — never reached a safe' : 'Dropped above what was rung'}
                  hint={cash.notDropped > 0
                    ? `Tills rang ${fmt(cash.salesCash)} in cash but only ${fmt(cash.safe.putIn)} was dropped. Not counted above, because it is not anywhere.`
                    : 'More dropped than rung — usually a drop covering another period'}
                  value={cash.notDropped}
                  sign={cash.notDropped > 0 ? '−' : '+'}
                  tone={cash.notDropped > 0 ? 'minus' : 'plus'}
                  emphasis
                />
              </div>
            )}
          </Section>

          {/* ── 6. CASH FROM BEFORE — kept entirely separate ── */}
          {!activeStore && (
            <Section
              title="Cash from earlier months"
              badge={`up to ${range.start}`}
              headline={cash.broughtForward}
              headlineLabel={`Already held when ${periodLabel} began`}
            >
              <Row label="In the stores' safes" value={cash.safe.opening} />
              <Row label="In your hand" value={cash.hand.opening} />
              <Row label="Total from before" value={cash.broughtForward} emphasis />
              <div className="mt-2 text-[10.5px] text-sw-dim leading-snug">
                Nothing here belongs to {periodLabel}. It is every earlier
                month added up, so taking this money out now shows against
                the period you take it, not against the month that earned it.
              </div>
            </Section>
          )}

          {/* ── 7. TOTAL NOW ── */}
          {!activeStore && (
            <Section
              title="Total cash right now"
              badge={`on ${range.end}`}
              headline={cash.totalHeld}
              headlineLabel="Everything held — in the safes and in your hand"
              tone={cash.totalHeld >= 0 ? 'plain' : 'bad'}
            >
              <Row label="From earlier months" value={cash.broughtForward} />
              <Row label={`Left from ${periodLabel}`} value={cash.period.left} sign={cash.period.left < 0 ? '−' : '+'} tone={cash.period.left < 0 ? 'minus' : 'plus'} />
              <Row label="Total cash" value={cash.totalHeld} emphasis />

              <div className="text-[10px] font-bold uppercase tracking-wide text-sw-dim mt-3 mb-0.5">
                Where it is
              </div>
              <Row label="In the stores' safes" value={cash.safe.closing} />
              <Row label="In your hand" value={cash.hand.closing} />
            </Section>
          )}

          {activeStore && (
            <Section title="Cash · this store" badge="balances need All Stores">
              <Row label="Cash sales rung up" hint="Both tills" value={cash.salesCash} />
              <Row label="Put in the safe" value={cash.safe.putIn} />
              <Row label="You collected" value={cash.safe.collected} />
              <div className="mt-3 text-[10.5px] text-sw-dim leading-snug">
                Cash taken out is recorded for the business as a whole, not per
                store, so held balances only make sense with every store in
                view. Choose All Stores to see them.
              </div>
            </Section>
          )}

          {/* ── Take-outs list ── */}
          {takeouts.length > 0 && (
            <Section title="Cash taken out" badge={`${takeouts.length} in this period`}>
              <div className="divide-y divide-sw-border">
                {takeouts.map(t => (
                  <div key={t.id} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-sw-text">{t.destination || 'Cash taken out'}</div>
                      <div className="text-[10.5px] text-sw-dim mt-0.5">
                        {t.date}{t.notes ? ` · ${t.notes}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 font-mono tabular-nums text-[13px] text-sw-red">
                      −{fmt(t.cash_amount || 0)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── By store ── */}
          {perStore.length > 1 && (
            <Section title="By store" badge="sales · buying · expenses · profit">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-sw-dim text-[10px] uppercase">
                      <th className="text-left font-semibold py-1">Store</th>
                      <th className="text-right font-semibold py-1">Sales</th>
                      <th className="text-right font-semibold py-1">Buying</th>
                      <th className="text-right font-semibold py-1">Expenses</th>
                      <th className="text-right font-semibold py-1">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perStore.map(p => (
                      <tr key={p.id} className="border-t border-sw-border">
                        <td className="py-2 pr-2 text-sw-text">{p.name}</td>
                        <td className="py-2 text-right font-mono tabular-nums">{fmt(p.totalSales)}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-sw-sub">{fmt(p.productBuying)}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-sw-sub">{fmt(p.expenses)}</td>
                        <td className={`py-2 text-right font-mono tabular-nums font-bold ${p.profit >= 0 ? 'text-sw-green' : 'text-sw-red'}`}>
                          {p.profit < 0 ? '−' : ''}{fmt(Math.abs(p.profit))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* The two halves of the sales chain must agree; if they ever do not,
          say so rather than showing a sum that does not add up. */}
      {s?.discrepancies?.length > 0 && (
        <div className="mt-3">
          <Alert type="warning">
            {s.discrepancies.length} day{s.discrepancies.length === 1 ? '' : 's'} where gross
            minus tax does not match total sales — re-run the NRS sync for{' '}
            {s.discrepancies.slice(0, 3).map(d => d.date).join(', ')}
            {s.discrepancies.length > 3 ? '…' : ''}.
          </Alert>
        </div>
      )}

      {s && (
        <div className="mt-3 text-[11px] text-sw-dim leading-relaxed">
          {s.days} day{s.days === 1 ? '' : 's'} with sales in this range. Everything here is
          worked out from the records each time the page opens, so anything you
          correct by hand shows up straight away.
        </div>
      )}

      {modal && (
        <Modal title="Take out cash" onClose={() => { setModal(false); setFormErr(''); }}>
          {formErr && <div className="mb-3"><Alert type="error">{formErr}</Alert></div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="Date">
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Amount">
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value.replace(/^-/, '') })} />
            </Field>
          </div>
          <Field label="What for">
            <input placeholder="e.g. Bank deposit, personal draw" value={form.destination}
              onChange={e => setForm({ ...form, destination: e.target.value })} />
          </Field>
          <Field label="Notes">
            <input placeholder="Optional" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="mt-2 text-[11px] text-sw-dim leading-snug">
            Comes off the running cash balance from this date on. It does not
            matter which month the cash was originally collected in — the
            balance carries forward, so taking out older money simply reduces
            what is left. Sales and profit are untouched: taking money out is
            not a cost of running the stores.
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="secondary" onClick={() => { setModal(false); setFormErr(''); }}>Cancel</Button>
            <Button onClick={saveTakeout} disabled={saving}>{saving ? 'Saving…' : 'Take out'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
