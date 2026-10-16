import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

export function scanUrl(assetId: string) {
  return `${window.location.origin}/scan/${encodeURIComponent(assetId)}`;
}

export function QrCode({ value, size = 120 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={value} style={{ display: 'block' }} /> : <div style={{ width: size, height: size }} />;
}

export function Barcode({ value, height = 38 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', displayValue: false, height, margin: 0, width: 1.4 });
    } catch {
      /* unsupported characters for CODE128 */
    }
  }, [value, height]);
  return <svg ref={ref} className="barcode" />;
}

export function AssetLabel({ asset, company, mode = 'qr' }: { asset: any; company?: string; mode?: 'qr' | 'barcode' | 'both' }) {
  return (
    <div className="label-card">
      {mode !== 'barcode' && <QrCode value={scanUrl(asset.assetId)} size={84} />}
      <div className="lc-body">
        <div className="lc-company">{company || 'Property of'}</div>
        <div className="lc-id mono">{asset.assetId}</div>
        <div className="lc-name ellipsis">{asset.name}</div>
        {mode !== 'qr' && <Barcode value={asset.tag?.barcode || asset.assetId} />}
        {asset.tag?.rfid && <div className="xs muted mono ellipsis">RFID {asset.tag.rfid}</div>}
      </div>
    </div>
  );
}
