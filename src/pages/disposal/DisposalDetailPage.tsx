import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Trash2, XCircle } from 'lucide-react';
import { ApiDisposal, approvalLevelApi, assetApi, DISPOSAL_METHODS, disposalApi, nowIso } from '../../api/assetApi';
import { forgetCachedAsset } from '../../lib/assetLookup';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, money, toInputDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Card, ErrorState, Field, KV, Loading, Modal, PageHeader, StatusBadge, Switch } from '../../components/ui';
import { disposalStage } from './DisposalPage';

const link = (path?: string | null) =>
  path ? (
    /^https?:\/\//.test(path) ? (
      <a href={path} target="_blank" rel="noreferrer">
        Open <ExternalLink size={12} />
      </a>
    ) : (
      <span className="mono xs">{path}</span>
    )
  ) : null;

export default function DisposalDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { can, user } = useAuth();
  const names = useNames();
  const { data, loading, error, reload } = useFetch(async () => {
    const d = await disposalApi.get(id!);
    const asset = await assetApi.get(d.assetId).catch(() => null);
    const levels = await approvalLevelApi.list('disposal').catch(() => []);
    return { d, asset, levels: levels.filter((l) => l.isActive).sort((a, b) => a.stepOrder - b.stepOrder) };
  }, [id]);
  const [modal, setModal] = useState<'approve' | 'reject' | 'complete' | null>(null);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error || 'Disposal request not found'} onRetry={reload} />;
  const { d, asset, levels } = data;
  const stage = disposalStage(d);
  const requiredRole = levels[0]?.role || null;
  const roleOk = !requiredRole || !user?.role || user.role.trim().toLowerCase() === requiredRole.trim().toLowerCase() || /admin/i.test(user.role);

  const decide = async (approve: boolean, remarks: string) => {
    try {
      if (approve && !roleOk) {
        toast.error(`This step requires role “${requiredRole}”`);
        return;
      }
      const body: ApiDisposal = { ...d, approvalStatus: approve ? 'Approved' : 'Rejected', approvedBy: user?.userId || null, approvalDate: nowIso(), approvalRemarks: remarks || null, updatedDate: nowIso() };
      await (approve ? disposalApi.approve(body) : disposalApi.reject(body));
      setModal(null);
      await reload();
      if (approve) {
        // Approve alone does not remove the asset — guide straight into completion.
        toast.success('Approved. Complete disposal to retire the asset from the register.');
        setModal('complete');
      } else {
        toast.success('Request rejected');
      }
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Disposal', to: '/disposal' }, { label: d.disposalRequestNumber }]}
        title={
          <span className="row" style={{ gap: 10 }}>
            {d.disposalRequestNumber} <StatusBadge status={d.approvalStatus || 'Pending'} />
          </span>
        }
        subtitle={
          asset ? (
            <Link to={`/assets/${asset.assetId}`}>
              {asset.assetCode} · {asset.assetName}
            </Link>
          ) : (
            `Asset #${d.assetId}`
          )
        }
        actions={
          can('disposal', 'approve') && (
            <>
              {stage === 'pending' && (
                <>
                  <button className="btn" onClick={() => setModal('reject')}><XCircle size={16} /> Reject</button>
                  <button className="btn btn-success" onClick={() => setModal('approve')}><CheckCircle2 size={16} /> Approve</button>
                </>
              )}
              {stage === 'approved' && (
                <button className="btn btn-danger" onClick={() => setModal('complete')} title="This retires the asset (status → Disposed)">
                  <Trash2 size={16} /> Complete disposal
                </button>
              )}
            </>
          )
        }
      />
      <div className="grid grid-2">
        <Card title="Request">
          <KV
            items={[
              ['Requested on', date(d.requestDate)],
              ['Requested by', names.user(d.requestedBy)],
              ['Reason', d.retirementReason],
              ['Asset condition', d.assetCondition],
              ['Proposed method', d.requestedDisposalMethod],
              ['Data wiping', d.dataWipingRequired ? (d.dataWipingCompleted ? `Completed ${date(d.dataWipingDate)}` : 'Required') : 'Not required'],
              ['Asset cost', money(asset?.purchaseCost)],
              ['Asset status', <StatusBadge status={asset?.status || undefined} />],
            ]}
          />
        </Card>
        <div className="stack" style={{ gap: 18 }}>
          <Card title="Approval">
            <KV
              items={[
                ['Status', <StatusBadge status={d.approvalStatus || 'Pending'} />],
                ['Required role', requiredRole || 'Any approver'],
                ['Approval levels', levels.length ? levels.map((l) => `${l.levelCode} ${l.levelName}`).join(' → ') : 'Default (single step)'],
                ['Decided by', names.user(d.approvedBy)],
                ['Decided on', d.approvalDate ? dateTime(d.approvalDate) : null],
                ['Remarks', d.approvalRemarks],
              ]}
            />
          </Card>
          <Card title="Disposal">
            <KV
              items={[
                ['Method', d.disposalMethod],
                ['Date', date(d.disposalDate)],
                ['Sale / recovery value', money(d.disposalValue)],
                ['Buyer / vendor', d.buyerVendorName],
                ['Buyer contact', d.buyerVendorContact],
                ['Disposal certificate', link(d.disposalCertificatePath)],
                ['Data-wiping certificate', link(d.dataWipingCertificatePath)],
                ['Final asset status', d.finalAssetStatus],
                ['Remarks', d.disposalRemarks],
              ]}
            />
          </Card>
        </div>
      </div>
      {(modal === 'approve' || modal === 'reject') && <DecisionModal approve={modal === 'approve'} onClose={() => setModal(null)} onSubmit={(r) => decide(modal === 'approve', r)} />}
      {modal === 'complete' && (
        <CompleteModal
          disposal={d}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function DecisionModal({ approve, onClose, onSubmit }: { approve: boolean; onClose: () => void; onSubmit: (remarks: string) => Promise<void> }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? 'Approve disposal request' : 'Reject disposal request'}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${approve ? 'btn-success' : 'btn-danger'}`}
            disabled={busy || (!approve && !remarks.trim())}
            onClick={async () => {
              setBusy(true);
              await onSubmit(remarks.trim());
              setBusy(false);
            }}
          >
            {approve ? 'Approve' : 'Reject'}
          </button>
        </>
      }
    >
      <Field label="Remarks" required={!approve}>
        <textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}

function CompleteModal({ disposal, onClose, onDone }: { disposal: ApiDisposal; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<ApiDisposal>({
    ...disposal,
    disposalMethod: disposal.disposalMethod || disposal.requestedDisposalMethod || DISPOSAL_METHODS[0],
    disposalDate: toInputDate(disposal.disposalDate) || toInputDate(new Date()),
    finalAssetStatus: disposal.finalAssetStatus || 'Disposed',
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ApiDisposal>(k: K, v: ApiDisposal[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (disposal.dataWipingRequired && !f.dataWipingCompleted) return toast.error('Confirm data wiping before completing the disposal');
    setBusy(true);
    try {
      await disposalApi.complete({ ...f, disposalValue: f.disposalValue === null || String(f.disposalValue) === '' ? null : Number(f.disposalValue), updatedDate: nowIso() });
      forgetCachedAsset(disposal.assetId);
      toast.success('Disposal completed — asset marked Disposed and hidden from the active register');
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Complete disposal"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>Complete disposal</button>
        </>
      }
    >
      <div className="alert alert-warn mb" style={{ fontSize: 13 }}>
        Approving only signed off the request. Completing disposal sets the asset status to <b>Disposed</b> and removes it from the active asset list.
      </div>
      <div className="form-grid">
        <Field label="Disposal method" required>
          <select className="select" value={f.disposalMethod || ''} onChange={(e) => set('disposalMethod', e.target.value)}>
            {DISPOSAL_METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Disposal date" required>
          <input type="date" className="input" value={toInputDate(f.disposalDate)} onChange={(e) => set('disposalDate', e.target.value)} />
        </Field>
        <Field label="Sale / recovery value">
          <input type="number" min={0} step="0.01" className="input" value={f.disposalValue ?? ''} onChange={(e) => set('disposalValue', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Final asset status">
          <select className="select" value={f.finalAssetStatus || ''} onChange={(e) => set('finalAssetStatus', e.target.value)}>
            {['Disposed', 'Retired'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Buyer / vendor">
          <input className="input" value={f.buyerVendorName || ''} onChange={(e) => set('buyerVendorName', e.target.value)} />
        </Field>
        <Field label="Buyer contact">
          <input className="input" value={f.buyerVendorContact || ''} onChange={(e) => set('buyerVendorContact', e.target.value)} />
        </Field>
        <Field label="Disposal certificate link" className="full">
          <input className="input" value={f.disposalCertificatePath || ''} onChange={(e) => set('disposalCertificatePath', e.target.value)} placeholder="https://…" />
        </Field>
        {disposal.dataWipingRequired && (
          <>
            <label className="row small" style={{ gap: 10 }}>
              <Switch checked={f.dataWipingCompleted} onChange={(v) => set('dataWipingCompleted', v)} /> Data wiping completed
            </label>
            <Field label="Data wiping date">
              <input type="date" className="input" value={toInputDate(f.dataWipingDate)} onChange={(e) => set('dataWipingDate', e.target.value || null)} />
            </Field>
            <Field label="Data-wiping certificate link" className="full">
              <input className="input" value={f.dataWipingCertificatePath || ''} onChange={(e) => set('dataWipingCertificatePath', e.target.value)} placeholder="https://…" />
            </Field>
          </>
        )}
        <Field label="Remarks" className="full">
          <textarea className="textarea" value={f.disposalRemarks || ''} onChange={(e) => set('disposalRemarks', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
