import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, MapPin, Plus, Trash2, Undo2, UserCheck, Wrench } from 'lucide-react';
import { ApiAsset, assetApi, AssignmentAction, assignmentApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useNames } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { loadAssets } from '../lib/assetLookup';
import { date, dateTime, daysUntil } from '../lib/format';
import { tryGpsText } from '../lib/geo';
import { useFetch } from '../lib/hooks';
import { Badge, Confirm, Empty, Field, Loading, Segmented } from '../components/ui';
import { AssignmentModal } from '../components/assetModals';
import { AssetScanSelect, LocalNote, PhotoPicker, PRIORITIES, Top } from './kit';
import { getJob, Job, JobKind, newId, removeJob, saveJob, SparePart, useJobs, useSettings } from './deviceStore';

const PRIORITY_TONE: Record<string, string> = { Low: 'slate', Medium: 'blue', High: 'amber', Critical: 'red' };
const JOB_TYPES = ['Preventive maintenance', 'Fault', 'Breakdown', 'Repair request'];

async function setAssetStatus(assetId: number, status: string) {
  const a = await assetApi.get(assetId);
  await assetApi.update(assetId, { ...a, status, updatedDate: new Date().toISOString() });
  return a.status;
}

// ---------- maintenance ----------

export function MMaintenance() {
  const jobs = useJobs();
  const { inScope } = useBranch();
  const [tab, setTab] = useState('open');
  const list = useMemo(
    () =>
      jobs
        .filter((j) => j.kind !== 'incident' && (!j.assetId || inScope(j.locationId)))
        .filter((j) => (tab === 'open' ? j.status === 'Open' : tab === 'progress' ? j.status === 'In Progress' : ['Completed', 'Cancelled'].includes(j.status))),
    [jobs, tab, inScope]
  );
  const count = (s: string[]) => jobs.filter((j) => j.kind !== 'incident' && s.includes(j.status)).length;

  return (
    <>
      <Top title="Maintenance tasks" sub="Jobs, faults and repair requests" back right={<Link to="/m/maintenance/new" className="m-back" aria-label="New job"><Plus size={18} /></Link>} />
      <div className="m-body">
        <LocalNote />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: `Open (${count(['Open'])})` },
            { value: 'progress', label: `In progress (${count(['In Progress'])})` },
            { value: 'done', label: `Done (${count(['Completed', 'Cancelled'])})` },
          ]}
        />
        <div style={{ marginTop: 12 }}>
          {list.length === 0 ? (
            <Empty icon={<Wrench size={24} />} title="No jobs here" message="Create a job from an asset, or report a fault." action={<Link className="btn btn-primary btn-sm" to="/m/maintenance/new"><Plus size={14} /> New job</Link>} />
          ) : (
            list.map((j) => <JobCard key={j.id} j={j} />)
          )}
        </div>
      </div>
    </>
  );
}

function JobCard({ j }: { j: Job }) {
  const overdue = j.dueDate && !['Completed', 'Cancelled'].includes(j.status) && (daysUntil(j.dueDate) ?? 0) < 0;
  return (
    <Link to={`/m/maintenance/${j.id}`} className="m-card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
      <div className="row-between">
        <b className="ellipsis">{j.title}</b>
        <Badge color={PRIORITY_TONE[j.priority]}>{j.priority}</Badge>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {j.assetName ? `${j.assetName} · ${j.assetCode}` : 'No asset'} · {j.type}
      </div>
      <div className="row-between xs" style={{ marginTop: 8 }}>
        <span className="muted">{j.status} · {dateTime(j.createdAt)}</span>
        {j.dueDate && <span className={overdue ? 'neg bold' : 'muted'}>{overdue ? 'Overdue ' : 'Due '}{date(j.dueDate)}</span>}
      </div>
    </Link>
  );
}

export function MJobNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const settings = useSettings();
  const [asset, setAsset] = useState<ApiAsset | null>(null);
  const [type, setType] = useState(params.get('type') || JOB_TYPES[0]);
  const [priority, setPriority] = useState<Job['priority']>('Medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = params.get('asset');
    if (id) assetApi.get(id).then(setAsset).catch(() => undefined);
  }, [params]);

  const save = async () => {
    if (!asset && !title.trim()) return toast.error('Pick an asset or enter a title');
    setBusy(true);
    const gps = settings.gps ? await tryGpsText() : '';
    const job: Job = {
      id: newId(),
      kind: (type === 'Preventive maintenance' ? 'maintenance' : 'fault') as JobKind,
      type,
      assetId: asset?.assetId ?? null,
      assetCode: asset?.assetCode || '',
      assetName: asset?.assetName || '',
      locationId: asset?.locationId ?? null,
      title: title.trim() || `${type}: ${asset?.assetName || asset?.assetCode}`,
      description,
      priority,
      status: 'Open',
      createdAt: new Date().toISOString(),
      createdBy: user?.userId ?? null,
      createdByName: user?.name || '',
      dueDate: dueDate || null,
      beforePhotos: photos,
      gps,
    };
    saveJob(job);
    toast.success('Job created');
    navigate(`/m/maintenance/${job.id}`, { replace: true });
  };

  return (
    <>
      <Top title="New job" sub="Maintenance, fault, breakdown or repair request" back />
      <div className="m-body">
        <LocalNote />
        <div className="m-card stack">
          <Field label="Asset"><AssetScanSelect value={asset} onChange={setAsset} /></Field>
          <Field label="Type">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {JOB_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <Segmented value={priority} onChange={(v) => setPriority(v as Job['priority'])} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
          </Field>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Compressor not cooling" /></Field>
          <Field label="Description / fault details"><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Due date"><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <PhotoPicker label="Before photos" photos={photos} onChange={setPhotos} />
        </div>
        <button className="btn btn-primary btn-lg btn-block mt" disabled={busy} onClick={save}>Create job</button>
      </div>
    </>
  );
}

export function MJob() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [job, setJob] = useState<Job | null>(() => getJob(id!));
  const [markAsset, setMarkAsset] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [part, setPart] = useState<SparePart>({ name: '', qty: 1 });
  const [busy, setBusy] = useState(false);

  if (!job) return <><Top title="Job" back /><div className="m-body"><Empty title="Job not found" message="It may have been removed from this device." /></div></>;
  const editable = job.status === 'In Progress';
  const patch = (p: Partial<Job>) => setJob((j) => (j ? { ...j, ...p } : j));
  const persist = (next: Job) => {
    saveJob(next);
    setJob(next);
  };

  const start = async () => {
    setBusy(true);
    let prev: string | null | undefined = job.prevAssetStatus;
    try {
      if (markAsset && job.assetId) prev = await setAssetStatus(job.assetId, 'Under Maintenance');
    } catch (err) {
      toast.error(err);
    }
    persist({ ...job, status: 'In Progress', startedAt: new Date().toISOString(), prevAssetStatus: prev });
    setBusy(false);
  };

  const complete = async () => {
    setBusy(true);
    try {
      if (markAsset && job.assetId) await setAssetStatus(job.assetId, job.prevAssetStatus && job.prevAssetStatus !== 'Under Maintenance' ? job.prevAssetStatus : 'Active');
    } catch (err) {
      toast.error(err);
    }
    persist({ ...job, status: 'Completed', completedAt: new Date().toISOString() });
    toast.success('Job completed');
    setBusy(false);
  };

  const addPart = () => {
    if (!part.name.trim()) return;
    patch({ spareParts: [...(job.spareParts || []), { ...part, name: part.name.trim() }] });
    setPart({ name: '', qty: 1 });
  };

  return (
    <>
      <Top title={job.title} sub={`${job.type} · ${job.status}`} back right={<Badge color={PRIORITY_TONE[job.priority]}>{job.priority}</Badge>} />
      <div className="m-body">
        <div className="m-card">
          <div className="m-row"><span>Asset</span><span>{job.assetId ? <Link to={`/m/asset/${job.assetId}`}>{job.assetName || job.assetCode}</Link> : '—'}</span></div>
          <div className="m-row"><span>Raised by</span><span>{job.createdByName || '—'}</span></div>
          <div className="m-row"><span>Created</span><span>{dateTime(job.createdAt)}</span></div>
          {job.dueDate && <div className="m-row"><span>Due</span><span>{date(job.dueDate)}</span></div>}
          {job.startedAt && <div className="m-row"><span>Started</span><span>{dateTime(job.startedAt)}</span></div>}
          {job.completedAt && <div className="m-row"><span>Completed</span><span>{dateTime(job.completedAt)}</span></div>}
          {job.gps && <div className="m-row"><span><MapPin size={12} /> Where</span><span className="small">{job.gps}</span></div>}
          {job.description && <div className="small" style={{ paddingTop: 10 }}>{job.description}</div>}
        </div>
        <LocalNote />

        {job.status === 'Open' && (
          <div className="m-card stack mt-sm">
            {job.assetId && <label className="checkbox small"><input type="checkbox" checked={markAsset} onChange={(e) => setMarkAsset(e.target.checked)} /> Mark the asset “Under Maintenance” while I work on it</label>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={start}>Start work</button>
          </div>
        )}

        {(editable || job.status === 'Completed') && (
          <>
            <div className="m-section-title">Work record</div>
            <div className="m-card stack">
              <Field label="Labor hours">
                <input type="number" min={0} step="0.25" className="input" disabled={!editable} value={job.laborHours ?? ''} onChange={(e) => patch({ laborHours: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
              <div>
                <div className="small bold" style={{ marginBottom: 6 }}>Spare parts used</div>
                {(job.spareParts || []).map((p, i) => (
                  <div key={i} className="m-row">
                    <span>{p.name} × {p.qty}</span>
                    <span>
                      {p.cost ? p.cost : ''}
                      {editable && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => patch({ spareParts: (job.spareParts || []).filter((_, j) => j !== i) })}><Trash2 size={13} /></button>}
                    </span>
                  </div>
                ))}
                {editable && (
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <input className="input" placeholder="Part" value={part.name} onChange={(e) => setPart({ ...part, name: e.target.value })} />
                    <input className="input" type="number" min={1} style={{ width: 62 }} value={part.qty} onChange={(e) => setPart({ ...part, qty: Number(e.target.value) || 1 })} />
                    <input className="input" type="number" min={0} placeholder="Cost" style={{ width: 80 }} value={part.cost ?? ''} onChange={(e) => setPart({ ...part, cost: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    <button className="btn btn-icon" onClick={addPart} aria-label="Add part"><Plus size={16} /></button>
                  </div>
                )}
              </div>
              <Field label="Service notes"><textarea className="textarea" disabled={!editable} value={job.notes || ''} onChange={(e) => patch({ notes: e.target.value })} /></Field>
              {editable ? (
                <>
                  <PhotoPicker label="Before photos" photos={job.beforePhotos || []} onChange={(p) => patch({ beforePhotos: p })} />
                  <PhotoPicker label="After photos" photos={job.afterPhotos || []} onChange={(p) => patch({ afterPhotos: p })} />
                </>
              ) : (
                <div className="row wrap" style={{ gap: 8 }}>
                  {[...(job.beforePhotos || []), ...(job.afterPhotos || [])].map((p, i) => <img key={i} src={p} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} />)}
                </div>
              )}
            </div>
            {editable && (
              <div className="m-card stack mt-sm">
                {job.assetId && <label className="checkbox small"><input type="checkbox" checked={markAsset} onChange={(e) => setMarkAsset(e.target.checked)} /> Set the asset back to “{job.prevAssetStatus && job.prevAssetStatus !== 'Under Maintenance' ? job.prevAssetStatus : 'Active'}”</label>}
                <button className="btn" disabled={busy} onClick={() => (persist(job), toast.success('Progress saved'))}>Save progress</button>
                <button className="btn btn-success btn-lg btn-block" disabled={busy} onClick={complete}>Complete job</button>
              </div>
            )}
          </>
        )}

        {job.status !== 'Completed' && job.status !== 'Cancelled' && (
          <button className="btn btn-danger-ghost btn-block mt" onClick={() => persist({ ...job, status: 'Cancelled' })}>Cancel job</button>
        )}
        <button className="btn btn-ghost btn-block mt-sm" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Remove from this device</button>
      </div>
      <Confirm open={confirmDelete} danger title="Remove job?" message="This deletes the job record from this device." confirmText="Remove" onClose={() => setConfirmDelete(false)} onConfirm={() => (removeJob(job.id), navigate('/m/maintenance', { replace: true }))} />
    </>
  );
}

// ---------- incident ----------

const INCIDENT_TYPES = ['Damage', 'Theft / loss', 'Safety hazard', 'Fault / breakdown', 'Data / security', 'Other'];
const INCIDENT_STATUS: Record<string, string> = { Damage: 'Damaged', 'Theft / loss': 'Missing' };

export function MIncident() {
  const [params] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const settings = useSettings();
  const jobs = useJobs();
  const [asset, setAsset] = useState<ApiAsset | null>(null);
  const [type, setType] = useState(INCIDENT_TYPES[0]);
  const [severity, setSeverity] = useState<Job['priority']>('Medium');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [markAsset, setMarkAsset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = params.get('asset');
    if (id) assetApi.get(id).then(setAsset).catch(() => undefined);
  }, [params]);

  const recent = jobs.filter((j) => j.kind === 'incident' || j.type === 'Breakdown').filter((j) => j.createdBy === (user?.userId ?? null)).slice(0, 10);
  const newStatus = INCIDENT_STATUS[type];

  const submit = async () => {
    if (!description.trim()) return toast.error('Describe what happened');
    setBusy(true);
    try {
      const gps = settings.gps ? await tryGpsText() : '';
      // Faults become maintenance jobs so a technician can pick them up.
      const asFault = type === 'Fault / breakdown';
      saveJob({
        id: newId(),
        kind: asFault ? 'fault' : 'incident',
        type: asFault ? 'Breakdown' : type,
        assetId: asset?.assetId ?? null,
        assetCode: asset?.assetCode || '',
        assetName: asset?.assetName || '',
        locationId: asset?.locationId ?? null,
        title: `${type}${asset ? `: ${asset.assetName || asset.assetCode}` : ''}`,
        description,
        priority: severity,
        status: 'Open',
        createdAt: new Date().toISOString(),
        createdBy: user?.userId ?? null,
        createdByName: user?.name || '',
        photos,
        gps,
      });
      if (markAsset && asset && newStatus) await setAssetStatus(asset.assetId, newStatus).catch((e) => toast.error(e));
      toast.success(asFault ? 'Reported. It now shows under Maintenance Tasks' : 'Incident reported');
      setDescription('');
      setPhotos([]);
      setMarkAsset(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Top title="Report an incident" sub="Damage, loss, safety issues or breakdowns" back />
      <div className="m-body">
        <LocalNote />
        <div className="m-card stack">
          <Field label="Asset involved (optional)"><AssetScanSelect value={asset} onChange={setAsset} /></Field>
          <Field label="What happened?">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Severity"><Segmented value={severity} onChange={(v) => setSeverity(v as Job['priority'])} options={PRIORITIES.map((p) => ({ value: p, label: p }))} /></Field>
          <Field label="Details" required><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What, where and when…" /></Field>
          <PhotoPicker label="Photos" photos={photos} onChange={setPhotos} />
          {asset && newStatus && (
            <label className="checkbox small"><input type="checkbox" checked={markAsset} onChange={(e) => setMarkAsset(e.target.checked)} /> Also set the asset’s status to “{newStatus}”</label>
          )}
          {settings.gps && <div className="xs muted"><MapPin size={11} /> Your location is attached when you submit.</div>}
        </div>
        <button className="btn btn-primary btn-lg btn-block mt" disabled={busy} onClick={submit}><AlertTriangle size={17} /> Submit report</button>

        {recent.length > 0 && (
          <>
            <div className="m-section-title">Your recent reports</div>
            {recent.map((j) => <JobCard key={j.id} j={j} />)}
          </>
        )}
      </div>
    </>
  );
}

// ---------- transfer / handover ----------

const ACTIONS: { value: AssignmentAction; label: string; icon: React.ReactNode }[] = [
  { value: 'assign', label: 'Assign', icon: <UserCheck size={20} /> },
  { value: 'transfer', label: 'Hand over', icon: <ArrowLeftRight size={20} /> },
  { value: 'location-transfer', label: 'Move location', icon: <MapPin size={20} /> },
  { value: 'return', label: 'Return', icon: <Undo2 size={20} /> },
];

export function MTransfer() {
  const names = useNames();
  const settings = useSettings();
  const { inScope } = useBranch();
  const [asset, setAsset] = useState<ApiAsset | null>(null);
  const [action, setAction] = useState<AssignmentAction | null>(null);
  const { data, loading, reload } = useFetch(async () => {
    const [list, { assets }] = await Promise.all([assignmentApi.list(), loadAssets().catch(() => ({ assets: [] as ApiAsset[], stale: false }))]);
    return { list, assets };
  }, []);
  const byId = useMemo(() => new Map((data?.assets || []).map((a) => [a.assetId, a])), [data]);
  const recent = useMemo(
    () =>
      (data?.list || [])
        .filter((t) => inScope(byId.get(t.assetId)?.locationId) || inScope(t.toLocationId))
        .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)))
        .slice(0, 15),
    [data, byId, inScope]
  );

  return (
    <>
      <Top title="Transfer / handover" sub="Assign, hand over, move or return an asset" back />
      <div className="m-body">
        <div className="m-card stack">
          <Field label="Asset"><AssetScanSelect value={asset} onChange={setAsset} /></Field>
          <div className="m-actions" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {ACTIONS.map((a) => (
              <button key={a.value} className="m-action" disabled={!asset} style={{ opacity: asset ? 1 : 0.5 }} onClick={() => setAction(a.value)}>
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
          {settings.gps && <div className="xs muted"><MapPin size={11} /> Your location is added to the handover remarks.</div>}
        </div>

        <div className="m-section-title">Recent movements</div>
        {loading && !data ? <Loading /> : recent.length === 0 ? <Empty title="No movements yet" /> : recent.map((t) => (
          <div key={t.assignmentHistoryId} className="m-card">
            <div className="row-between">
              <b className="ellipsis">{byId.get(t.assetId)?.assetName || `Asset #${t.assetId}`}</b>
              <Badge color="indigo">{t.transactionType}</Badge>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {[t.toEmployeeId && `to ${names.employee(t.toEmployeeId)}`, t.toLocationId && names.location(t.toLocationId)].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className="xs muted" style={{ marginTop: 4 }}>{dateTime(t.transactionDate)}</div>
          </div>
        ))}
      </div>
      <AssignmentModal open={Boolean(action)} onClose={() => setAction(null)} asset={asset} defaultAction={action || undefined} captureGps={settings.gps} onDone={() => (setAsset(null), reload())} />
    </>
  );
}
