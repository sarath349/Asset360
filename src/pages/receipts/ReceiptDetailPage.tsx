import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, PackagePlus, Plus, Trash2, XCircle } from 'lucide-react';
import { ApiReceiptLine, approvalLevelApi, nowIso, receiptApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useData, useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Card, ErrorState, Field, KV, Loading, Modal, PageHeader, StatusBadge } from '../../components/ui';
import { LocationPicker, SearchSelect } from '../../components/pickers';
import { receiptStage } from './ReceiptsPage';

const emptyLine = (): ApiReceiptLine => ({
  assetName: '',
  categoryId: null,
  subCategoryId: null,
  assetTypeId: null,
  qty: 1,
  unitCost: 0,
  currency: 'AED',
  brand: '',
  model: '',
  serialNumbers: [],
  condition: 'New',
  ownershipType: 'Owned',
});

export function NewReceiptModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id?: number) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { categories } = useData();
  const [vendorName, setVendorName] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<ApiReceiptLine[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);

  const catOptions = useMemo(
    () => categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name })),
    [categories]
  );

  const save = async () => {
    if (!lines.some((l) => l.assetName?.trim() && l.categoryId)) return toast.error('Add at least one line with name and category');
    setBusy(true);
    try {
      const r = await receiptApi.create({
        vendorName: vendorName || null,
        poNumber: poNumber || null,
        receiptDate: receiptDate ? new Date(receiptDate).toISOString() : nowIso(),
        receivedBy: user?.userId ?? null,
        locationId: locationId ? Number(locationId) : null,
        remarks: remarks || null,
        lines: lines.filter((l) => l.assetName?.trim()),
      });
      onDone(r.receiptId);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const setLine = (i: number, patch: Partial<ApiReceiptLine>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Modal open={open} onClose={onClose} title="New receipt" size="xl" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="stack">
        <div className="grid grid-2">
          <Field label="Vendor"><input className="input" value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></Field>
          <Field label="PO number"><input className="input" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} /></Field>
          <Field label="Receipt date"><input type="date" className="input" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} /></Field>
          <Field label="Location"><LocationPicker value={locationId} onChange={setLocationId} /></Field>
        </div>
        <Field label="Remarks"><textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        <div className="row-between">
          <b className="small">Lines</b>
          <button className="btn btn-sm" type="button" onClick={() => setLines((p) => [...p, emptyLine()])}><Plus size={14} /> Add line</button>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="card" style={{ padding: 12 }}>
            <div className="grid grid-2">
              <Field label="Asset name *"><input className="input" value={l.assetName || ''} onChange={(e) => setLine(i, { assetName: e.target.value })} /></Field>
              <Field label="Category *">
                <SearchSelect options={catOptions} value={l.categoryId ? String(l.categoryId) : null} onChange={(v) => setLine(i, { categoryId: v ? Number(v) : null })} placeholder="Category" />
              </Field>
              <Field label="Qty"><input type="number" min={1} className="input" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 1 })} /></Field>
              <Field label="Unit cost"><input type="number" min={0} step="0.01" className="input" value={l.unitCost ?? ''} onChange={(e) => setLine(i, { unitCost: e.target.value === '' ? 0 : Number(e.target.value) })} /></Field>
              <Field label="Brand"><input className="input" value={l.brand || ''} onChange={(e) => setLine(i, { brand: e.target.value })} /></Field>
              <Field label="Model"><input className="input" value={l.model || ''} onChange={(e) => setLine(i, { model: e.target.value })} /></Field>
              <Field label="Serial numbers (one per qty, comma or newline)">
                <textarea
                  className="textarea"
                  value={(l.serialNumbers || []).join('\n')}
                  onChange={(e) => setLine(i, { serialNumbers: e.target.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) })}
                />
              </Field>
            </div>
            {lines.length > 1 && (
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}><Trash2 size={14} /> Remove</button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function ReceiptDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { can, user } = useAuth();
  const names = useNames();
  const { categories } = useData();
  const { data, loading, error, reload } = useFetch(async () => {
    const receipt = await receiptApi.get(id!);
    const levels = await approvalLevelApi.list('receipt').catch(() => []);
    return { receipt, levels: levels.filter((l) => l.isActive).sort((a, b) => a.stepOrder - b.stepOrder) };
  }, [id]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const categoryName = (cid?: number | null) => (cid ? categories.find((c) => c.level === 'category' && c.id === cid)?.name || `Category #${cid}` : '—');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error || 'Receipt not found'} onRetry={reload} />;
  const { receipt, levels } = data;
  const stage = receiptStage(receipt);
  const requiredRole = levels[0]?.role || null;
  const roleOk = !requiredRole || !user?.role || user.role.trim().toLowerCase() === requiredRole.trim().toLowerCase() || /admin/i.test(user.role);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      if (approve && !roleOk) {
        toast.error(`This step requires role “${requiredRole}”`);
        return;
      }
      const body = { approvedBy: user?.userId ?? null, approvalRemarks: remarks || null };
      await (approve ? receiptApi.approve(receipt.receiptId, body) : receiptApi.reject(receipt.receiptId, body));
      toast.success(approve ? 'Approved' : 'Rejected');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const postAssets = async () => {
    setBusy(true);
    try {
      const r = await receiptApi.post(receipt.receiptId);
      toast.success(`Posted ${r.postedAssetIds?.length || 0} asset(s)`);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Receipt', to: '/receipts' }, { label: receipt.receiptNumber }]}
        title={<span className="row" style={{ gap: 10 }}>{receipt.receiptNumber} <StatusBadge status={receipt.approvalStatus} /></span>}
        subtitle={receipt.vendorName || 'No vendor'}
        actions={
          can('procurement', 'approve') && (
            <>
              {stage === 'pending' && (
                <>
                  <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}><CheckCircle2 size={16} /> Approve</button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => decide(false)}><XCircle size={16} /> Reject</button>
                </>
              )}
              {stage === 'approved' && (
                <button className="btn btn-primary" disabled={busy} onClick={postAssets}><PackagePlus size={16} /> Post assets</button>
              )}
            </>
          )
        }
      />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Receipt">
          <KV
            items={[
              ['Vendor', receipt.vendorName],
              ['PO', receipt.poNumber],
              ['Date', date(receipt.receiptDate)],
              ['Received by', names.user(receipt.receivedBy)],
              ['Location', names.location(receipt.locationId)],
              ['Remarks', receipt.remarks],
              ['Required role', requiredRole || 'Any approver'],
              ['Approval levels', levels.length ? levels.map((l) => `${l.levelCode} ${l.levelName}`).join(' → ') : 'Default (single step)'],
              ['Approved by', names.user(receipt.approvedBy)],
              ['Decision', receipt.approvalDate ? dateTime(receipt.approvalDate) : null],
              ['Approval remarks', receipt.approvalRemarks],
            ]}
          />
          {stage === 'pending' && (
            <Field label="Approval remarks" hint="Optional note when approving or rejecting">
              <textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          )}
        </Card>
        <Card title="Lines">
          {(receipt.lines || []).map((l, i) => (
            <div key={i} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="bold small">{l.assetName}</div>
                <div className="xs muted">{categoryName(l.categoryId)} · Qty {l.qty} · {money(l.unitCost)}</div>
                {(l.serialNumbers || []).length > 0 && <div className="xs mono muted">{(l.serialNumbers || []).join(', ')}</div>}
              </div>
              <div className="small muted">{[l.brand, l.model].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          ))}
          {(receipt.postedAssetIds || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="small bold mb">Posted assets</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {receipt.postedAssetIds.map((aid) => (
                  <Link key={aid} className="chip" to={`/assets/${aid}`}>#{aid}</Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
