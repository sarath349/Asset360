import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Play, XCircle } from 'lucide-react';
import { maintenanceApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Card, ErrorState, Field, KV, Loading, PageHeader, StatusBadge } from '../../components/ui';

const PRIORITY_TONE: Record<string, string> = { Low: 'slate', Medium: 'blue', High: 'amber', Critical: 'red' };

export default function MaintenanceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { data: job, loading, error, reload } = useFetch(() => maintenanceApi.get(id!), [id]);
  const [notes, setNotes] = useState('');
  const [laborHours, setLaborHours] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [markAsset, setMarkAsset] = useState(true);

  if (loading && !job) return <Loading />;
  if (error || !job) return <ErrorState message={error || 'Job not found'} onRetry={reload} />;

  const editable = job.status === 'In Progress' && can('maintenance', 'edit');

  const start = async () => {
    setBusy(true);
    try {
      await maintenanceApi.start(job.jobId, { markAsset });
      toast.success('Job started');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const saveProgress = async () => {
    setBusy(true);
    try {
      await maintenanceApi.update(job.jobId, {
        ...job,
        notes: notes || job.notes,
        laborHours: laborHours === '' ? job.laborHours : Number(laborHours),
      });
      toast.success('Saved');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    try {
      await maintenanceApi.complete(job.jobId, {
        notes: notes || job.notes,
        laborHours: laborHours === '' ? job.laborHours : Number(laborHours),
        spareParts: job.spareParts || [],
        markAsset,
      });
      toast.success('Job completed');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await maintenanceApi.cancel(job.jobId);
      toast.success('Job cancelled');
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
        crumbs={[{ label: 'Maintenance', to: '/maintenance' }, { label: `Job #${job.jobId}` }]}
        title={
          <span className="row" style={{ gap: 10 }}>
            {job.title} <StatusBadge status={job.status} /> <Badge color={PRIORITY_TONE[job.priority] || 'slate'}>{job.priority}</Badge>
          </span>
        }
        subtitle={job.type}
        actions={
          can('maintenance', 'edit') && (
            <>
              {job.status === 'Open' && (
                <button className="btn btn-primary" disabled={busy} onClick={start}>
                  <Play size={16} /> Start work
                </button>
              )}
              {job.status === 'In Progress' && (
                <>
                  <button className="btn" disabled={busy} onClick={saveProgress}>Save</button>
                  <button className="btn btn-primary" disabled={busy} onClick={complete}>
                    <CheckCircle2 size={16} /> Complete
                  </button>
                </>
              )}
              {['Open', 'In Progress'].includes(job.status) && (
                <button className="btn btn-danger" disabled={busy} onClick={cancel}>
                  <XCircle size={16} /> Cancel
                </button>
              )}
            </>
          )
        }
      />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Details">
          <KV
            items={[
              ['Asset', job.assetId ? <Link to={`/assets/${job.assetId}`}>{job.assetCode} · {job.assetName}</Link> : '—'],
              ['Raised by', job.createdByName || '—'],
              ['Created', dateTime(job.createdDate)],
              ['Due', job.dueDate ? date(job.dueDate) : '—'],
              ['Started', job.startedAt ? dateTime(job.startedAt) : '—'],
              ['Completed', job.completedAt ? dateTime(job.completedAt) : '—'],
              ['Description', job.description || '—'],
            ]}
          />
          {job.status === 'Open' && job.assetId && (
            <label className="checkbox small" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={markAsset} onChange={(e) => setMarkAsset(e.target.checked)} /> Mark asset “Under Maintenance” while work is in progress
            </label>
          )}
        </Card>
        <Card title="Work record">
          <div className="stack">
            <Field label="Labor hours">
              <input
                type="number"
                min={0}
                step="0.25"
                className="input"
                disabled={!editable}
                value={laborHours !== '' ? laborHours : job.laborHours ?? ''}
                onChange={(e) => setLaborHours(e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <textarea className="textarea" disabled={!editable && job.status !== 'In Progress'} value={notes || job.notes || ''} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {(job.spareParts || []).length > 0 && (
              <div>
                <div className="small bold mb">Spare parts</div>
                {(job.spareParts || []).map((p, i) => (
                  <div key={i} className="row-between small">
                    <span>{p.name} × {p.qty}</span>
                    <span>{p.cost != null ? p.cost : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {can('maintenance', 'delete') && job.status === 'Cancelled' && (
              <button className="btn btn-danger btn-sm" onClick={async () => { await maintenanceApi.remove(job.jobId); navigate('/maintenance'); }}>Delete job</button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
