'use client';
import { useState, useEffect, useRef } from 'react';
import { Modal, Alert, Button } from '@/components/UI';

// ── Camera barcode scanner ──────────────────────────────────────────────
// Uses the browser's native BarcodeDetector when present (Android/Chrome),
// and falls back to ZXing for everything else (notably iOS Safari, which has
// no BarcodeDetector). Works on phones over HTTPS.
export default function BarcodeScanModal({ onDetected, onClose, title = 'Scan barcode' }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    let stopped = false;
    let done = false;
    let cleanup = () => {};
    const hit = (val) => {
      if (done || stopped || !val) return;
      done = true;
      onDetected(String(val).trim());
    };

    (async () => {
      // Fast path: native BarcodeDetector.
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'codabar', 'itf'],
          });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
          if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
          const v = videoRef.current;
          if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
          setStatus('Point the camera at the barcode…');
          let raf;
          const tick = async () => {
            if (stopped || done || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes?.[0]?.rawValue) return hit(codes[0].rawValue);
            } catch { /* frame not ready */ }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          cleanup = () => { if (raf) cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); };
          return;
        } catch { /* fall through to ZXing */ }
      }

      // Cross-platform fallback: ZXing (iOS Safari, etc.).
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        if (stopped || !videoRef.current) return;
        setStatus('Point the camera at the barcode…');
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => { if (result) hit(result.getText()); }
        );
        cleanup = () => { try { controls.stop(); } catch { /* already stopped */ } };
      } catch (e) {
        setErr('Could not start the camera: ' + (e?.message || e) + '. A USB/Bluetooth scanner typed into the box also works, or type the number.');
      }
    })();

    return () => { stopped = true; cleanup(); };
  }, [onDetected]);

  return (
    <Modal title={title} onClose={onClose}>
      {err ? (
        <Alert type="warning">{err}</Alert>
      ) : (
        <>
          <video ref={videoRef} className="w-full rounded-lg bg-black aspect-video object-cover" muted playsInline autoPlay />
          <p className="text-[12px] text-[var(--text-muted)] mt-2">{status} It fills in automatically.</p>
        </>
      )}
      <div className="flex justify-end mt-3"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
