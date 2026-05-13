'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PageHeader, Field, Button, Loading, Modal } from '@/components/UI';

const COLORS = ['#F87171','#60A5FA','#34D399','#FBBF24','#C084FC','#FB7185','#FB923C','#38BDF8','#4ADE80','#E879F9'];

const Toggle = ({ value, onChange, label, hint }) => (
  <div className="flex items-center justify-between py-3 px-1 border-b border-[var(--border-subtle)]">
    <div>
      <div className="text-[var(--text-primary)] text-[13px] font-semibold">{label}</div>
      {hint && <div className="text-[var(--text-muted)] text-[10px]">{hint}</div>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 28, borderRadius: 14,
        background: value ? '#22C55E' : '#374151',
        display: 'flex', alignItems: 'center', padding: 3,
        cursor: 'pointer', border: 'none', transition: 'background 200ms',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 11, background: '#fff',
        transform: value ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 200ms',
      }} />
    </button>
  </div>
);

export default function SettingsPage() {
  const { supabase, isOwner } = useAuth();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editStore, setEditStore] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMsg, setTelegramMsg] = useState('');

  // Per-day hours: each day is either { open, close } or null = closed.
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const buildHoursByDay = (open, close) => DAY_KEYS.reduce((acc, d) => {
    acc[d] = { open: open || '11:00', close: close || '22:00' };
    return acc;
  }, {});
  const allDaysSame = (h) => {
    if (!h) return true;
    const ref = h.mon;
    if (!ref) return false;
    return DAY_KEYS.every(d => h[d] && h[d].open === ref.open && h[d].close === ref.close);
  };

  const blankStore = {
    name: '', color: '#60A5FA', email: '', has_register2: false, tax_rate: '8.25',
    buying_target_pct: '50',
    address: '', phone: '', is_active: true, telegram_chat_id: '',
    open_time: '11:00', close_time: '22:00',
    hours_same_for_all: true,
    hours_by_day: buildHoursByDay('11:00', '22:00'),
  };
  const [form, setForm] = useState(blankStore);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('stores').select('*').order('created_at');
    setStores(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openEdit = (s) => {
    setEditStore(s);
    const fallbackOpen = s.open_time || '11:00';
    const fallbackClose = s.close_time || '22:00';
    const savedHours = s.hours_by_day && typeof s.hours_by_day === 'object' ? s.hours_by_day : null;
    const hours_by_day = DAY_KEYS.reduce((acc, d) => {
      const v = savedHours ? savedHours[d] : undefined;
      if (v === null) acc[d] = null;
      else if (v && typeof v === 'object') acc[d] = { open: v.open || fallbackOpen, close: v.close || fallbackClose };
      else acc[d] = { open: fallbackOpen, close: fallbackClose };
      return acc;
    }, {});
    setForm({
      name: s.name || '',
      color: s.color || '#60A5FA',
      email: s.email || '',
      has_register2: !!s.has_register2,
      tax_rate: String(s.tax_rate ?? '8.25'),
      buying_target_pct: String(s.buying_target_pct ?? '50'),
      address: s.address || '',
      phone: s.phone || '',
      is_active: s.is_active !== false,
      telegram_chat_id: s.telegram_chat_id || '',
      open_time: fallbackOpen,
      close_time: fallbackClose,
      hours_same_for_all: allDaysSame(hours_by_day),
      hours_by_day,
    });
  };

  const openAdd = () => {
    setEditStore(null);
    setForm(blankStore);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setMsg('Store name is required'); setTimeout(() => setMsg(''), 2500); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      color: form.color,
      email: form.email.trim(),
      has_register2: form.has_register2,
      tax_rate: parseFloat(form.tax_rate) || 8.25,
      buying_target_pct: form.buying_target_pct === '' || isNaN(parseFloat(form.buying_target_pct)) ? 50 : parseFloat(form.buying_target_pct),
      address: form.address.trim(),
      phone: form.phone.trim(),
      is_active: form.is_active,
      telegram_chat_id: form.telegram_chat_id.trim() || null,
    };
    // Hours: persist per-day jsonb. When the "same for all days" toggle is
    // on, every day mirrors form.open_time / close_time. The legacy single
    // open_time / close_time columns track the most common pair so older
    // queries still work.
    const baseOpen  = (form.open_time || '11:00').trim();
    const baseClose = (form.close_time || '22:00').trim();
    const hours = form.hours_same_for_all
      ? buildHoursByDay(baseOpen, baseClose)
      : DAY_KEYS.reduce((acc, d) => {
          const v = form.hours_by_day?.[d];
          acc[d] = v === null
            ? null
            : { open: (v?.open || baseOpen).trim(), close: (v?.close || baseClose).trim() };
          return acc;
        }, {});
    payload.hours_by_day = hours;
    payload.open_time  = (hours.mon?.open  || baseOpen).trim();
    payload.close_time = (hours.mon?.close || baseClose).trim();
    const { error } = editStore
      ? await supabase.from('stores').update(payload).eq('id', editStore.id)
      : await supabase.from('stores').insert(payload);
    if (error) { setMsg(error.message); setSaving(false); return; }
    setSaving(false);
    setEditStore(null);
    setAddOpen(false);
    setMsg('Saved!');
    setTimeout(() => setMsg(''), 2500);
    load();
  };

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  const showModal = editStore || addOpen;

  return (
    <div>
      <PageHeader title="⚙️ Settings" subtitle={`${stores.length} stores`}>
        <Button onClick={openAdd}>+ Add Store</Button>
      </PageHeader>

      {msg && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-[12px] font-semibold ${msg === 'Saved!' ? 'bg-sw-greenD text-[var(--color-success)] border border-sw-green/30' : 'bg-sw-redD text-[var(--color-danger)] border border-sw-red/30'}`}>
          {msg}
        </div>
      )}

      <div className="space-y-3">
        {stores.map(s => (
          <div
            key={s.id}
            className={`bg-[var(--bg-elevated)] rounded-xl border p-4 ${s.is_active === false ? 'border-[var(--border-subtle)]/40 opacity-60' : 'border-[var(--border-subtle)]'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded" style={{ background: s.color }} />
                <div>
                  <div className="text-[var(--text-primary)] text-[14px] font-bold">{s.name}</div>
                  {s.email && <div className="text-[var(--text-muted)] text-[11px]">{s.email}</div>}
                </div>
              </div>
              <Button variant="secondary" onClick={() => openEdit(s)} className="!text-[11px] !px-3 !py-1.5">Edit</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
              <div>
                <div className="text-[var(--text-secondary)] font-bold uppercase text-[9px] mb-0.5">Register 2</div>
                <div className={s.has_register2 ? 'text-[var(--color-success)] font-semibold' : 'text-[var(--text-muted)]'}>
                  {s.has_register2 ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] font-bold uppercase text-[9px] mb-0.5">Tax Rate</div>
                <div className="text-[var(--text-primary)] font-mono">{s.tax_rate ?? '8.25'}%</div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] font-bold uppercase text-[9px] mb-0.5">Status</div>
                <div className={s.is_active === false ? 'text-[var(--color-danger)] font-semibold' : 'text-[var(--color-success)] font-semibold'}>
                  {s.is_active === false ? 'Inactive' : 'Active'}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] font-bold uppercase text-[9px] mb-0.5">Phone</div>
                <div className="text-[var(--text-muted)] truncate">{s.phone || '—'}</div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)] font-bold uppercase text-[9px] mb-0.5">Telegram</div>
                <div className={s.telegram_chat_id ? 'text-[var(--color-success)] font-semibold' : 'text-[var(--text-muted)]'}>
                  {s.telegram_chat_id ? '📲 Connected' : '—'}
                </div>
              </div>
            </div>
            {s.address && <div className="text-[var(--text-muted)] text-[10px] mt-2">{s.address}</div>}
          </div>
        ))}
      </div>

      {/* Telegram Notifications */}
      <div className="mt-8 mb-4">
        <h2 className="text-[var(--text-primary)] text-[16px] font-bold mb-1">📲 Telegram Notifications</h2>
        <p className="text-[var(--text-muted)] text-[11px] mb-3">Get short/over alerts sent to your Telegram after each NRS sync.</p>
        <div className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] p-4 space-y-3">
          <div className="text-[var(--text-secondary)] text-[12px] space-y-2">
            <p className="font-semibold text-[var(--text-primary)]">Setup Steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-[11px]">
              <li>Open Telegram and search for <b>@BotFather</b></li>
              <li>Send <code>/newbot</code> and follow the prompts to create a bot</li>
              <li>Copy the <b>bot token</b> you receive</li>
              <li>Start a chat with your new bot (or add it to a group)</li>
              <li>Get your <b>Chat ID</b> — send a message to your bot, then visit:<br />
                <code className="text-[10px] break-all">https://api.telegram.org/bot&lt;YOUR_TOKEN&gt;/getUpdates</code><br />
                and find <code>chat.id</code> in the response
              </li>
              <li>Add both values to your Vercel environment variables:<br />
                <code className="text-[10px]">TELEGRAM_BOT_TOKEN</code> and <code className="text-[10px]">TELEGRAM_CHAT_ID</code>
              </li>
            </ol>
          </div>
          <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="secondary"
              onClick={async () => {
                setTelegramTesting(true);
                setTelegramMsg('');
                try {
                  const res = await fetch('/api/telegram/test', { method: 'POST' });
                  const data = await res.json();
                  if (data.success) {
                    setTelegramMsg('✅ Test message sent! Check your Telegram.');
                  } else {
                    setTelegramMsg(`❌ ${data.error || data.reason || 'Failed to send'}`);
                  }
                } catch (e) {
                  setTelegramMsg(`❌ ${e.message}`);
                }
                setTelegramTesting(false);
              }}
              disabled={telegramTesting}
            >
              {telegramTesting ? 'Sending…' : '🔔 Send Test Message'}
            </Button>
            {telegramMsg && (
              <span className={`text-[11px] font-semibold ${telegramMsg.startsWith('✅') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                {telegramMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <Modal title={editStore ? `Edit — ${editStore.name}` : 'Add Store'} onClose={() => { setEditStore(null); setAddOpen(false); }}>
          <Field label="Store Name">
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 7s Vape Love - Dallas" />
          </Field>

          <Field label="Color">
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className="w-7 h-7 rounded-md cursor-pointer"
                  style={{ background: c, border: form.color === c ? '3px solid #fff' : '3px solid transparent' }}
                />
              ))}
            </div>
          </Field>

          <Field label="Email (optional)">
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="store@example.com" />
          </Field>

          <Field label="Tax Rate (%)">
            <input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: e.target.value })} />
          </Field>

          <Field label="Buying Target (% of sales)">
            <input type="number" step="1" min="0" max="100" value={form.buying_target_pct} onChange={e => setForm({ ...form, buying_target_pct: e.target.value })} placeholder="50" />
            <p className="text-[var(--text-muted)] text-[10px] mt-1">Flag this store when month-to-date product buying exceeds this share of its net sales.</p>
          </Field>

          <Field label="Address (optional)">
            <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, City, TX" />
          </Field>

          <Field label="Phone (optional)">
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
          </Field>

          {/* Store Hours (CT) — per day of week, with a "same every day" shortcut */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-[var(--text-primary)] text-[12px] font-bold uppercase tracking-wide">Store Hours (CT)</div>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hours_same_for_all}
                  onChange={e => {
                    const same = e.target.checked;
                    setForm(prev => {
                      if (same) {
                        return {
                          ...prev,
                          hours_same_for_all: true,
                          hours_by_day: buildHoursByDay(prev.open_time, prev.close_time),
                        };
                      }
                      // When switching off, seed each day from current single pair.
                      return {
                        ...prev,
                        hours_same_for_all: false,
                        hours_by_day: buildHoursByDay(prev.open_time, prev.close_time),
                      };
                    });
                  }}
                />
                Same hours every day
              </label>
            </div>

            {form.hours_same_for_all ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Open">
                  <input type="time" value={form.open_time} onChange={e => setForm({ ...form, open_time: e.target.value })} />
                </Field>
                <Field label="Close">
                  <input type="time" value={form.close_time} onChange={e => setForm({ ...form, close_time: e.target.value })} />
                </Field>
              </div>
            ) : (
              <div className="space-y-1.5">
                {DAY_KEYS.map(d => {
                  const dh = form.hours_by_day?.[d];
                  const closed = dh === null;
                  return (
                    <div key={d} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <span className="w-9 text-[var(--text-secondary)] uppercase text-[11px] font-bold">{DAY_LABEL[d]}</span>
                      <label className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!closed}
                          onChange={e => {
                            const opening = e.target.checked;
                            setForm(prev => ({
                              ...prev,
                              hours_by_day: {
                                ...prev.hours_by_day,
                                [d]: opening ? { open: prev.open_time, close: prev.close_time } : null,
                              },
                            }));
                          }}
                        />
                        Open
                      </label>
                      {closed ? (
                        <span className="text-[var(--text-muted)] text-[11px] italic ml-2">Closed</span>
                      ) : (
                        <>
                          <input
                            type="time"
                            value={dh?.open || '11:00'}
                            onChange={e => setForm(prev => ({
                              ...prev,
                              hours_by_day: { ...prev.hours_by_day, [d]: { ...prev.hours_by_day[d], open: e.target.value } },
                            }))}
                            className="!text-[12px] !py-1 !px-2 flex-1 min-w-[80px]"
                          />
                          <span className="text-[var(--text-muted)] text-[10px]">→</span>
                          <input
                            type="time"
                            value={dh?.close || '22:00'}
                            onChange={e => setForm(prev => ({
                              ...prev,
                              hours_by_day: { ...prev.hours_by_day, [d]: { ...prev.hours_by_day[d], close: e.target.value } },
                            }))}
                            className="!text-[12px] !py-1 !px-2 flex-1 min-w-[80px]"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-[var(--text-muted)] text-[10px] mt-2">
              Employee shift hours are clamped to this window. A late open or early close still counts as actual minutes worked; opening early or closing late doesn't add extra hours. Days marked Closed contribute 0 hours.
            </div>
          </div>

          <Field label="Telegram Group Chat ID">
            <input type="text" value={form.telegram_chat_id} onChange={e => setForm({ ...form, telegram_chat_id: e.target.value })} placeholder="e.g. -1001234567890" />
            <div className="text-[var(--text-muted)] text-[10px] mt-1">Add the bot to the store's Telegram group, send a message, then check getUpdates for the group chat ID (starts with -)</div>
          </Field>

          <Toggle label="Has Register 2" hint="Enable second register (Bells, Kerens)" value={form.has_register2} onChange={v => setForm({ ...form, has_register2: v })} />
          <Toggle label="Active" hint="Inactive stores hidden from dropdowns but data preserved" value={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />

          <div className="flex gap-2 justify-end mt-3">
            <Button variant="secondary" onClick={() => { setEditStore(null); setAddOpen(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
