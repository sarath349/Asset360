import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, ClipboardList, Clock, Plus } from 'lucide-react';
import { ApiAuditCampaign, auditApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, daysUntil, toInputDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, SearchInput, StatusBadge } from '../../components/ui';
import { AccountPicker, LocationPicker } from '../../components/pickers';

export const isCompleted = (s?: string | null) => /complete|closed/i.test(s || '');
export const isRunning = (s?: string | null) => /progress|start|running|active/i.test(s || '');

export default function AuditsPage() {
  const { can } = useAuth();
  const names = useNames();
  const { inScope } = useBranch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useFetch(() => auditApi.campaigns(), []);
  const list = (data || []).filter((a) => inScope(a.siteId));
  const overdue = list.filter((a) => !isCompleted(a.status) && a.endDate && (daysUntil(a.endDate) ?? 0) < 0);
  const rows = list
    .filter((a) => !q || [a.auditCode, a.auditName, names.location(a.siteId), a.status].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    .map((a) => ({ ...a, _id: String(a.auditId) }));

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Asset Verification & Physical Audit"
        subtitle="Create a campaign for a site or area, start it, scan assets, then complete it to get the discrepancy report."
        actions={can('audits', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New audit campaign</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Campaigns" value={list.length} icon={<ClipboardList size={19} />} />
        <Kpi label="In progress" value={list.filter((a) => isRunning(a.status)).length} icon={<Clock size={19} />} toneName="blue" />
        <Kpi label="Overdue" value={overdue.length} icon={<AlertTriangle size={19} />} toneName="red" />
        <Kpi label="Completed" value={list.filter((a) => isCompleted(a.status)).length} icon={<ClipboardCheck size={19} />} toneName="green" />
      </div>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search audits…" />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            onRowClick={(a) => navigate(`/audits/${a.auditId}`)}
            initialSort={{ key: 'startDate', dir: 'desc' }}
            empty={<Empty title="No audits yet" message="Create an audit campaign for a site or area." />}
            columns={[
              { key: 'auditName', label: 'Audit', render: (a) => <div><div className="cell-main">{a.auditName}</div><div className="cell-sub mono">{a.auditCode}</div></div> },
              { key: 'site', label: 'Site / area', sortValue: (a) => names.location(a.siteId), render: (a) => <div className="small">{names.location(a.siteId)}{a.areaId && <div className="cell-sub">{names.location(a.areaId)}</div>}</div> },
              { key: 'assignedTo', label: 'Auditor', render: (a) => names.user(a.assignedTo) || '—' },
              { key: 'startDate', label: 'Start', sortValue: (a) => a.startDate, render: (a) => date(a.startDate) },
              {
                key: 'endDate',
                label: 'Due',
                sortValue: (a) => a.endDate,
                render: (a) => {
                  const d = daysUntil(a.endDate);
                  return <span className={!isCompleted(a.status) && d !== null && d < 0 ? 'neg bold' : ''}>{date(a.endDate)}</span>;
                },
              },
              { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status || 'Planned'} /> },
            ]}
          />
        )}
      </div>
      {open && <NewAuditModal onClose={() => setOpen(false)} onDone={(id) => (id ? navigate(`/audits/${id}`) : reload())} />}
    </>
  );
}

function NewAuditModal({ onClose, onDone }: { onClose: () => void; onDone: (id?: number) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState<Partial<ApiAuditCampaign>>({
    auditCode: `AUD-${Date.now().toString().slice(-6)}`,
    startDate: toInputDate(new Date()),
    assignedTo: user?.userId || null,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ApiAuditCampaign>(k: K, v: ApiAuditCampaign[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const toKey = (v?: number | null) => (v ? String(v) : null);

  const submit = async () => {
    if (!f.auditName?.trim() || !f.auditCode?.trim() || !f.siteId) return toast.error('Code, name and site are required');
    setBusy(true);
    try {
      const a = await auditApi.create({ ...f, auditName: f.auditName.trim(), auditCode: f.auditCode.trim(), status: 'Planned', createdBy: user?.userId || null });
      toast.success(`${f.auditCode} created`);
      onClose();
      onDone(a?.auditId);
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
      title="New audit campaign"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>Create campaign</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Audit name" required className="full">
          <input className="input" value={f.auditName || ''} onChange={(e) => set('auditName', e.target.value)} placeholder="e.g. Q4 Physical Verification — Dubai HQ" autoFocus />
        </Field>
        <Field label="Audit code" required>
          <input className="input mono" value={f.auditCode || ''} onChange={(e) => set('auditCode', e.target.value)} />
        </Field>
        <Field label="Auditor">
          <AccountPicker value={toKey(f.assignedTo)} onChange={(v) => set('assignedTo', v ? Number(v) : null)} />
        </Field>
        <Field label="Site" required>
          <LocationPicker value={toKey(f.siteId)} onChange={(v) => set('siteId', v ? Number(v) : (null as any))} placeholder="Select site…" />
        </Field>
        <Field label="Area" hint="Optional — narrow the audit to one area">
          <LocationPicker value={toKey(f.areaId)} onChange={(v) => set('areaId', v ? Number(v) : null)} placeholder="Whole site" />
        </Field>
        <Field label="Start date" required>
          <input type="date" className="input" value={toInputDate(f.startDate)} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Due date">
          <input type="date" className="input" value={toInputDate(f.endDate)} onChange={(e) => set('endDate', e.target.value || null)} />
        </Field>
        <Field label="Remarks / instructions" className="full">
          <textarea className="textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
