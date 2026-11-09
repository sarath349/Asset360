import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Plus, Wrench } from 'lucide-react';
import { ApiMaintenanceJob, maintenanceApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { Badge, DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, SearchInput, StatusBadge, Tabs } from '../../components/ui';
import { AssetSelect } from '../../components/pickers';
import { useToast } from '../../context/ToastContext';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const JOB_TYPES = ['Preventive maintenance', 'Fault', 'Breakdown', 'Repair request'];
const PRIORITY_TONE: Record<string, string> = { Low: 'slate', Medium: 'blue', High: 'amber', Critical: 'red' };

export default function MaintenancePage() {
  const { can, user } = useAuth();
  const { inScope } = useBranch();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useFetch(() => maintenanceApi.list(), []);

  const all = useMemo(
    () => (data || []).filter((j) => j.kind !== 'incident' && (!j.locationId || inScope(j.locationId))),
    [data, inScope]
  );
  const count = (s: string[]) => all.filter((j) => s.includes(j.status)).length;

  const list = useMemo(() => {
    let l = all;
    if (tab === 'open') l = l.filter((j) => j.status === 'Open');
    else if (tab === 'progress') l = l.filter((j) => j.status === 'In Progress');
    else if (tab === 'done') l = l.filter((j) => ['Completed', 'Cancelled'].includes(j.status));
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((j) => [j.title, j.assetCode, j.assetName, j.type, j.priority].some((x) => x?.toLowerCase().includes(s)));
    }
    return l.map((j) => ({ ...j, _id: String(j.jobId) }));
  }, [all, tab, q]);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Work orders for preventive maintenance, faults, breakdowns and repairs — shared between web and mobile."
        actions={can('maintenance', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New job</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Open" value={count(['Open'])} icon={<Clock size={19} />} toneName="amber" onClick={() => setTab('open')} />
        <Kpi label="In progress" value={count(['In Progress'])} icon={<Wrench size={19} />} toneName="blue" onClick={() => setTab('progress')} />
        <Kpi label="Completed" value={count(['Completed'])} icon={<CheckCircle2 size={19} />} toneName="green" onClick={() => setTab('done')} />
        <Kpi label="All jobs" value={all.length} icon={<Wrench size={19} />} />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'open', label: 'Open', count: count(['Open']) },
            { key: 'progress', label: 'In progress', count: count(['In Progress']) },
            { key: 'done', label: 'Done', count: count(['Completed', 'Cancelled']) },
            { key: 'all', label: 'All', count: all.length },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search jobs, assets…" />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list}
            onRowClick={(j) => navigate(`/maintenance/${j.jobId}`)}
            initialSort={{ key: 'createdDate', dir: 'desc' }}
            empty={<Empty title="No maintenance jobs" message="Create a job from the portal or mobile app." />}
            columns={[
              {
                key: 'title',
                label: 'Job',
                render: (j: ApiMaintenanceJob) => (
                  <div>
                    <div className="cell-main">{j.title}</div>
                    <div className="cell-sub">{j.type} · {dateTime(j.createdDate)}</div>
                  </div>
                ),
              },
              {
                key: 'asset',
                label: 'Asset',
                render: (j: ApiMaintenanceJob) =>
                  j.assetId ? (
                    <div>
                      <div className="small bold">{j.assetName || '—'}</div>
                      <div className="cell-sub mono">{j.assetCode}</div>
                    </div>
                  ) : (
                    '—'
                  ),
              },
              { key: 'priority', label: 'Priority', render: (j: ApiMaintenanceJob) => <Badge color={PRIORITY_TONE[j.priority] || 'slate'}>{j.priority}</Badge> },
              { key: 'dueDate', label: 'Due', render: (j: ApiMaintenanceJob) => (j.dueDate ? date(j.dueDate) : '—') },
              { key: 'status', label: 'Status', render: (j: ApiMaintenanceJob) => <StatusBadge status={j.status} /> },
            ]}
          />
        )}
      </div>
      <NewJobModal
        open={open}
        onClose={() => setOpen(false)}
        userId={user?.userId ?? null}
        userName={user?.name || ''}
        onDone={(id) => {
          setOpen(false);
          if (id) navigate(`/maintenance/${id}`);
          else reload();
        }}
        onError={(err) => toast.error(err)}
      />
    </>
  );
}

function NewJobModal({
  open,
  onClose,
  onDone,
  onError,
  userId,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (id?: number) => void;
  onError: (err: unknown) => void;
  userId: number | null;
  userName: string;
}) {
  const [asset, setAsset] = useState<{ assetId: number; assetCode: string | null; assetName: string | null; locationId: number | null } | null>(null);
  const [type, setType] = useState(JOB_TYPES[0]);
  const [priority, setPriority] = useState('Medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!asset && !title.trim()) return onError('Pick an asset or enter a title');
    setBusy(true);
    try {
      const job = await maintenanceApi.create({
        kind: type === 'Preventive maintenance' ? 'maintenance' : 'fault',
        type,
        assetId: asset?.assetId ?? null,
        assetCode: asset?.assetCode || null,
        assetName: asset?.assetName || null,
        locationId: asset?.locationId ?? null,
        title: title.trim() || `${type}: ${asset?.assetName || asset?.assetCode}`,
        description,
        priority,
        status: 'Open',
        createdBy: userId,
        createdByName: userName,
        dueDate: dueDate || null,
      });
      onDone(job.jobId);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New maintenance job" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="stack">
        <Field label="Asset"><AssetSelect value={asset ? String(asset.assetId) : null} onChange={(_, a) => setAsset(a ? { assetId: a.assetId, assetCode: a.assetCode, assetName: a.assetName, locationId: a.locationId } : null)} /></Field>
        <Field label="Type">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Compressor not cooling" /></Field>
        <Field label="Description"><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Due date"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
