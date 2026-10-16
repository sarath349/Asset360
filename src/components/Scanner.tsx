import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Keyboard, Radio } from 'lucide-react';

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

/**
 * Camera QR/barcode scanner with manual entry fallback. Handheld RFID/barcode
 * readers that emulate a keyboard work through the manual field (they type + Enter).
 */
export function Scanner({ onScan, paused, autoStart = true }: { onScan: (code: string) => void; paused?: boolean; autoStart?: boolean }) {
  const id = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const scanner = useRef<Html5Qrcode | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const start = async () => {
    setError(null);
    try {
      const s = new Html5Qrcode(id.current, { formatsToSupport: FORMATS, verbose: false });
      scanner.current = s;
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(Math.min(w, h) * 0.7), height: Math.floor(Math.min(w, h) * 0.7) }) },
        (text) => {
          if (pausedRef.current) return;
          const now = Date.now();
          if (text === last.current.code && now - last.current.at < 2500) return;
          last.current = { code: text, at: now };
          navigator.vibrate?.(60);
          onScanRef.current(text);
        },
        () => undefined
      );
      setRunning(true);
    } catch (err) {
      setError(
        window.isSecureContext
          ? (err as Error)?.message || 'Camera unavailable. Allow camera access or use manual entry.'
          : 'Camera needs HTTPS (or localhost). Use manual entry or a handheld scanner.'
      );
      setRunning(false);
    }
  };

  const stop = async () => {
    try {
      if (scanner.current?.isScanning) await scanner.current.stop();
      scanner.current?.clear();
    } catch {
      /* already stopped */
    }
    setRunning(false);
  };

  useEffect(() => {
    if (autoStart) start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    onScan(manual.trim());
    setManual('');
  };

  return (
    <div className="stack">
      <div className="scanner-box">
        <div id={id.current} />
        {running && (
          <>
            <div className="scan-line" />
          </>
        )}
        {!running && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#cbd5e1', textAlign: 'center', padding: 20 }}>
            <div>
              <Camera size={36} style={{ opacity: 0.7 }} />
              <div className="mt-sm small">{error || 'Camera is off'}</div>
              <button className="btn btn-primary btn-sm mt-sm" onClick={start}>
                <Camera size={14} /> Start camera
              </button>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={submitManual} className="row">
        <div className="search" style={{ maxWidth: 'none' }}>
          <Keyboard size={16} />
          <input className="input" placeholder="Type or scan asset ID / barcode / RFID…" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
        </div>
        <button className="btn btn-primary" type="submit">
          Go
        </button>
        {running && (
          <button className="btn" type="button" onClick={stop}>
            Stop
          </button>
        )}
      </form>
      <div className="xs muted row" style={{ gap: 6 }}>
        <Radio size={13} /> Handheld RFID / barcode readers in keyboard mode can scan straight into the field above.
      </div>
    </div>
  );
}
