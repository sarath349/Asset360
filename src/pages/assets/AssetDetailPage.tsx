import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Calculator, GitBranch, ImageIcon, Pencil, Printer, Trash2, TrendingDown } from 'lucide-react';
import { assetApi, assignmentApi, depreciationApi, depreciationMethodLabel, disposalApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime, daysUntil, money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useData, useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Card, Confirm, DataTable, Empty, ErrorState, KV, Loading, Modal, PageHeader, StatusBadge, Tabs } from '../../components/ui';
import { AssetLabel, QrCode } from '../../components/codes';
import { AutoView } from '../../components/AutoData';
import { AssignmentModal, DepreciationModal, DisposalModal } from '../../components/assetModals';
import { AssignmentTable } from '../../components/AssignmentTable';
import { ScheduleTable } from '../../components/DepreciationSchedule';

function ExpiryBadge({ d }: { d?: string | null }) {
  const n = daysUntil(d);
  if (n === null) return <span className="faint">—</span>;
  if (n < 0) return <Badge color="red">Expired {date(d)}</Badge>;
  if (n <= 30) return <Badge color="amber">{n} days left</Badge>;
  return <Badge color="green">Valid till {date(d)}</Badge>;
}

type ModalKind = 'label' | 'delete' | 'assign' | 'dispose' | 'depreciation' | null;

export default function AssetDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { categories } = useData();
  const names = useNames();
  const { data: a, loading, error, reload } = useFetch(() => assetApi.get(id!), [id]);
  const [modal, setModal] = useState<ModalKind>(null);
  const [refresh, setRefresh] = useState(0);

  const catNames = useMemo(() => new Map(categories.map((c) => [c._id, c.name])), [categories]);

  if (loading && !a) return <Loading />;
  if (error || !a) return <ErrorState message={error || 'Asset not found'} onRetry={reload} />;

  const code = a.assetCode || `#${a.assetId}`;
  const category = a.categoryId ? catNames.get(`c${a.categoryId}`) : undefined;
  const subCategory = a.subCategoryId ? catNames.get(`s${a.subCategoryId}`) : undefined;
  const assetType = a.assetTypeId ? catNames.get(`t${a.assetTypeId}`) : undefined;
  const qrValue = a.qrCode || a.assetCode || String(a.assetId);
  const labelAsset = { assetId: code, name: a.assetName, tag: { barcode: a.assetCode || undefined, rfid: a.rfidTag || undefined } };
  const done = () => {
    reload();
    setRefresh((n) => n + 1);
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Assets', to: '/assets' }, { label: code }]}
        title={a.assetName || '(unnamed)'}
        subtitle={
          <span className="row wrap" style={{ gap: 8 }}>
            <span className="mono">{code}</span>
            {(category || subCategory) && (
              <>
                <span className="faint">•</span>
                {[category, subCategory, assetType].filter(Boolean).join(' › ')}
              </>
            )}
          </span>
        }
        actions={
          <>
            <button className="btn" onClick={() => setModal('label')}>
              <Printer size={16} /> Label
            </button>
            {can('lifecycle') && (
              <button className="btn" onClick={() => navigate(`/lifecycle?asset=${a.assetId}`)}>
                <GitBranch size={16} /> Lifecycle
              </button>
            )}
            {can('transfers', 'create') && a.status !== 'Disposed' && (
              <button className="btn" onClick={() => setModal('assign')}>
                <ArrowLeftRight size={16} /> Assign / Transfer
              </button>
            )}
            {can('depreciation', 'create') && (
              <button className="btn" onClick={() => setModal('depreciation')}>
                <Calculator size={16} /> Depreciation
              </button>
            )}
            {can('disposal', 'create') && a.status !== 'Disposed' && (
              <button className="btn" onClick={() => setModal('dispose')}>
                <TrendingDown size={16} /> Dispose
              </button>
            )}
            {can('assets', 'delete') && (
              <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setModal('delete')}>
                <Trash2 size={16} />
              </button>
            )}
            {can('assets', 'edit') && (
              <button className="btn btn-primary" onClick={() => navigate(`/assets/${a.assetId}/edit`)}>
                <Pencil size={16} /> Edit
              </button>
            )}
          </>
        }
      />

      <div className="card">
        <div className="hero">
          <div className="hero-photo">
            <ImageIcon size={34} />
          </div>
          <div className="hero-main">
            <div className="row wrap" style={{ gap: 8 }}>
              <StatusBadge status={a.status || undefined} />
            </div>
            <div className="kv-grid mt">
              <div className="kv">
                <div className="k">Assigned to</div>
                <div className="v">{a.assignedTo ? names.employee(a.assignedTo) : 'Unassigned'}</div>
              </div>
              <div className="kv">
                <div className="k">Location</div>
                <div className="v">{names.location(a.locationId) || '—'}</div>
              </div>
              <div className="kv">
                <div className="k">Department</div>
                <div className="v">{names.department(a.departmentId) || '—'}</div>
              </div>
              <div className="kv">
                <div className="k">Purchase cost</div>
                <div className="v">{money(a.purchaseCost)}</div>
              </div>
              <div className="kv">
                <div className="k">Warranty</div>
                <div className="v">
                  <ExpiryBadge d={a.warrantyEndDate} />
                </div>
              </div>
              <div className="kv">
                <div className="k">AMC</div>
                <div className="v">
                  <ExpiryBadge d={a.amcEndDate} />
                </div>
              </div>
            </div>
          </div>
          <div className="hero-qr">
            <QrCode value={qrValue} size={116} />
            <div className="mono xs mt-sm bold">{code}</div>
            {a.rfidTag && <div className="xs muted mono">RFID {a.rfidTag.slice(-8)}</div>}
          </div>
        </div>
        <Tabs
          active={tab}
          onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'custody', label: 'Custody history' },
            { key: 'depreciation', label: 'Depreciation' },
            { key: 'disposal', label: 'Disposal' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid grid-2 mt">
          <Card title="Asset details">
            <KV
              items={[
                ['Asset code', <span className="mono">{code}</span>],
                ['Serial number', a.serialNumber],
                ['Brand', a.brand],
                ['Model', a.model],
                ['Category', category],
                ['Subcategory', subCategory],
                ['Asset type', assetType],
                ['Registered on', dateTime(a.createdDate)],
                ['Last updated', a.updatedDate ? dateTime(a.updatedDate) : null],
              ]}
            />
            {a.description && (
              <>
                <div className="divider" />
                <div className="small muted">{a.description}</div>
              </>
            )}
          </Card>
          <div className="stack" style={{ gap: 18 }}>
            <Card title="Purchase, warranty & AMC">
              <KV
                items={[
                  ['Purchase date', date(a.purchaseDate)],
                  ['Purchase cost', money(a.purchaseCost)],
                  ['Warranty', a.warrantyStartDate || a.warrantyEndDate ? `${date(a.warrantyStartDate)} → ${date(a.warrantyEndDate)}` : null],
                  ['AMC', a.amcStartDate || a.amcEndDate ? `${date(a.amcStartDate)} → ${date(a.amcEndDate)}` : null],
                ]}
              />
            </Card>
            <Card title="Tags">
              <KV
                items={[
                  ['QR code', <span className="mono">{a.qrCode}</span>],
                  ['RFID', a.rfidTag ? <span className="mono">{a.rfidTag}</span> : null],
                ]}
              />
            </Card>
          </div>
        </div>
      )}
      {tab === 'custody' && <CustodyTab assetId={a.assetId} refresh={refresh} />}
      {tab === 'depreciation' && <DepreciationTab assetId={a.assetId} refresh={refresh} onSetup={() => setModal('depreciation')} />}
      {tab === 'disposal' && <DisposalTab assetId={a.assetId} refresh={refresh} />}

      <Modal open={modal === 'label'} onClose={() => setModal(null)} title="Asset label" footer={<button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Print</button>}>
        <AssetLabel asset={labelAsset} mode="both" />
      </Modal>
      <AssignmentModal open={modal === 'assign'} asset={a} onClose={() => setModal(null)} onDone={done} />
      <DisposalModal open={modal === 'dispose'} asset={a} onClose={() => setModal(null)} onDone={done} />
      <DepreciationModal open={modal === 'depreciation'} asset={a} onClose={() => setModal(null)} onDone={done} />
      <Confirm
        open={modal === 'delete'}
        title="Delete asset?"
        danger
        confirmText="Delete permanently"
        message={
          <>
            This permanently removes <b>{code}</b>.
          </>
        }
        onClose={() => setModal(null)}
        onConfirm={async () => {
          try {
            await assetApi.remove(a.assetId);
            toast.success('Asset deleted');
            navigate('/assets');
          } catch (err) {
            toast.error(err);
          }
        }}
      />
    </>
  );
}

function CustodyTab({ assetId, refresh }: { assetId: number; refresh: number }) {
  const { data, loading, error, reload } = useFetch(() => assignmentApi.byAsset(assetId), [assetId, refresh]);
  return (
    <Card title="Custody history" subtitle="Assignments, employee transfers, location moves and returns" className="mt" bodyClass="tight">
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Loading /> : <AssignmentTable rows={Array.isArray(data) ? data : []} />}
    </Card>
  );
}

function DepreciationTab({ assetId, refresh, onSetup }: { assetId: number; refresh: number; onSetup: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const { data, loading, reload } = useFetch(
    () =>
      Promise.all([
        depreciationApi.byAsset(assetId).catch(() => null),
        depreciationApi.report(assetId).catch(() => null),
        depreciationApi.history(assetId).catch(() => null),
      ]),
    [assetId, refresh]
  );
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading />;
  const [schedule, report, history] = data || [];
  const schedules: any[] = Array.isArray(schedule) ? schedule : schedule ? [schedule] : [];

  const calculate = async (depreciationId: number) => {
    setBusy(true);
    try {
      await depreciationApi.calculate(depreciationId);
      toast.success('Depreciation recalculated');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (!schedules.length)
    return (
      <Card className="mt">
        <Empty
          title="No depreciation schedule"
          message="Set up the method, useful life and residual value to start tracking book value."
          action={can('depreciation', 'create') && <button className="btn btn-primary btn-sm" onClick={onSetup}><Calculator size={14} /> Set up depreciation</button>}
        />
      </Card>
    );

  return (
    <div className="stack mt">
      {schedules.map((s) => (
        <Card
          key={s.depreciationId}
          title={`${depreciationMethodLabel(s.depreciationMethod)} · ${s.usefulLifeMonths} months`}
          subtitle={`From ${date(s.depreciationStartDate)}${s.lastCalculatedDate ? ` · last calculated ${dateTime(s.lastCalculatedDate)}` : ''}`}
          actions={
            can('depreciation', 'edit') && (
              <button className="btn btn-sm" disabled={busy} onClick={() => calculate(s.depreciationId)}>
                <Calculator size={14} /> Recalculate
              </button>
            )
          }
        >
          <KV
            items={[
              ['Purchase value', money(s.purchaseValue)],
              ['Residual value', money(s.residualValue)],
              ['Accumulated depreciation', money(s.accumulatedDepreciation)],
              ['Current book value', <b>{money(s.currentBookValue)}</b>],
              ['Annual rate', s.annualDepreciationRate ? `${s.annualDepreciationRate}%` : null],
              ['Status', <StatusBadge status={s.status || undefined} />],
            ]}
          />
          <div className="mt">
            <h4 className="small bold" style={{ marginBottom: 8 }}>Year-by-year schedule</h4>
            <ScheduleTable record={s} />
          </div>
        </Card>
      ))}
      {report && (
        <Card title="Depreciation report">
          <AutoView data={report} />
        </Card>
      )}
      <Card title="Calculation history" bodyClass="tight">
        <AutoView data={history} empty={<Empty title="No calculations yet" message="Use Recalculate to post depreciation." />} />
      </Card>
    </div>
  );
}

function DisposalTab({ assetId, refresh }: { assetId: number; refresh: number }) {
  const navigate = useNavigate();
  const { data, loading } = useFetch(() => disposalApi.byAsset(assetId).catch(() => []), [assetId, refresh]);
  if (loading && !data) return <Loading />;
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return (
    <Card title="Disposal requests" className="mt" bodyClass="tight">
      <DataTable
        rows={list.map((d: any) => ({ ...d, _id: String(d.disposalId) }))}
        onRowClick={(d: any) => navigate(`/disposal/${d.disposalId}`)}
        empty={<Empty title="No disposal requests" />}
        columns={[
          { key: 'disposalRequestNumber', label: 'Request', render: (d: any) => <span className="mono bold">{d.disposalRequestNumber}</span> },
          { key: 'requestDate', label: 'Requested', render: (d: any) => date(d.requestDate) },
          { key: 'retirementReason', label: 'Reason' },
          { key: 'disposalMethod', label: 'Method', render: (d: any) => d.disposalMethod || d.requestedDisposalMethod || '—' },
          { key: 'approvalStatus', label: 'Status', render: (d: any) => <StatusBadge status={d.approvalStatus} /> },
        ]}
      />
    </Card>
  );
}
