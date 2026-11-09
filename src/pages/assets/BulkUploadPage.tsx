import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import { ApiAsset, assetApi } from '../../api/assetApi';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Card, Empty, Field, PageHeader } from '../../components/ui';

const TEMPLATE_HEADERS = [
  'assetCode',
  'assetName',
  'categoryName',
  'subCategoryName',
  'serialNumber',
  'brand',
  'model',
  'purchaseDate',
  'purchaseCost',
  'currency',
  'locationCode',
  'status',
  'condition',
  'ownershipType',
  'rfidTag',
  'qrCode',
  'remarks',
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (line: string) => {
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === ',' && !q) {
        cells.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    cells.push(cur.trim());
    return cells;
  };
  const headers = split(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

export default function BulkUploadPage() {
  const toast = useToast();
  const { categories, locations } = useData();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<{ created: number; errors: { row: number; message: string }[]; assets: ApiAsset[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const catByName = useMemo(() => {
    const m = new Map<string, number>();
    categories.filter((c) => c.level === 'category').forEach((c) => m.set(c.name.trim().toLowerCase(), c.id));
    return m;
  }, [categories]);
  const subByName = useMemo(() => {
    const m = new Map<string, { id: number; categoryId: number | null }>();
    categories.filter((c) => c.level === 'subcategory').forEach((c) => m.set(c.name.trim().toLowerCase(), { id: c.id, categoryId: c.categoryId ?? null }));
    return m;
  }, [categories]);
  const locByCode = useMemo(() => {
    const m = new Map<string, number>();
    locations.filter((l) => l.kind === 'location').forEach((l) => {
      if (l.code) m.set(l.code.trim().toLowerCase(), l.locationId!);
      m.set(l.name.trim().toLowerCase(), l.locationId!);
    });
    return m;
  }, [locations]);

  const downloadTemplate = () => {
    const sample = [
      TEMPLATE_HEADERS.join(','),
      'AST-DEMO01,Demo Laptop,IT Equipment,Laptops,SN001,Dell,Latitude,2026-01-15,3500,AED,HQ,In Store,New,Owned,,,Bulk sample',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'asset-bulk-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setResult(null);
    if (!parsed.length) toast.error('No data rows found in the CSV');
    else toast.success(`${parsed.length} row(s) loaded — review then import`);
  };

  const mapped = useMemo(() => {
    return rows.map((r, i) => {
      const issues: string[] = [];
      const assetName = r.assetName?.trim() || r.AssetName?.trim() || '';
      const assetCode = r.assetCode?.trim() || r.AssetCode?.trim() || '';
      if (!assetName && !assetCode) issues.push('assetName or assetCode required');
      let categoryId: number | null = null;
      const catName = (r.categoryName || r.CategoryName || '').trim().toLowerCase();
      if (catName) {
        categoryId = catByName.get(catName) ?? null;
        if (!categoryId) issues.push(`Unknown category "${r.categoryName || r.CategoryName}"`);
      }
      let subCategoryId: number | null = null;
      const subName = (r.subCategoryName || r.SubCategoryName || '').trim().toLowerCase();
      if (subName) {
        const sub = subByName.get(subName);
        if (!sub) issues.push(`Unknown subcategory "${r.subCategoryName || r.SubCategoryName}"`);
        else {
          subCategoryId = sub.id;
          if (!categoryId) categoryId = sub.categoryId;
        }
      }
      let locationId: number | null = null;
      const locKey = (r.locationCode || r.LocationCode || r.locationName || '').trim().toLowerCase();
      if (locKey) {
        locationId = locByCode.get(locKey) ?? null;
        if (!locationId) issues.push(`Unknown location "${r.locationCode || r.locationName}"`);
      }
      const purchaseCost = r.purchaseCost || r.PurchaseCost ? Number(r.purchaseCost || r.PurchaseCost) : null;
      const asset: Partial<ApiAsset> = {
        assetCode: assetCode || null,
        assetName: assetName || assetCode || null,
        categoryId,
        subCategoryId,
        serialNumber: r.serialNumber || r.SerialNumber || null,
        brand: r.brand || r.Brand || null,
        model: r.model || r.Model || null,
        purchaseDate: r.purchaseDate || r.PurchaseDate || null,
        purchaseCost: Number.isFinite(purchaseCost as number) ? purchaseCost : null,
        currency: r.currency || r.Currency || 'AED',
        locationId,
        status: r.status || r.Status || 'In Store',
        condition: r.condition || r.Condition || 'New',
        ownershipType: r.ownershipType || r.OwnershipType || 'Owned',
        rfidTag: r.rfidTag || r.RfidTag || null,
        qrCode: r.qrCode || r.QrCode || null,
        remarks: r.remarks || r.Remarks || null,
      };
      return { row: i + 2, asset, issues };
    });
  }, [rows, catByName, subByName, locByCode]);

  const importRows = async () => {
    const valid = mapped.filter((m) => !m.issues.length).map((m) => m.asset);
    if (!valid.length) return toast.error('No valid rows to import');
    setBusy(true);
    try {
      const res = await assetApi.bulk(valid);
      setResult(res);
      toast.success(`Created ${res.created} asset(s)${res.errors.length ? `, ${res.errors.length} error(s)` : ''}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Assets', to: '/assets' }, { label: 'Bulk upload' }]}
        title="Bulk upload"
        subtitle="Import assets from a CSV. Category and location names/codes must already exist in master data."
        actions={
          <>
            <button className="btn" onClick={downloadTemplate}><Download size={16} /> Template</button>
            <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
              <Upload size={16} /> Choose CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </>
        }
      />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Preview">
          {!rows.length ? (
            <Empty title="No file loaded" message="Download the template, fill it in, then choose the CSV." />
          ) : (
            <>
              <div className="toolbar">
                <span className="small muted">{mapped.length} row(s) · {mapped.filter((m) => !m.issues.length).length} ready</span>
                <button className="btn btn-primary" disabled={busy} onClick={importRows}>Import ready rows</button>
              </div>
              <div style={{ maxHeight: 480, overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.map((m) => (
                      <tr key={m.row}>
                        <td className="mono">{m.row}</td>
                        <td className="mono">{m.asset.assetCode || '—'}</td>
                        <td>{m.asset.assetName}</td>
                        <td className={m.issues.length ? 'neg' : 'pos'}>{m.issues.length ? m.issues.join('; ') : 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
        <Card title="Result">
          {!result ? (
            <Empty title="Nothing imported yet" />
          ) : (
            <div className="stack">
              <Field label="Created">{result.created}</Field>
              {result.errors.length > 0 && (
                <div>
                  <div className="small bold neg mb">Server errors</div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="xs muted">Row {e.row}: {e.message}</div>
                  ))}
                </div>
              )}
              {result.assets.length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {result.assets.slice(0, 40).map((a) => (
                    <Link key={a.assetId} className="chip" to={`/assets/${a.assetId}`}>{a.assetCode}</Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
