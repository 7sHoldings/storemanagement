'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { DateBar, useDateRange, Loading, Button } from '@/components/UI';
import { V2StatCard } from '@/components/ui';
import { fmt, fK, dayLabel, downloadCSV } from '@/lib/utils';
import { clampShiftHours } from '@/lib/shift-hours';

export default function EmployeeTrackingPage() {
  const router = useRouter();
  const { supabase, isOwner } = useAuth();
  const { range, preset, selectPreset, setStart, setEnd } = useDateRange('thisweek');
  const [shifts, setShifts] = useState([]);
  const [stores, setStores] = useState([]);
  const [profiles, setProfiles] = useState([]); // active employee profiles
  const [credits, setCredits] = useState([]);   // [{ store_id, employee_id, name, amount }]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: st }, { data: sh }, { data: salesRows }, { data: profs }] = await Promise.all([
        supabase.from('stores').select('id, name, color, open_time, close_time, hours_by_day').order('created_at'),
        supabase.from('employee_shifts')
          .select('*, stores(name, color), daily_sales(total_sales, net_sales, r1_short_over, short_over)')
          .gte('shift_date', range.start)
          .lte('shift_date', range.end)
          .order('opened_at', { ascending: true }),
        supabase.from('daily_sales')
          .select('store_id, date, house_accounts')
          .gte('date', range.start)
          .lte('date', range.end),
        supabase.from('profiles')
          .select('id, name, store_id, role, is_active, nrs_employee_name')
          .eq('role', 'employee')
          .neq('is_active', false),
      ]);
      // Flatten house_accounts JSON arrays into one row per credit entry.
      const flat = [];
      (salesRows || []).forEach(r => {
        if (!Array.isArray(r.house_accounts)) return;
        r.house_accounts.forEach(e => {
          flat.push({
            store_id: r.store_id,
            employee_id: e?.employee_id || null,
            name: (e?.name || '').trim(),
            amount: Number(e?.amount || 0),
          });
        });
      });
      setStores(st || []);
      setShifts(sh || []);
      setProfiles(profs || []);
      setCredits(flat);
      setLoading(false);
    })();
  }, [range.start, range.end]);

  // Deduplicate short_over per daily_sales_id: attribute to the LAST closer
  const shiftsWithSO = useMemo(() => {
    const dsMap = {};
    shifts.forEach(s => {
      if (!s.daily_sales_id) return;
      const prev = dsMap[s.daily_sales_id];
      if (!prev || (s.closed_at && (!prev.closed_at || s.closed_at > prev.closed_at))) {
        dsMap[s.daily_sales_id] = s;
      }
    });
    const primaryIds = new Set(Object.values(dsMap).map(s => s.id));
    const storeMap = Object.fromEntries((stores || []).map(st => [st.id, st]));
    return shifts.map(s => {
      const st = storeMap[s.store_id];
      const clamped = clampShiftHours({
        openedAt: s.opened_at,
        closedAt: s.closed_at,
        shiftDate: s.shift_date,
        hoursByDay: st?.hours_by_day,
        storeOpen: st?.open_time,
        storeClose: st?.close_time,
      });
      return {
        ...s,
        _hours: clamped != null ? clamped : Number(s.total_hours || 0),
        _isPrimary: primaryIds.has(s.id),
        // short_over is the canonical day total (driven by cash collection
        // when present, sales math otherwise). r1_short_over is always 0 on
        // R2 stores, so we read short_over first.
        _so: primaryIds.has(s.id) ? Number(s.daily_sales?.short_over ?? s.daily_sales?.r1_short_over ?? 0) : 0,
        _sales: primaryIds.has(s.id) ? Number(s.daily_sales?.total_sales ?? s.daily_sales?.net_sales ?? 0) : 0,
      };
    });
  }, [shifts, stores]);

  const grouped = useMemo(() => {
    // 1. Seed the store map from `stores` so empty stores still appear.
    const storeMap = {};
    stores.forEach(st => {
      storeMap[st.id] = { store: st, employees: {}, unmatched: {} };
    });

    // 2. Seed each store with its assigned employee profiles. The profile
    //    name is canonical; profile.nrs_employee_name is an alias used to
    //    match what NRS reports (e.g. "Dylan" → "Bobby").
    profiles.forEach(p => {
      if (!p.store_id) return;
      const store = storeMap[p.store_id] = storeMap[p.store_id]
        || { store: stores.find(s => s.id === p.store_id) || {}, employees: {}, unmatched: {} };
      store.employees[p.id] = {
        profileId: p.id,
        name: p.name || 'Unnamed',
        nrsAliases: [
          (p.name || '').trim().toLowerCase(),
          (p.nrs_employee_name || '').trim().toLowerCase(),
        ].filter(Boolean),
        shifts: [],
        totalHours: 0,
        totalSO: 0,
        totalSales: 0,
        totalCredit: 0,
      };
    });

    // 3. Distribute shifts: try to match the NRS-reported employee_name
    //    against any profile alias for the same store. Unmatched shift
    //    names are bucketed separately so the owner can see which POS
    //    logins still need a profile mapping.
    shiftsWithSO.forEach(s => {
      const sid = s.store_id;
      const store = storeMap[sid] = storeMap[sid] || { store: s.stores || {}, employees: {}, unmatched: {} };
      const nrsName = (s.employee_name || '').trim();
      const lc = nrsName.toLowerCase();
      const match = Object.values(store.employees).find(e => e.nrsAliases.includes(lc));
      if (match) {
        match.shifts.push(s);
        match.totalHours += Number(s._hours) || 0;
        match.totalSO += s._so;
        match.totalSales += s._sales;
      } else {
        const key = nrsName || 'Unknown';
        const bucket = store.unmatched[key] = store.unmatched[key] || {
          name: key,
          shifts: [],
          totalHours: 0,
          totalSO: 0,
          totalSales: 0,
          totalCredit: 0,
          unmatched: true,
        };
        bucket.shifts.push(s);
        bucket.totalHours += Number(s._hours) || 0;
        bucket.totalSO += s._so;
        bucket.totalSales += s._sales;
      }
    });

    // 4. Distribute credits: prefer employee_id, fall back to name match.
    credits.forEach(c => {
      const sid = c.store_id;
      const store = storeMap[sid] = storeMap[sid] || { store: stores.find(s => s.id === sid) || {}, employees: {}, unmatched: {} };
      const byId = c.employee_id ? store.employees[c.employee_id] : null;
      if (byId) { byId.totalCredit += c.amount; return; }
      const lc = c.name.toLowerCase();
      const byName = Object.values(store.employees).find(e => e.nrsAliases.includes(lc));
      if (byName) { byName.totalCredit += c.amount; return; }
      const key = c.name || 'Unknown';
      const bucket = store.unmatched[key] = store.unmatched[key] || {
        name: key, shifts: [], totalHours: 0, totalSO: 0, totalSales: 0, totalCredit: 0, unmatched: true,
      };
      bucket.totalCredit += c.amount;
    });

    const toCard = (d) => ({
      profileId: d.profileId,
      name: d.name,
      shiftCount: d.shifts.length,
      totalHours: parseFloat(d.totalHours.toFixed(1)),
      avgHours: d.shifts.length ? parseFloat((d.totalHours / d.shifts.length).toFixed(1)) : 0,
      totalSO: parseFloat(d.totalSO.toFixed(2)),
      totalSales: parseFloat(d.totalSales.toFixed(2)),
      totalCredit: parseFloat((d.totalCredit || 0).toFixed(2)),
      unmatched: !!d.unmatched,
    });

    return Object.entries(storeMap)
      .map(([sid, { store, employees, unmatched }]) => {
        const all = [...Object.values(employees).map(toCard), ...Object.values(unmatched).map(toCard)];
        return {
          storeId: sid,
          storeName: store.name || '—',
          storeColor: store.color,
          employees: all.sort((a, b) => Number(a.unmatched) - Number(b.unmatched) || b.totalHours - a.totalHours),
          totalShifts: all.reduce((s, e) => s + e.shiftCount, 0),
          totalHours: parseFloat(all.reduce((s, e) => s + e.totalHours, 0).toFixed(1)),
          totalSO: parseFloat(all.reduce((s, e) => s + e.totalSO, 0).toFixed(2)),
          totalCredit: parseFloat(all.reduce((s, e) => s + (e.totalCredit || 0), 0).toFixed(2)),
          employeeCount: all.filter(e => !e.unmatched).length,
        };
      })
      // Skip stores with neither tracked employees nor any activity.
      .filter(g => g.employees.length > 0);
  }, [shiftsWithSO, credits, stores, profiles]);

  const totals = useMemo(() => {
    const h = shiftsWithSO.reduce((s, r) => s + (Number(r._hours) || 0), 0);
    const so = shiftsWithSO.reduce((s, r) => s + r._so, 0);
    const emps = new Set(shiftsWithSO.map(r => r.employee_name)).size;
    return { shifts: shiftsWithSO.length, hours: h.toFixed(1), employees: emps, so: so.toFixed(2) };
  }, [shiftsWithSO]);

  if (!isOwner) return <div className="text-[var(--text-muted)] text-center py-20">Owner access required</div>;
  if (loading) return <Loading />;

  const exportCSV = () => {
    const rows = [];
    grouped.forEach(g => g.employees.forEach(e => {
      rows.push([g.storeName, e.name, e.shiftCount, e.totalHours, e.avgHours, e.totalSales, e.totalSO, e.totalCredit]);
    }));
    downloadCSV('employee-summary.csv', ['Store', 'Employee', 'Shifts', 'Hours', 'Avg Hrs', 'Sales', 'Short/Over', 'Credit'], rows);
  };

  const goDetail = (storeId, name) => router.push(`/employee-tracking/${storeId}/${encodeURIComponent(name)}`);
  const soColor = (v) => Math.abs(v) < 0.01 ? '#64748B' : v > 0 ? '#34D399' : '#F87171';

  return (
    <div>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">People</p>
          <h1 className="text-[var(--text-primary)] text-[22px] font-bold tracking-tight">Employee Tracking</h1>
          <p className="text-[var(--text-secondary)] text-[12px]">{totals.shifts} shifts · {totals.hours}h · {totals.employees} employees</p>
        </div>
        <Button variant="secondary" onClick={exportCSV} className="!text-[11px]">CSV</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <V2StatCard label="Total Shifts" value={totals.shifts} icon="📋" variant="info" />
        <V2StatCard label="Total Hours" value={`${totals.hours}h`} icon="🕐" variant="success" />
        <V2StatCard label="Employees" value={totals.employees} icon="👤" />
        <V2StatCard label="Net Short/Over" value={`${Number(totals.so) >= 0 ? '+' : ''}${fmt(Number(totals.so))}`} icon="💰" variant={Number(totals.so) < 0 ? 'danger' : 'success'} />
      </div>

      <DateBar preset={preset} onPreset={selectPreset} startDate={range.start} endDate={range.end} onStartChange={setStart} onEndChange={setEnd} />

      {shifts.length === 0 ? (
        <div className="bg-sw-card border border-sw-border rounded-xl p-8 text-center text-[var(--text-muted)]">
          No shifts recorded yet. Run the backfill or wait for tomorrow's 7S Agent sync.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <div key={g.storeId} className="bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <div className="px-4 py-3 bg-sw-card2 border-b border-[var(--border-subtle)] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded" style={{ background: g.storeColor || '#64748B' }} />
                  <span className="text-[var(--text-primary)] text-[14px] font-bold">{g.storeName}</span>
                </div>
                <div className="text-[var(--text-secondary)] text-[11px] flex gap-3 flex-wrap">
                  <span>{g.totalShifts} shifts</span>
                  <span>{g.totalHours}h</span>
                  <span>{g.employeeCount} emp</span>
                  <span style={{ color: soColor(g.totalSO) }} className="font-mono font-bold">
                    S/O: {g.totalSO >= 0 ? '+' : ''}{fmt(g.totalSO)}
                  </span>
                  {g.totalCredit > 0 && (
                    <span className="font-mono font-bold text-[var(--color-warning)]">
                      Credit: {fmt(g.totalCredit)}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.employees.map(emp => (
                  <button
                    key={emp.name}
                    onClick={() => goDetail(g.storeId, emp.name)}
                    className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-4 text-left hover:border-sw-blue/40 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="text-[var(--text-primary)] text-[14px] font-bold group-hover:text-[var(--color-info)] transition-colors truncate">{emp.name}</span>
                      {emp.unmatched && (
                        <span
                          className="text-[var(--color-warning)] text-[9px] font-bold rounded px-1.5 py-0.5 bg-[var(--color-warning-bg)] whitespace-nowrap"
                          title="No matching profile — set this name as 'NRS POS name' on the right teammate's Admin → Edit form to attribute these shifts."
                        >
                          UNMAPPED
                        </span>
                      )}
                      {emp.name === 'User1' && !emp.unmatched && <span className="text-[var(--text-muted)] text-[9px]">Generic</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-[11px] mb-3">
                      <div className="text-[var(--text-secondary)]">Shifts</div>
                      <div className="text-right text-[var(--text-primary)] font-semibold">{emp.shiftCount}</div>
                      <div className="text-[var(--text-secondary)]">Hours</div>
                      <div className="text-right font-mono font-bold" style={{ color: emp.totalHours >= 40 ? '#34D399' : '#60A5FA' }}>{emp.totalHours}h</div>
                      <div className="text-[var(--text-secondary)]">Avg / Shift</div>
                      <div className="text-right font-mono text-[var(--text-primary)]">{emp.avgHours}h</div>
                      <div className="text-[var(--text-secondary)]">Sales Handled</div>
                      <div className="text-right font-mono text-[var(--text-primary)]">{fmt(emp.totalSales)}</div>
                      <div className="text-[var(--text-secondary)] font-semibold">Short/Over</div>
                      <div className="text-right font-mono font-bold" style={{ color: soColor(emp.totalSO) }}>
                        {emp.totalSO >= 0 ? '+' : ''}{fmt(emp.totalSO)}
                      </div>
                      <div className="text-[var(--text-secondary)] font-semibold">Credit</div>
                      <div className="text-right font-mono font-bold" style={{ color: emp.totalCredit > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                        {emp.totalCredit > 0 ? fmt(emp.totalCredit) : fmt(0)}
                      </div>
                    </div>
                    <div className="text-[var(--color-info)] text-[11px] font-semibold group-hover:underline">View Details →</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
