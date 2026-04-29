// Compute employee shift hours clamped to a store's open/close window.
//
// Inputs:
//   openedAt  : ISO string when the cashier opened the register
//   closedAt  : ISO string when the cashier closed (or null = ongoing)
//   shiftDate : 'YYYY-MM-DD' (the calendar date the shift is logged under)
//   storeOpen : 'HH:MM' wall-clock CT (default '11:00')
//   storeClose: 'HH:MM' wall-clock CT (default '22:00')
//
// Behavior (all comparisons in America/Chicago wall time on shift_date):
//   • Opened before storeOpen  → counted from storeOpen
//   • Closed after  storeClose → counted to   storeClose
//   • Opened after storeOpen / closed before storeClose → counted as-is
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
  // Fallback: assume CDT (-5).
  return new Date(Date.UTC(yy, mm - 1, dd, hh + 5, min, 0));
}

function parseHHMM(str) {
  if (!str) return null;
  const [hStr, mStr] = String(str).split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

export function clampShiftHours({ openedAt, closedAt, shiftDate, storeOpen, storeClose }) {
  if (!openedAt || !closedAt) return null;
  const opened = new Date(openedAt);
  const closed = new Date(closedAt);
  // No store window or no date — fall back to the raw difference.
  const open = parseHHMM(storeOpen);
  const close = parseHHMM(storeClose);
  if (!open || !close || !shiftDate) {
    const raw = (closed - opened) / 1000 / 3600;
    return parseFloat(Math.max(0, raw).toFixed(2));
  }
  const [yy, mm, dd] = shiftDate.split('-').map(Number);
  const storeOpenUtc  = ctWallToUtc(yy, mm, dd, open.h, open.m);
  // Cross-midnight: close <= open means the store closes the next day.
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
