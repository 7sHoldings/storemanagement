// Compute employee shift hours clamped to a store's open/close window.
//
// Inputs:
//   openedAt    : ISO string when the cashier opened the register
//   closedAt    : ISO string when the cashier closed (or null = ongoing)
//   shiftDate   : 'YYYY-MM-DD' (the calendar date the shift is logged under)
//   hoursByDay  : optional per-day map keyed by lowercase 3-letter weekday
//                 (mon/tue/wed/thu/fri/sat/sun). Each value is either
//                 { open: 'HH:MM', close: 'HH:MM' } or null (closed).
//                 When provided, overrides storeOpen / storeClose.
//   storeOpen   : 'HH:MM' wall-clock CT fallback (default '11:00')
//   storeClose  : 'HH:MM' wall-clock CT fallback (default '22:00')
//
// Behavior (all comparisons in America/Chicago wall time on shift_date):
//   • Day is closed in hoursByDay → 0 hours
//   • Opened before storeOpen     → counted from storeOpen
//   • Closed after  storeClose    → counted to   storeClose
//   • Opened after / closed before window → counted as-is
//   • Cross-midnight stores (close < open) are supported by treating
//     close as the next day in CT.
//
// Returns hours (rounded to 2 decimals) or null if the shift is still
// open. Falls back to the raw difference when shift_date / store hours
// aren't known.

const TZ = 'America/Chicago';

function ctParts(iso) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return {
    y: parseInt(parts.year, 10),
    m: parseInt(parts.month, 10),
    d: parseInt(parts.day, 10),
    hh: parseInt(parts.hour === '24' ? '00' : parts.hour, 10),
    mm: parseInt(parts.minute, 10),
    ss: parseInt(parts.second, 10),
  };
}

// Convert a CT wall-clock (date + HH:MM) to a UTC Date instant.
// We brute-force the offset: Chicago is UTC-5 (CDT) or UTC-6 (CST).
function ctWallToUtc(yy, mm, dd, hh, min) {
  for (const offset of [5, 6]) {
    const guess = new Date(Date.UTC(yy, mm - 1, dd, hh + offset, min, 0));
    const back = ctParts(guess.toISOString());
    if (back.y === yy && back.m === mm && back.d === dd && back.hh === hh && back.mm === min) {
      return guess;
    }
  }
  return new Date(Date.UTC(yy, mm - 1, dd, hh + 5, min, 0));
}

// CT day of week for a YYYY-MM-DD date string. Returns 'mon', 'tue', etc.
export function ctDayOfWeek(dateStr) {
  if (!dateStr) return null;
  const [yy, mm, dd] = dateStr.split('-').map(Number);
  const noonUtc = ctWallToUtc(yy, mm, dd, 12, 0);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
  return fmt.format(noonUtc).toLowerCase().slice(0, 3);
}

function parseHHMM(str) {
  if (!str) return null;
  const [hStr, mStr] = String(str).split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

// Resolve the open/close pair for a given shift date based on per-day
// hours, falling back to the legacy single pair. Returns null when the
// store is closed that day.
function pickDayHours({ shiftDate, hoursByDay, storeOpen, storeClose }) {
  if (hoursByDay && shiftDate) {
    const day = ctDayOfWeek(shiftDate);
    if (day && Object.prototype.hasOwnProperty.call(hoursByDay, day)) {
      const dh = hoursByDay[day];
      if (dh === null || dh === undefined) return null;
      return { open: dh.open || storeOpen, close: dh.close || storeClose };
    }
  }
  if (storeOpen && storeClose) return { open: storeOpen, close: storeClose };
  return null;
}

export function clampShiftHours({ openedAt, closedAt, shiftDate, hoursByDay, storeOpen, storeClose }) {
  if (!openedAt || !closedAt) return null;
  const opened = new Date(openedAt);
  const closed = new Date(closedAt);

  const win = pickDayHours({ shiftDate, hoursByDay, storeOpen, storeClose });
  if (win === null) return 0;

  const open = parseHHMM(win.open);
  const close = parseHHMM(win.close);
  if (!open || !close || !shiftDate) {
    const raw = (closed - opened) / 1000 / 3600;
    return parseFloat(Math.max(0, raw).toFixed(2));
  }
  const [yy, mm, dd] = shiftDate.split('-').map(Number);
  const storeOpenUtc  = ctWallToUtc(yy, mm, dd, open.h, open.m);
  const sameDay = (close.h * 60 + close.m) > (open.h * 60 + open.m);
  const closeDate = sameDay
    ? { yy, mm, dd }
    : (() => {
        const d = new Date(Date.UTC(yy, mm - 1, dd + 1, 12, 0, 0));
        return { yy: d.getUTCFullYear(), mm: d.getUTCMonth() + 1, dd: d.getUTCDate() };
      })();
  const storeCloseUtc = ctWallToUtc(closeDate.yy, closeDate.mm, closeDate.dd, close.h, close.m);

  const effectiveOpen  = opened > storeOpenUtc  ? opened : storeOpenUtc;
  const effectiveClose = closed < storeCloseUtc ? closed : storeCloseUtc;
  if (effectiveClose <= effectiveOpen) return 0;
  return parseFloat(((effectiveClose - effectiveOpen) / 1000 / 3600).toFixed(2));
}
