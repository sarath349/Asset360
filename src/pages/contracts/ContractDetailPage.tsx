import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ExternalLink, FilePlus2, Link2, Pencil } from 'lucide-react';
import { ApiContractDocument, ApiContractVisit, contractApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, daysUntil, money, toInputDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Card, DataTable, Empty, ErrorState, Field, KV, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../../components/ui';
import { AssetSelect } from '../../components/pickers';
import { AutoView } from '../../components/AutoData';
import { ContractModal, expiryBadge } from './ContractsPage';

const VISIT_TYPES = ['Preventive', 'Corrective', 'Breakdown', 'Inspection'];

export default function ContractDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'assets';
  const { can } = useAuth();
  const toast = useToast();
  const { data: c, loading, error, reload } = useFetch(() => contractApi.get(id!), [id]);
  const [modal, setModal] = useState<'edit' | 'asset' | 'visit' | 'document' | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [assetId, setAssetId] = useState<string | null>(null);
  const done = () => {
    setModal(null);
    reload();
    setRefresh((n) => n + 1);
  };

  if (loading && !c) return <Loading />;
  if (error || !c) return <ErrorState message={error || 'Contract not found'} onRetry={reload} />;

  const used = c.totalVisits ? c.totalVisits - (c.remainingVisits ?? c.totalVisits) : null;

  const mapAsset = async () => {
    if (!assetId) return toast.error('Select an asset');
    try {
      await contractApi.mapAsset(c.contractId, assetId);
      toast.success('Asset linked to contract');
      setAssetId(null);
      done();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'AMC & Warranty', to: '/contracts' }, { label: c.contractNumber }]}
        title={
          <span className="row" style={{ gap: 10 }}>
            {c.contractNumber} {expiryBadge(daysUntil(c.endDate))}
          </span>
        }
        subtitle={`${c.contractType} · ${c.vendorName}`}
        actions={
          can('contracts', 'edit') && (
            <>
              <button className="btn" onClick={() => setModal('asset')}><Link2 size={16} /> Link asset</button>
              <button className="btn" onClick={() => setModal('visit')}><CalendarCheck size={16} /> Log visit</button>
              <button className="btn" onClick={() => setModal('document')}><FilePlus2 size={16} /> Add document</button>
              <button className="btn btn-primary" onClick={() => setModal('edit')}><Pencil size={16} /> Edit</button>
            </>
          )
        }
      />
      <div className="grid grid-2">
        <Card title="Contract">
          <KV
            items={[
              ['Type', c.contractType],
              ['Period', `${date(c.startDate)} → ${date(c.endDate)}`],
              ['Value', money(c.contractValue)],
              ['Coverage', c.coverage],
              ['SLA', c.sla],
              ['Visits', c.totalVisits ? `${used} used of ${c.totalVisits} · ${c.remainingVisits ?? c.totalVisits} left` : 'Unlimited / on-call'],
              ['Status', <StatusBadge status={c.status || undefined} />],
              ['Remarks', c.remarks],
            ]}
          />
        </Card>
        <Card title="Vendor contact">
          <KV
            items={[
              ['Vendor', c.vendorName],
              ['Contact person', c.contactPerson],
              ['Phone', c.contactPhone],
              ['Email', c.contactEmail ? <a href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a> : null],
              ['Created', dateTime(c.createdDate)],
              ['Updated', c.updatedDate ? dateTime(c.updatedDate) : null],
            ]}
          />
        </Card>
      </div>
      <div className="card mt">
        <Tabs
          active={tab}
          onChange={(t) => setParams(t === 'assets' ? {} : { tab: t }, { replace: true })}
          tabs={[
            { key: 'assets', label: 'Covered assets' },
            { key: 'visits', label: 'Service visits' },
            { key: 'documents', label: 'Documents' },
          ]}
        />
        {tab === 'assets' && <CoveredAssets contractId={c.contractId} refresh={refresh} />}
        {tab === 'visits' && <Visits contractId={c.contractId} refresh={refresh} />}
        {tab === 'documents' && <Documents contractId={c.contractId} refresh={refresh} />}
      </div>

      {modal === 'edit' && <ContractModal contract={c} onClose={() => setModal(null)} onDone={done} />}
      <Modal
        open={modal === 'asset'}
        onClose={() => setModal(null)}
        title="Link asset to contract"
        footer={
          <>
            <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={mapAsset}>Link asset</button>
          </>
        }
      >
        <Field label="Asset" required>
          <AssetSelect value={assetId} onChange={(v) => setAssetId(v)} />
        </Field>
      </Modal>
      {modal === 'visit' && <VisitModal contractId={c.contractId} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'document' && <DocumentModal contractId={c.contractId} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}

function CoveredAssets({ contractId, refresh }: { contractId: number; refresh: number }) {
  const { data, loading, error, reload } = useFetch(() => contractApi.assets(contractId), [contractId, refresh]);
  if (loading && data === null) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="card-body">
      <AutoView data={data} empty={<Empty title="No assets linked" message="Use Link asset to put assets under this contract." />} />
    </div>
  );
}

function Visits({ contractId, refresh }: { contractId: number; refresh: number }) {
  const names = useNames();
  const { data, loading, error, reload } = useFetch(() => contractApi.visits(contractId), [contractId, refresh]);
  if (loading && data === null) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <DataTable
      rows={(Array.isArray(data) ? data : []).map((v) => ({ ...v, _id: String(v.visitId) }))}
      initialSort={{ key: 'visitDate', dir: 'desc' }}
      empty={<Empty title="No visits logged" />}
      columns={[
        { key: 'visitDate', label: 'Date', sortValue: (v) => v.visitDate, render: (v) => date(v.visitDate) },
        { key: 'visitType', label: 'Type', render: (v) => v.visitType || '—' },
        { key: 'technicianName', label: 'Technician', render: (v) => v.technicianName || '—' },
        { key: 'assetId', label: 'Asset', render: (v) => (v.assetId ? `#${v.assetId}` : 'All covered') },
        { key: 'findings', label: 'Findings / action', render: (v) => <div className="small">{v.findings || v.description || '—'}{v.actionTaken && <div className="cell-sub">{v.actionTaken}</div>}</div> },
        { key: 'nextVisitDate', label: 'Next visit', render: (v) => date(v.nextVisitDate) },
        { key: 'createdBy', label: 'Logged by', render: (v) => names.user(v.createdBy) || '—' },
        { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v.status || undefined} /> },
      ]}
    />
  );
}

function Documents({ contractId, refresh }: { contractId: number; refresh: number }) {
  const names = useNames();
  const { data, loading, error, reload } = useFetch(() => contractApi.documents(contractId), [contractId, refresh]);
  if (loading && data === null) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <DataTable
      rows={(Array.isArray(data) ? data : []).map((d) => ({ ...d, _id: String(d.documentId) }))}
      empty={<Empty title="No documents" message="Attach the signed contract, SLA schedule or renewal quotes." />}
      columns={[
        { key: 'documentName', label: 'Document', render: (d) => <div><div className="cell-main">{d.documentName}</div><div className="cell-sub">{d.documentType}</div></div> },
        { key: 'uploadedDate', label: 'Added', render: (d) => dateTime(d.uploadedDate) },
        { key: 'uploadedBy', label: 'By', render: (d) => names.user(d.uploadedBy) || '—' },
        {
          key: 'filePath',
          label: '',
          sortable: false,
          className: 'right',
          render: (d) =>
            /^https?:\/\//.test(d.filePath) || d.filePath.startsWith('/') ? (
              <a className="btn btn-sm" href={d.filePath} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
            ) : (
              <span className="mono xs muted">{d.filePath}</span>
            ),
        },
      ]}
    />
  );
}

function VisitModal({ contractId, onClose, onDone }: { contractId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState<Partial<ApiContractVisit>>({ visitDate: toInputDate(new Date()), visitType: 'Preventive', status: 'Completed' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ApiContractVisit>(k: K, v: ApiContractVisit[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!f.visitDate) return toast.error('Visit date is required');
    setBusy(true);
    try {
      await contractApi.addVisit({ ...f, contractId, createdBy: user?.userId || null });
      toast.success('Visit logged');
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
      title="Log service visit"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Save visit</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Visit date" required>
          <input type="date" className="input" value={toInputDate(f.visitDate)} onChange={(e) => set('visitDate', e.target.value)} />
        </Field>
        <Field label="Visit type">
          <select className="select" value={f.visitType || ''} onChange={(e) => set('visitType', e.target.value)}>
            {VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Technician">
          <input className="input" value={f.technicianName || ''} onChange={(e) => set('technicianName', e.target.value)} />
        </Field>
        <Field label="Asset" hint="Leave empty if the visit covered all assets">
          <AssetSelect value={f.assetId ? String(f.assetId) : null} onChange={(v) => set('assetId', v ? Number(v) : null)} />
        </Field>
        <Field label="Description" className="full">
          <textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Findings">
          <textarea className="textarea" value={f.findings || ''} onChange={(e) => set('findings', e.target.value)} />
        </Field>
        <Field label="Action taken">
          <textarea className="textarea" value={f.actionTaken || ''} onChange={(e) => set('actionTaken', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="select" value={f.status || ''} onChange={(e) => set('status', e.target.value)}>
            {['Completed', 'Scheduled', 'Pending', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Next visit">
          <input type="date" className="input" value={toInputDate(f.nextVisitDate)} onChange={(e) => set('nextVisitDate', e.target.value || null)} />
        </Field>
      </div>
    </Modal>
  );
}

function DocumentModal({ contractId, onClose, onDone }: { contractId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState<Partial<ApiContractDocument>>({ documentType: 'Contract' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ApiContractDocument>(k: K, v: ApiContractDocument[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!f.documentName?.trim() || !f.filePath?.trim()) return toast.error('Document name and link are required');
    setBusy(true);
    try {
      await contractApi.addDocument({ ...f, documentName: f.documentName.trim(), filePath: f.filePath.trim(), contractId, uploadedBy: user?.userId || null });
      toast.success('Document added');
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
      title="Add contract document"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Add document</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Document name" required>
          <input className="input" value={f.documentName || ''} onChange={(e) => set('documentName', e.target.value)} placeholder="e.g. Signed AMC 2026" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={f.documentType || ''} onChange={(e) => set('documentType', e.target.value)}>
            {['Contract', 'SLA', 'Invoice', 'Quotation', 'Renewal', 'Other'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="File link / path" required hint="The AssetAPI stores a link; there is no file-upload endpoint yet">
          <input className="input" value={f.filePath || ''} onChange={(e) => set('filePath', e.target.value)} placeholder="https://… or \\server\share\file.pdf" />
        </Field>
      </div>
    </Modal>
  );
}
