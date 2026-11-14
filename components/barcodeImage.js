'use client';
import { normalizeUpc } from '@/lib/barcode';

// Read a barcode from a photo the user picked from their library.
//
// Phone photos are large (12 MP+) and the barcode is often small, tilted or
// sideways, so a single decode attempt fails a lot. This tries, in order:
//   1. the browser's own BarcodeDetector (Android/Chrome) on the full photo;
//   2. ZXing (works everywhere, incl. iPhone Safari) on the photo drawn at a
//      few sizes, each also turned 90°, with "try harder" on.
// Returns { upc, format } or null when no barcode could be read.

const NATIVE_FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'codabar', 'itf'];
const SIZES = [1600, 1000, 2400];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open this image')); };
    img.src = url;
  });
}

function drawScaled(img, maxSide, rotate) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = rotate ? h : w;
  canvas.height = rotate ? w : h;
  const ctx = canvas.getContext('2d');
  if (rotate) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

let zxingReader = null;
async function getZxingReader() {
  if (zxingReader) return zxingReader;
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  zxingReader = { reader: new BrowserMultiFormatReader(hints), BarcodeFormat };
  return zxingReader;
}

export async function decodeBarcodeFromFile(file) {
  const { img, url } = await loadImage(file);
  try {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
        const codes = await detector.detect(img);
        if (codes?.[0]?.rawValue) {
          return { upc: normalizeUpc(codes[0].rawValue, codes[0].format), format: codes[0].format || '' };
        }
      } catch { /* fall through to ZXing */ }
    }
    const { reader, BarcodeFormat } = await getZxingReader();
    for (const size of SIZES) {
      for (const rotate of [false, true]) {
        try {
          const result = reader.decodeFromCanvas(drawScaled(img, size, rotate));
          const text = result?.getText?.();
          if (text) {
            const format = BarcodeFormat[result.getBarcodeFormat()] || '';
            return { upc: normalizeUpc(text, format), format };
          }
        } catch { /* not found at this size/angle — try the next */ }
      }
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A small preview URL for showing the photo next to its row. Caller revokes it. */
export function previewUrl(file) {
  return URL.createObjectURL(file);
}
