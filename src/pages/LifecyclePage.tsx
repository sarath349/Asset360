import { ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Calculator, ClipboardCheck, ExternalLink, GitBranch, PackagePlus, RefreshCw, ShieldCheck, ShoppingCart, Trash2, Wrench } from 'lucide-react';
import {
  ApiAsset, ApiAssignment, ApiAuditCampaign, ApiAuditScan, ApiContract, ApiContractVisit, ApiDepreciation, ApiDisposal,
  assetApi, assignmentApi, auditApi, contractApi, depreciationApi, depreciationMethodLabel, disposalApi,
} from '../api/assetApi';
import { useFetch } from '../lib/hooks';
import { date, dateTime, money } from '../lib/format';
import { useNames } from '../context/DataContext';
import { Card, Empty, ErrorState, KV, Loading, PageHeader, StatusBadge, Tabs } from '../components/ui';
import { AssetSelect } from '../components/pickers';
import { humanize } from '../components/AutoData';

type Kind = 'record' | 'transfer' | 'maintenance' | 'audit' | 'coverage' | 'financial' | 'disposal';

interface LifeEvent {
  key: string;
  at: string;
  kind: Kind;
  title: ReactNode;
  details?: ReactNode;
  meta?: ReactNode;
  status?: string | null;
  icon: ReactNode;
  tone: string;
  to?: string;
}

const FILTERS: { key: Kind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'audit', label: 'Audits' },
  { key: 'coverage', label: 'Warranty & AMC' },
  { key: 'financial', label: 'Financial' },
  { key: 'disposal', label: 'Disposal' },
];

// Endpoints return either a list, a single record, or an object wrapping one list.
function toList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const inner = Object.values(data).find(Array.isArray);
  return (inner as T[]) || [data as T];
}

const list = <T,>(p: Promise<any>) => p.then((d) => toList<T>(d)).catch(() => [] as T[]);

interface History {
  asset: ApiAsset;
  assignments: ApiAssignment[];
  disposals: ApiDisposal[];
  schedules: ApiDepreciation[];
  calculations: any[];
  contracts: { contract: ApiContract; visits: ApiContractVisit[] }[];
  scans: (ApiAuditScan & { audit: ApiAuditCampaign })[];
}

// The API has no single history endpoint, so the timeline is stitched together from each module.
async function loadHistory(assetId: number): Promise<History> {
  const [asset, assignments, disposals, schedules, calculations, contracts, audits] = await Promise.all([
    assetApi.get(assetId),
    list<ApiAssignment>(assignmentApi.byAsset(assetId)),
    list<ApiDisposal>(disposalApi.byAsset(assetId)),
    list<ApiDepreciation>(depreciationApi.byAsset(assetId)),
    list<any>(depreciationApi.history(assetId)),
    list<ApiContract>(contractApi.list()),
    list<ApiAuditCampaign>(auditApi.campaigns()),
  ]);
  const covered = await Promise.all(
    contracts.map(async (contract) => {
      const [assets, visits] = await Promise.all([list<any>(contractApi.assets(contract.contractId)), list<ApiContractVisit>(contractApi.visits(contract.contractId))]);
      const mapped = assets.some((a) => Number(a?.assetId) === assetId);
      // Visits without an asset apply to every asset on the contract.
      return { contract, mapped, visits: visits.filter((v) => Number(v.assetId) === assetId || (mapped && !v.assetId)) };
    })
  );
  const scans = await Promise.all(
    audits.map(async (audit) => (await list<ApiAuditScan>(auditApi.scanHistory(audit.auditId))).filter((s) => Number(s?.assetId) === assetId).map((s) => ({ ...s, audit })))
  );
  return {
    asset,
    assignments,
    disposals,
    schedules: schedules.filter((s) => s && Number(s.assetId) === assetId),
    calculations,
    contracts: covered.filter((c) => c.mapped || c.visits.length).map(({ contract, visits }) => ({ contract, visits })),
    scans: scans.flat(),
  };
}

const when = (d: string) => (/T00:00:00/.test(d) ? date(d) : dateTime(d));
const valid = (d?: string | null): d is string => !!d && !Number.isNaN(new Date(d).getTime());
const isFuture = (d: string) => new Date(d).getTime() > Date.now();
const join = (...parts: (string | number | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

const MOVE_TITLES: Record<string, string> = { assign: 'Assigned', transfer: 'Transferred', locationtransfer: 'Moved to new location', return: 'Returned to store' };

function useEvents(h: History | null) {
  const names = useNames();
  return useMemo(() => {
    if (!h) return [];
    const { asset: a } = h;
    const out: LifeEvent[] = [];
    const add = (e: Omit<LifeEvent, 'at'> & { at?: string | null }) => valid(e.at) && out.push(e as LifeEvent);
    const party = (emp: number | null, loc: number | null, dep: number | null) => (emp ? names.employee(emp) : loc ? names.location(loc) : dep ? names.department(dep) : 'Store');

    add({ key: 'created', at: a.createdDate, kind: 'record', title: 'Registered in asset register', details: join(a.assetCode, a.serialNumber && `SN ${a.serialNumber}`, a.brand, a.model), icon: <PackagePlus size={13} />, tone: 'indigo' });
    add({ key: 'purchase', at: a.purchaseDate, kind: 'financial', title: 'Purchased', details: a.purchaseCost != null ? `Cost ${money(a.purchaseCost)}` : undefined, icon: <ShoppingCart size={13} />, tone: 'green' });
    add({ key: 'w-start', at: a.warrantyStartDate, kind: 'coverage', title: 'Warranty started', icon: <ShieldCheck size={13} />, tone: 'green' });
    add({ key: 'w-end', at: a.warrantyEndDate, kind: 'coverage', title: valid(a.warrantyEndDate) && isFuture(a.warrantyEndDate) ? 'Warranty ends' : 'Warranty expired', icon: <ShieldCheck size={13} />, tone: 'amber' });
    add({ key: 'amc-start', at: a.amcStartDate, kind: 'coverage', title: 'AMC started', icon: <ShieldCheck size={13} />, tone: 'cyan' });
    add({ key: 'amc-end', at: a.amcEndDate, kind: 'coverage', title: valid(a.amcEndDate) && isFuture(a.amcEndDate) ? 'AMC ends' : 'AMC expired', icon: <ShieldCheck size={13} />, tone: 'amber' });

    for (const t of h.assignments) {
      const type = (t.transactionType || '').toLowerCase().replace(/[^a-z]/g, '');
      add({
        key: `as-${t.assignmentHistoryId}`,
        at: t.transactionDate,
        kind: 'transfer',
        title: MOVE_TITLES[type] || humanize(t.transactionType || 'Movement'),
        details: (
          <>
            <span className="muted">{party(t.fromEmployeeId, t.fromLocationId, t.fromDepartmentId)}</span>
            <span className="faint"> → </span>
            <b>{party(t.toEmployeeId, t.toLocationId, t.toDepartmentId)}</b>
            {t.handoverRemarks && <div className="muted">{t.handoverRemarks}</div>}
          </>
        ),
        meta: join(
          t.conditionAtHandover && `Condition: ${t.conditionAtHandover}`,
          t.isTemporary && t.expectedReturnDate && `Return by ${date(t.expectedReturnDate)}`,
          t.requestedBy && `By ${names.user(t.requestedBy)}`,
          t.handoverAcknowledged && 'Handover acknowledged'
        ),
        status: t.status,
        icon: <ArrowLeftRight size={13} />,
        tone: 'blue',
        to: '/transfers',
      });
    }

    for (const { contract: c, visits } of h.contracts) {
      const name = `${c.contractType} ${c.contractNumber}`;
      add({ key: `ct-${c.contractId}`, at: c.startDate, kind: 'coverage', title: `Covered under ${name}`, details: join(c.vendorName, `${date(c.startDate)} → ${date(c.endDate)}`, c.sla && `SLA ${c.sla}`), status: c.status, icon: <ShieldCheck size={13} />, tone: 'cyan', to: `/contracts/${c.contractId}` });
      add({ key: `ct-end-${c.contractId}`, at: c.endDate, kind: 'coverage', title: `${name} ${valid(c.endDate) && isFuture(c.endDate) ? 'ends' : 'ended'}`, details: c.vendorName, icon: <ShieldCheck size={13} />, tone: 'amber', to: `/contracts/${c.contractId}` });
      for (const v of visits) {
        add({
          key: `v-${v.visitId}`,
          at: v.visitDate,
          kind: 'maintenance',
          title: `${v.visitType || 'Service'} visit`,
          details: (
            <>
              {v.description && <div>{v.description}</div>}
              {v.findings && <div><span className="muted">Findings:</span> {v.findings}</div>}
              {v.actionTaken && <div><span className="muted">Action taken:</span> {v.actionTaken}</div>}
            </>
          ),
          meta: join(v.technicianName && `Technician: ${v.technicianName}`, name),
          status: v.status,
          icon: <Wrench size={13} />,
          tone: 'amber',
          to: `/contracts/${c.contractId}`,
        });
        add({ key: `v-next-${v.visitId}`, at: v.nextVisitDate, kind: 'maintenance', title: 'Next service visit due', meta: name, icon: <Wrench size={13} />, tone: 'slate', to: `/contracts/${c.contractId}` });
      }
    }

    for (const s of h.scans) {
      add({
        key: `scan-${s.scanLogId}`,
        at: s.scannedDate,
        kind: 'audit',
        title: `Audit scan · ${s.audit.auditName}`,
        details: join(s.scannedLocationId && `Found at ${names.location(s.scannedLocationId)}`, s.remarks),
        meta: join(s.audit.auditCode, s.scanType, s.scannedBy && `By ${names.user(s.scannedBy)}`),
        status: s.scanResult,
        icon: <ClipboardCheck size={13} />,
        tone: 'purple',
        to: `/audits/${s.auditId}`,
      });
    }

    for (const d of h.schedules) {
      add({ key: `dep-${d.depreciationId}`, at: d.createdDate, kind: 'financial', title: 'Depreciation schedule set up', details: join(depreciationMethodLabel(d.depreciationMethod), `${d.usefulLifeMonths} months`, `Purchase value ${money(d.purchaseValue)}`, `Residual ${money(d.residualValue)}`), meta: d.createdBy ? `By ${names.user(d.createdBy)}` : undefined, status: d.status, icon: <Calculator size={13} />, tone: 'cyan', to: '/depreciation' });
      add({ key: `dep-calc-${d.depreciationId}`, at: d.lastCalculatedDate, kind: 'financial', title: 'Depreciation calculated', details: join(`Accumulated ${money(d.accumulatedDepreciation)}`, `Book value ${money(d.currentBookValue)}`), icon: <Calculator size={13} />, tone: 'cyan', to: '/depreciation' });
    }
    h.calculations.forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      const dateKey = Object.keys(c).find((k) => /date/i.test(k) && valid(c[k]));
      const amounts = Object.entries(c).filter(([k, v]) => typeof v === 'number' && /(amount|value|depreciation)$/i.test(k));
      add({ key: `dep-h-${i}`, at: dateKey ? c[dateKey] : null, kind: 'financial', title: 'Depreciation posted', details: amounts.map(([k, v]) => `${humanize(k)} ${money(v as number)}`).join(' · '), icon: <Calculator size={13} />, tone: 'cyan', to: '/depreciation' });
    });

    for (const d of h.disposals) {
      const to = `/disposal/${d.disposalId}`;
      add({ key: `dsp-${d.disposalId}`, at: d.requestDate, kind: 'disposal', title: 'Disposal requested', details: join(d.retirementReason, d.assetCondition && `Condition: ${d.assetCondition}`, d.requestedDisposalMethod && `Method: ${d.requestedDisposalMethod}`), meta: join(d.disposalRequestNumber, d.requestedBy && `By ${names.user(d.requestedBy)}`), icon: <Trash2 size={13} />, tone: 'red', to });
      const rejected = (d.approvalStatus || '').toLowerCase() === 'rejected';
      add({ key: `dsp-ap-${d.disposalId}`, at: d.approvalDate, kind: 'disposal', title: rejected ? 'Disposal rejected' : 'Disposal approved', details: d.approvalRemarks, meta: d.approvedBy ? `By ${names.user(d.approvedBy)}` : undefined, status: d.approvalStatus, icon: <Trash2 size={13} />, tone: rejected ? 'slate' : 'red', to });
      add({ key: `dsp-done-${d.disposalId}`, at: d.disposalDate, kind: 'disposal', title: 'Disposed', details: join(d.disposalMethod, d.disposalValue != null && `Recovered ${money(d.disposalValue)}`, d.buyerVendorName && `To ${d.buyerVendorName}`, d.disposalRemarks), status: d.finalAssetStatus, icon: <Trash2 size={13} />, tone: 'red', to });
    }

    return out;
  }, [h, names]);
}

function Timeline({ events }: { events: LifeEvent[] }) {
  const navigate = useNavigate();
  return (
    <div className="timeline">
      {events.map((e) => (
        <div className="tl-item" key={e.key}>
          <div className={`tl-dot tone-${e.tone}`}>{e.icon}</div>
          <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="tl-title">{e.title}</div>
              <div className="tl-meta">{join(when(e.at), typeof e.meta === 'string' ? e.meta : null)}</div>
              {e.details && <div className="tl-details">{e.details}</div>}
            </div>
            <div className="row" style={{ gap: 6, flexShrink: 0 }}>
              {e.status && <StatusBadge status={e.status} />}
              {e.to && (
                <button className="icon-btn" title="Open" onClick={() => navigate(e.to!)}>
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LifecyclePage() {
  const [params, setParams] = useSearchParams();
  const assetId = Number(params.get('asset')) || null;
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const names = useNames();
  const { data, loading, error, reload } = useFetch(() => (assetId ? loadHistory(assetId) : Promise.resolve(null)), [assetId]);
  const events = useEvents(data && data.asset.assetId === assetId ? data : null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.kind, (m.get(e.kind) || 0) + 1);
    return m;
  }, [events]);
  const shown = events.filter((e) => filter === 'all' || e.kind === filter);
  const upcoming = shown.filter((e) => isFuture(e.at)).sort((x, y) => x.at.localeCompare(y.at));
  const past = shown.filter((e) => !isFuture(e.at)).sort((x, y) => y.at.localeCompare(x.at));
  const a = data?.asset;

  return (
    <>
      <PageHeader
        title="Asset Lifecycle"
        subtitle="Everything that happened to an asset: transfers, maintenance, audits, depreciation and disposal"
        actions={
          <>
            <div style={{ width: 360, maxWidth: '100%' }}>
              <AssetSelect value={assetId ? String(assetId) : null} onChange={(v) => setParams(v ? { asset: v } : {}, { replace: true })} />
            </div>
            {assetId && (
              <button className="btn" onClick={reload} disabled={loading}>
                <RefreshCw size={16} /> Refresh
              </button>
            )}
          </>
        }
      />

      {!assetId ? (
        <Card>
          <Empty icon={<GitBranch size={24} />} title="Select an asset" message="Pick an asset above to see its full history." />
        </Card>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !a ? (
        <Loading />
      ) : (
        <>
          <Card
            title={
              <span className="row" style={{ gap: 8 }}>
                {a.assetName || '(unnamed)'} <StatusBadge status={a.status || undefined} />
              </span>
            }
            subtitle={<span className="mono">{a.assetCode || `#${a.assetId}`}</span>}
            actions={
              <Link className="btn btn-sm" to={`/assets/${a.assetId}`}>
                <ExternalLink size={14} /> Open asset
              </Link>
            }
          >
            <KV
              items={[
                ['Assigned to', a.assignedTo ? names.employee(a.assignedTo) : 'Unassigned'],
                ['Location', names.location(a.locationId)],
                ['Department', names.department(a.departmentId)],
                ['Purchased', a.purchaseDate ? `${date(a.purchaseDate)} · ${money(a.purchaseCost)}` : null],
                ['Movements', String(counts.get('transfer') || 0)],
                ['Service visits', String(counts.get('maintenance') || 0)],
              ]}
            />
          </Card>

          <div className="card mt">
            <Tabs
              active={filter}
              onChange={(k) => setFilter(k as Kind | 'all')}
              tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, count: f.key === 'all' ? events.length : counts.get(f.key) || 0 }))}
            />
          </div>

          {upcoming.length > 0 && (
            <Card title="Upcoming" subtitle="Scheduled expiries and service visits" className="mt">
              <Timeline events={upcoming} />
            </Card>
          )}
          <Card title="History" subtitle={past.length ? `${past.length} event${past.length === 1 ? '' : 's'}, newest first` : undefined} className="mt">
            {past.length ? (
              <Timeline events={past} />
            ) : (
              <Empty title="No events yet" message={filter === 'all' ? 'Nothing has been recorded for this asset.' : 'No events of this type for this asset.'} />
            )}
          </Card>
        </>
      )}
    </>
  );
}
