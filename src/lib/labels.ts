import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { scanUrl } from '../components/codes';
import type { ApiLabelTemplate } from '../api/assetApi';

export interface LabelAsset {
  code: string;
  name: string;
  rfid?: string | null;
  /** Value encoded in the barcode. Defaults to the asset code. */
  barcode?: string | null;
}

export type LabelMode = 'qr' | 'barcode' | 'both';

export type LabelTemplateOptions = Pick<
  ApiLabelTemplate,
  'mode' | 'widthMm' | 'heightMm' | 'showCompany' | 'showName' | 'showRfid' | 'showBarcode' | 'showQr' | 'companyPrefix'
>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function barcodeSvg(value: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, value, { format: 'CODE128', displayValue: false, height: 34, margin: 0, width: 1.5 });
  } catch {
    return '';
  }
  return new XMLSerializer().serializeToString(svg);
}

const DEFAULT_TEMPLATE: LabelTemplateOptions = {
  mode: 'both',
  widthMm: 78,
  heightMm: 34,
  showCompany: true,
  showName: true,
  showRfid: true,
  showBarcode: true,
  showQr: true,
  companyPrefix: 'Property of',
};

/**
 * Opens a print-ready sheet of labels (QR encodes the portal scan URL, barcode is Code128 of the asset code).
 * Works on desktop and from the mobile app (use "Print" or "Save as PDF" in the browser dialog).
 */
export async function printLabels(
  assets: LabelAsset[],
  mode: LabelMode = 'both',
  company = 'Property of',
  template?: Partial<LabelTemplateOptions> | null
) {
  const t = { ...DEFAULT_TEMPLATE, ...template, mode: template?.mode || mode };
  const showQr = t.showQr !== false && t.mode !== 'barcode';
  const showBc = t.showBarcode !== false && t.mode !== 'qr';
  const companyLine = t.showCompany !== false ? `${t.companyPrefix || 'Property of'}${company ? ` ${company}` : ''}`.trim() : '';

  // Open synchronously so the browser treats it as a user-initiated popup.
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups to print labels');
  w.document.write('<p style="font-family:sans-serif;padding:20px">Preparing labels…</p>');

  const cards = await Promise.all(
    assets.map(async (a) => {
      const qr = showQr ? await QRCode.toDataURL(scanUrl(a.code), { width: 220, margin: 1, errorCorrectionLevel: 'M' }) : '';
      const bc = showBc ? barcodeSvg(a.barcode || a.code) : '';
      return `<div class="label">
        ${qr ? `<img src="${qr}" alt="" />` : ''}
        <div class="body">
          ${companyLine ? `<div class="co">${esc(companyLine)}</div>` : ''}
          <div class="id">${esc(a.code)}</div>
          ${t.showName !== false ? `<div class="nm">${esc(a.name)}</div>` : ''}
          ${bc ? `<div class="bc">${bc}</div>` : ''}
          ${t.showRfid !== false && a.rfid ? `<div class="rf">RFID ${esc(a.rfid)}</div>` : ''}
        </div>
      </div>`;
    })
  );

  const width = Number(t.widthMm) || 78;
  const height = Number(t.heightMm) || 34;

  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Asset labels</title>
  <style>
    @page { margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; margin: 0; color: #0f172a; }
    .sheet { display: grid; grid-template-columns: repeat(auto-fill, ${width}mm); gap: 4mm; }
    .label { width: ${width}mm; min-height: ${height}mm; border: 1px solid #999; border-radius: 3mm; padding: 3mm; display: flex; gap: 3mm; align-items: center; page-break-inside: avoid; }
    .label img { width: ${Math.min(26, width * 0.33)}mm; height: ${Math.min(26, height * 0.75)}mm; }
    .body { flex: 1; min-width: 0; }
    .co { font-size: 6.5pt; letter-spacing: .08em; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .id { font-size: 12pt; font-weight: 800; font-family: ui-monospace, Menlo, monospace; }
    .nm { font-size: 8pt; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bc svg { width: 100%; height: 10mm; margin-top: 1mm; }
    .rf { font-size: 6.5pt; color: #64748b; font-family: ui-monospace, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { padding: 10px; font: 13px sans-serif; background: #eef2ff; margin-bottom: 8px; }
    @media print { .bar { display: none; } }
  </style></head><body>
  <div class="bar">${assets.length} label${assets.length === 1 ? '' : 's'} ready. Use your browser's Print dialog (or Save as PDF). <button onclick="print()">Print</button></div>
  <div class="sheet">${cards.join('')}</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
  </body></html>`);
  w.document.close();
}
