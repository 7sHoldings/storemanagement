// Barcode helpers shared by the camera scanner and the photo upload.

/**
 * Normalise a decoded barcode to the number the POS stores.
 *
 * A UPC-A barcode is also a valid EAN-13 with a leading 0, and some decoders
 * (the browser's BarcodeDetector in particular) report it that way. NRS keys
 * items by the 12-digit UPC, so the 13-digit form is trimmed back — the same
 * number the camera scanner already produces.
 */
export function normalizeUpc(raw, format = '') {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const f = String(format).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d{13}$/.test(s) && s.startsWith('0') && (f === '' || f === 'ean13')) return s.slice(1);
  return s;
}

/** Remove repeated UPCs, keeping the first occurrence. Blank entries are kept. */
export function dedupeUpcs(rows, key = 'upc') {
  const seen = new Set();
  return rows.filter((r) => {
    const v = String(r?.[key] ?? '').trim();
    if (!v) return true;
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}
