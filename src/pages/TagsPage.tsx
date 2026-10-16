import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Printer, QrCode, Radio, ScanBarcode, Tag } from 'lucide-react';
import { ApiAsset, assetApi } from '../api/assetApi';
import { useFetch } from '../lib/hooks';
import { printLabels } from '../lib/labels';
import { useBranch } from '../context/BranchContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { descendantIds } from '../lib/tree';
import { Card, Empty, ErrorState, Kpi, Loading, PageHeader, SearchInput, Segmented } from '../components/ui';
import { LocationPicker, SearchSelect } from '../components/pickers';
import { AssetLabel } from '../components/codes';

export default function TagsPage() {
  const [params] = useSearchParams();
  const toast = useToast();
  const { categories, locations } = useData();
  const { inScope, activeBranch } = useBranch();
  const [mode, setMode] = useState<'qr' | 'barcode' | 'both'>('both');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set(params.get('ids')?.split(',').map(Number).filter(Boolean) || []));
  const { data, loading, error, reload } = useFetch(() => assetApi.list(), []);

  const list = useMemo(() => {
    let l = (data || []).filter((a) => inScope(a.locationId));
    if (category) l = l.filter((a) => String(a.categoryId) === category);
    if (location) {
      const ids = new Set(descendantIds(location, locations));
      l = l.filter((a) => a.locationId && ids.has(String(a.locationId)));
    }
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((a) => [a.assetCode, a.assetName, a.serialNumber, a.rfidTag].some((x) => x?.toLowerCase().includes(s)));
    }
    return l;
  }, [data, inScope, category, location, locations, q]);

  const chosen = useMemo(() => (data || []).filter((a) => selected.has(a.assetId)), [data, selected]);
  const toggle = (a: ApiAsset) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(a.assetId)) n.delete(a.assetId);
      else n.add(a.assetId);
      return n;
    });
  const labelOf = (a: ApiAsset) => ({ code: a.assetCode || String(a.assetId), name: a.assetName || '', rfid: a.rfidTag });

  const print = async () => {
    try {
      await printLabels(chosen.map(labelOf), mode, activeBranch?.name);
    } catch (err) {
      toast.error(err);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="QR / Barcode Labels"
        subtitle="Select assets and print their labels. The QR opens the asset when scanned; the barcode holds the asset code."
        actions={
          <button className="btn btn-primary" disabled={!chosen.length} onClick={print}>
            <Printer size={16} /> Print {chosen.length || ''} label{chosen.length === 1 ? '' : 's'}
          </button>
        }
      />
      <div className="grid grid-kpi mb no-print">
        <Kpi label="Assets in view" value={list.length} icon={<Tag size={19} />} />
        <Kpi label="With RFID tag" value={list.filter((a) => a.rfidTag).length} icon={<Radio size={19} />} toneName="purple" />
        <Kpi label="With QR value" value={list.filter((a) => a.qrCode).length} icon={<QrCode size={19} />} toneName="green" />
        <Kpi label="Selected" value={chosen.length} icon={<CheckCircle2 size={19} />} toneName="amber" />
      </div>
      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <div className="card no-print">
          <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search assets…" />
            <SearchSelect
              options={categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name }))}
              value={category}
              onChange={setCategory}
              placeholder="Any category"
            />
            <LocationPicker value={location} onChange={setLocation} placeholder="Any location" />
            <div className="row-between">
              <span className="small muted">{list.length} shown</span>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set([...selected, ...list.map((a) => a.assetId)]))}>All shown</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>None</button>
              </div>
            </div>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
            {loading && !data ? (
              <Loading />
            ) : (
              list.slice(0, 400).map((a) => (
                <label key={a.assetId} className="list-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(a.assetId)} onChange={() => toggle(a)} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cell-main ellipsis">{a.assetName || '(unnamed)'}</div>
                    <div className="cell-sub mono">{a.assetCode || `#${a.assetId}`}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="span-2">
          <Card
            title="Label preview"
            subtitle={`${chosen.length} label${chosen.length === 1 ? '' : 's'}`}
            actions={<Segmented value={mode} onChange={(v) => setMode(v as any)} options={[{ value: 'qr', label: 'QR' }, { value: 'barcode', label: 'Barcode' }, { value: 'both', label: 'QR + Barcode' }]} />}
          >
            {chosen.length ? (
              <div className="labels">
                {chosen.slice(0, 60).map((a) => (
                  <AssetLabel key={a.assetId} asset={{ assetId: a.assetCode || String(a.assetId), name: a.assetName, tag: { barcode: a.assetCode || undefined, rfid: a.rfidTag || undefined } }} company={activeBranch?.name} mode={mode} />
                ))}
              </div>
            ) : (
              <Empty icon={<ScanBarcode size={24} />} title="No assets selected" message="Pick assets on the left to preview and print their labels." />
            )}
            {chosen.length > 60 && <div className="small muted mt-sm">Preview shows the first 60; all {chosen.length} are printed.</div>}
          </Card>
        </div>
      </div>
    </>
  );
}
