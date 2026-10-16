import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, FileSignature, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { ApiAsset, ApiContract, assetApi, contractApi, CONTRACT_TYPES } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, daysUntil, money, toInputDate } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useData, useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Badge, DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, Progress, SearchInput, Segmented, Tabs } from '../../components/ui';
import { AutoView } from '../../components/AutoData';

export function expiryBadge(days: number | null) {
  if (days === null) return <span className="faint">—</span>;
  if (days < 0) return <Badge color="red">Expired {-days}d ago</Badge>;
  if (days <= 30) return <Badge color="amber">{days} days left</Badge>;
  if (days <= 90) return <Badge color="blue" plain>{days} days left</Badge>;
  return <Badge color="green" plain>Active</Badge>;
}

export default function ContractsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'amc';
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="AMC & Warranty"
        subtitle="Service contracts, SLAs and visit entitlements, plus warranty and AMC coverage for every asset."
        actions={can('contracts', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New contract</button>}
      />
      <div className="card">
        <Tabs
          active={tab}
          onChange={(t) => setParams(t === 'amc' ? {} : { tab: t })}
          tabs={[
            { key: 'amc', label: 'AMC / service contracts', icon: <FileSignature size={15} /> },
            { key: 'warranty', label: 'Warranty & AMC tracker', icon: <ShieldCheck size={15} /> },
            { key: 'alerts', label: 'Expiry alerts', icon: <Bell size={15} /> },
          ]}
        />
        {tab === 'amc' && <Contracts />}
        {tab === 'warranty' && <Warranties />}
        {tab === 'alerts' && <ExpiryAlerts />}
      </div>
      {open && <ContractModal onClose={() => setOpen(false)} onDone={(c) => c?.contractId && navigate(`/contracts/${c.contractId}`)} />}
    </>
  );
}

function Contracts() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const { data, loading, error, reload } = useFetch(() => contractApi.list(), []);
  const all = useMemo(() => (data || []).map((c) => ({ ...c, _id: String(c.contractId), daysToExpiry: daysUntil(c.endDate) ?? 0 })), [data]);
  const list = useMemo(() => {
    let l = all;
    if (state === 'active') l = l.filter((c) => c.daysToExpiry >= 0);
    if (state === 'expiring') l = l.filter((c) => c.daysToExpiry >= 0 && c.daysToExpiry <= 30);
    if (state === 'expired') l = l.filter((c) => c.daysToExpiry < 0);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((c) => [c.contractNumber, c.vendorName, c.coverage, c.contractType].some((x) => x?.toLowerCase().includes(s)));
    }
    return l;
  }, [all, state, q]);
  const active = all.filter((c) => c.daysToExpiry >= 0);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <div className="grid grid-kpi" style={{ padding: 16, paddingBottom: 0 }}>
        <Kpi label="Active contracts" value={active.length} icon={<FileSignature size={19} />} onClick={() => setState('active')} />
        <Kpi label="Expiring in 30 days" value={all.filter((c) => c.daysToExpiry >= 0 && c.daysToExpiry <= 30).length} icon={<AlertTriangle size={19} />} toneName="amber" onClick={() => setState('expiring')} />
        <Kpi label="Active contract value" value={money(active.reduce((s, c) => s + (c.contractValue || 0), 0), { compact: true })} icon={<Wallet size={19} />} toneName="green" />
        <Kpi label="Expired" value={all.length - active.length} icon={<ShieldCheck size={19} />} toneName="red" onClick={() => setState('expired')} />
      </div>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search contract, vendor, coverage…" />
        <Segmented value={state} onChange={setState} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring' }, { value: 'expired', label: 'Expired' }]} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={list}
          onRowClick={(c) => navigate(`/contracts/${c.contractId}`)}
          empty={<Empty title="No contracts" message="Add an AMC, CMC or service contract to track SLAs, visits and expiry." />}
          columns={[
            { key: 'contractNumber', label: 'Contract', render: (c) => <div><div className="cell-main mono">{c.contractNumber}</div><div className="cell-sub">{c.coverage}</div></div> },
            { key: 'contractType', label: 'Type', render: (c) => <Badge plain color="indigo">{c.contractType}</Badge> },
            { key: 'vendorName', label: 'Vendor', render: (c) => <div className="small">{c.vendorName}<div className="cell-sub">{c.contactPerson}</div></div> },
            { key: 'period', label: 'Period', sortValue: (c) => c.endDate, render: (c) => <span className="small">{date(c.startDate)} → {date(c.endDate)}</span> },
            {
              key: 'visits',
              label: 'Visits',
              sortValue: (c) => c.remainingVisits,
              render: (c) =>
                c.totalVisits ? (
                  <div style={{ minWidth: 110 }}>
                    <div className="xs muted">
                      {c.totalVisits - (c.remainingVisits ?? c.totalVisits)}/{c.totalVisits} used · <b>{c.remainingVisits ?? c.totalVisits} left</b>
                    </div>
                    <Progress value={((c.totalVisits - (c.remainingVisits ?? c.totalVisits)) / c.totalVisits) * 100} />
                  </div>
                ) : (
                  <span className="faint">Unlimited</span>
                ),
            },
            { key: 'contractValue', label: 'Value', className: 'right', render: (c) => money(c.contractValue) },
            { key: 'daysToExpiry', label: 'Status', render: (c) => expiryBadge(c.daysToExpiry) },
          ]}
        />
      )}
    </>
  );
}

function Warranties() {
  const navigate = useNavigate();
  const { categories } = useData();
  const names = useNames();
  const [days, setDays] = useState('0');
  const [kind, setKind] = useState<'warranty' | 'amc'>('warranty');
  const [q, setQ] = useState('');
  const { data, loading } = useFetch(() => assetApi.list().catch(() => [] as ApiAsset[]), []);
  const catName = useMemo(() => new Map(categories.map((c) => [c._id, c.name])), [categories]);
  const list = useMemo(() => {
    const end = (a: ApiAsset) => (kind === 'warranty' ? a.warrantyEndDate : a.amcEndDate);
    const start = (a: ApiAsset) => (kind === 'warranty' ? a.warrantyStartDate : a.amcStartDate);
    return (data || [])
      .filter((a) => end(a))
      .map((a) => ({ ...a, _id: String(a.assetId), start: start(a), end: end(a), daysToExpiry: daysUntil(end(a)) ?? 0 }))
      .filter((a) => !Number(days) || (a.daysToExpiry >= 0 && a.daysToExpiry <= Number(days)))
      .filter((a) => !q || [a.assetCode, a.assetName, a.brand, a.model].some((x) => x?.toLowerCase().includes(q.toLowerCase())));
  }, [data, days, kind, q]);
  return (
    <>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search assets…" />
        <Segmented value={kind} onChange={(v) => setKind(v as 'warranty' | 'amc')} options={[{ value: 'warranty', label: 'Warranty' }, { value: 'amc', label: 'AMC' }]} />
        <Segmented value={days} onChange={setDays} options={[{ value: '0', label: 'All' }, { value: '15', label: '15 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : (
        <DataTable
          rows={list}
          pageSize={20}
          onRowClick={(a) => navigate(`/assets/${a.assetId}`)}
          initialSort={{ key: 'daysToExpiry', dir: 'asc' }}
          empty={<Empty title={`No ${kind === 'amc' ? 'AMC' : 'warranty'} dates in this window`} />}
          columns={[
            { key: 'assetName', label: 'Asset', render: (a) => <div><div className="cell-main">{a.assetName}</div><div className="cell-sub mono">{a.assetCode}</div></div> },
            { key: 'category', label: 'Category', render: (a) => (a.categoryId ? catName.get(`c${a.categoryId}`) : '—') },
            { key: 'make', label: 'Make / model', render: (a) => [a.brand, a.model].filter(Boolean).join(' ') || '—' },
            { key: 'location', label: 'Location', render: (a) => names.location(a.locationId) || '—' },
            { key: 'start', label: 'Start', render: (a) => date(a.start) },
            { key: 'end', label: 'End', render: (a) => date(a.end) },
            { key: 'daysToExpiry', label: 'Status', render: (a) => expiryBadge(a.daysToExpiry) },
          ]}
        />
      )}
    </>
  );
}

function ExpiryAlerts() {
  const { data, loading, error, reload } = useFetch(() => contractApi.expiryAlerts(), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="card-body">
      <AutoView data={data} empty={<Empty title="No contracts close to expiry" message="Contracts nearing their end date are listed here by the AssetAPI." />} />
    </div>
  );
}

export function ContractModal({ contract, onClose, onDone }: { contract?: ApiContract; onClose: () => void; onDone: (c: ApiContract | null) => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState<Partial<ApiContract>>(() => ({
    contractType: 'AMC',
    status: 'Active',
    ...contract,
    startDate: toInputDate(contract?.startDate),
    endDate: toInputDate(contract?.endDate),
  }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ApiContract>(k: K, v: ApiContract[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  const save = async () => {
    if (!f.contractNumber?.trim() || !f.vendorName?.trim() || !f.startDate || !f.endDate) return toast.error('Contract number, vendor and dates are required');
    setBusy(true);
    try {
      const body: Partial<ApiContract> = {
        ...f,
        contractNumber: f.contractNumber.trim(),
        vendorName: f.vendorName.trim(),
        remainingVisits: contract ? f.remainingVisits : f.totalVisits ?? null,
        createdBy: contract?.createdBy ?? user?.userId ?? null,
      };
      const saved = contract ? await contractApi.update(contract.contractId, body) : await contractApi.create(body);
      toast.success('Contract saved');
      onDone(saved);
      onClose();
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
      size="lg"
      title={contract ? 'Edit contract' : 'New AMC / service contract'}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save contract</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Contract number" required>
          <input className="input mono" value={f.contractNumber || ''} onChange={(e) => set('contractNumber', e.target.value)} autoFocus />
        </Field>
        <Field label="Type" required>
          <select className="select" value={f.contractType} onChange={(e) => set('contractType', e.target.value)}>
            {f.contractType && !CONTRACT_TYPES.includes(f.contractType) && <option>{f.contractType}</option>}
            {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Vendor" required>
          <input className="input" value={f.vendorName || ''} onChange={(e) => set('vendorName', e.target.value)} placeholder="Service provider name" />
        </Field>
        <Field label="Contract value">
          <input type="number" min={0} step="0.01" className="input" value={f.contractValue ?? ''} onChange={(e) => set('contractValue', num(e.target.value))} />
        </Field>
        <Field label="Start date" required>
          <input type="date" className="input" value={toInputDate(f.startDate)} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="End date" required>
          <input type="date" className="input" value={toInputDate(f.endDate)} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label="Total visits" hint="Leave empty for unlimited / on-call">
          <input type="number" min={0} className="input" value={f.totalVisits ?? ''} onChange={(e) => set('totalVisits', num(e.target.value))} />
        </Field>
        {contract && (
          <Field label="Remaining visits">
            <input type="number" min={0} className="input" value={f.remainingVisits ?? ''} onChange={(e) => set('remainingVisits', num(e.target.value))} />
          </Field>
        )}
        <Field label="Coverage">
          <input className="input" value={f.coverage || ''} onChange={(e) => set('coverage', e.target.value)} placeholder="Parts & labour, excl. consumables" />
        </Field>
        <Field label="SLA">
          <input className="input" value={f.sla || ''} onChange={(e) => set('sla', e.target.value)} placeholder="e.g. 4h response, 24h resolution" />
        </Field>
        <Field label="Contact person">
          <input className="input" value={f.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className="input" value={f.contactPhone || ''} onChange={(e) => set('contactPhone', e.target.value)} />
        </Field>
        <Field label="Contact email">
          <input className="input" type="email" value={f.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="select" value={f.status || ''} onChange={(e) => set('status', e.target.value)}>
            {['Active', 'Expired', 'Cancelled', 'Renewed'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Remarks" className="full">
          <textarea className="textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
