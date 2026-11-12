import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Boxes, CalendarClock, CheckCircle2, ClipboardCheck, DollarSign, FileWarning, MapPinOff, Plus, Shield, ShieldAlert, Trash2, Wrench,
} from 'lucide-react';
import { ApiAsset, ApiAuditCampaign, ApiDashboard, ApiDisposal, ChartPoint, assetApi, auditApi, dashboardApi, disposalApi } from '../api/assetApi';
import { useFetch } from '../lib/hooks';
import { CHART_COLORS, STATUS_COLORS, date, daysUntil, money, num } from '../lib/format';
import { Card, ErrorState, Kpi, Loading, PageHeader, Empty } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { CategoryNode, LocationNode, useData } from '../context/DataContext';
import { isCompleted } from './audits/AuditsPage';
import { disposalStage } from './disposal/DisposalPage';

// Months (YYYY-MM) in which the given dates fall, from today onwards.
function upcomingByMonth(dates: (string | null | undefined)[]): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const n = daysUntil(d);
    if (!d || n === null || n < 0) continue;
    counts.set(d.slice(0, 7), (counts.get(d.slice(0, 7)) || 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value }));
}

// The API's chart only knows about contract end dates, the register about each asset's own dates; show whichever is larger per month.
function mergeMonths(a: ChartPoint[] = [], b: ChartPoint[] = []): ChartPoint[] {
  const m = new Map<string, number>();
  for (const p of [...a, ...b]) m.set(p.label, Math.max(m.get(p.label) || 0, p.value));
  return [...m].map(([label, value]) => ({ label, value })).sort((x, y) => x.label.localeCompare(y.label));
}

const monthLabel = (m: string) => {
  const d = new Date(/^\d{4}-\d{2}$/.test(m) ? `${m}-01` : m);
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

function MonthlyBars({ data, color, name, currency, emptyTitle = 'No data' }: { data: ChartPoint[]; color: string; name: string; currency?: boolean; emptyTitle?: string }) {
  if (!data?.length) return <Empty title={emptyTitle} />;
  const max = Math.max(...data.map((d) => d.value || 0), 0);
  // Counts must stay whole numbers — with small values Recharts otherwise ticks 0.25 / 0.5 / 0.75.
  const countDomain: [number, number] | undefined = currency ? undefined : [0, Math.max(4, Math.ceil(max))];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data.map((d) => ({ ...d, label: monthLabel(d.label) }))} margin={{ left: -14 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          allowDecimals={false}
          domain={countDomain}
          tickCount={currency ? undefined : Math.min(6, (countDomain?.[1] || 4) + 1)}
          tickFormatter={(v) => (currency ? money(v, { compact: true }).replace(/^\w+ /, '') : String(Math.round(v)))}
        />
        <Tooltip formatter={(v: number) => (currency ? money(v) : num(v))} />
        <Bar dataKey="value" name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Exclusive bands: 21–30, 11–20, 0–10 days left, and already expired. */
function expiryBuckets(dates: (string | null | undefined)[]) {
  const buckets = { d30: 0, d20: 0, d10: 0, expired: 0 };
  for (const d of dates) {
    const n = daysUntil(d);
    if (n === null) continue;
    if (n < 0) buckets.expired += 1;
    else if (n <= 10) buckets.d10 += 1;
    else if (n <= 20) buckets.d20 += 1;
    else if (n <= 30) buckets.d30 += 1;
  }
  return buckets;
}

function ExpiryCard({
  title,
  icon,
  buckets,
  to,
}: {
  title: string;
  icon: React.ReactNode;
  buckets: { d30: number; d20: number; d10: number; expired: number };
  to?: string;
}) {
  const items = [
    { label: '30 Days', value: buckets.d30, tone: 'blue' },
    { label: '20 Days', value: buckets.d20, tone: 'green' },
    { label: '10 Days', value: buckets.d10, tone: 'amber' },
    { label: 'Expired', value: buckets.expired, tone: 'red' },
  ];
  const body = (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div className="kpi-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
        <div className={`kpi-icon tone-indigo`} style={{ width: 34, height: 34 }}>{icon}</div>
      </div>
      <div className="expiry-buckets">
        {items.map((it, i) => (
          <div key={it.label} className="expiry-bucket">
            <div className={`expiry-dot tone-${it.tone}`}>{it.value}</div>
            <div className="xs muted">{it.label}</div>
            {i < items.length - 1 && <span className="expiry-line" aria-hidden />}
          </div>
        ))}
      </div>
    </>
  );
  if (to) return <Link to={to} className="card expiry-card">{body}</Link>;
  return <div className="card expiry-card">{body}</div>;
}

// The API's dashboard aggregates every branch, so with a branch selected the figures are rebuilt from that branch's assets.
function scopedDash(api: ApiDashboard, assets: ApiAsset[], categories: CategoryNode[], locations: LocationNode[]): ApiDashboard {
  const group = (key: (a: ApiAsset) => string, val: (a: ApiAsset) => number = () => 1): ChartPoint[] => {
    const m = new Map<string, number>();
    for (const a of assets) m.set(key(a), (m.get(key(a)) || 0) + val(a));
    return [...m].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
  };
  const cat = (a: ApiAsset) => categories.find((c) => c._id === `c${a.categoryId}`)?.name || 'Uncategorised';
  const loc = (a: ApiAsset) => locations.find((l) => l._id === String(a.locationId))?.name || 'Unknown';
  const count = (s: string) => assets.filter((a) => a.status === s).length;
  return {
    ...api,
    summary: {
      ...api.summary,
      totalAssets: assets.length,
      assetValue: assets.reduce((s, a) => s + (a.purchaseCost || 0), 0),
      activeAssets: count('Active'),
      assetsUnderRepair: count('In Repair') + count('Under Maintenance'),
      missingAssets: count('Missing'),
      warrantyExpiring: 0,
      amcExpiring: 0,
    },
    assetsByCategory: group(cat),
    assetValueByCategory: group(cat, (a) => a.purchaseCost || 0),
    assetDistribution: group((a) => a.status || 'Unknown'),
    assetsByLocation: group(loc),
    warrantyExpiryByMonth: [],
    amcExpiryByMonth: [],
    depreciationByMonth: [],
  };
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useFetch(() =>
    Promise.all([
      dashboardApi.get(),
      assetApi.list().catch(() => [] as ApiAsset[]),
      disposalApi.list().catch(() => [] as ApiDisposal[]),
      auditApi.campaigns().catch(() => [] as ApiAuditCampaign[]),
    ])
  );
  const { user, can } = useAuth();
  const { scopeIds, inScope, activeBranch } = useBranch();
  const { categories, locations } = useData();
  const navigate = useNavigate();

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error || 'Dashboard unavailable'} onRetry={reload} />;
  const [apiDash, allAssets, rawDisposals, rawAudits] = data;
  const assets = scopeIds ? allAssets.filter((a) => inScope(a.locationId)) : allAssets;
  const assetIds = new Set(assets.map((a) => a.assetId));
  const allDisposals = scopeIds ? rawDisposals.filter((d) => assetIds.has(d.assetId)) : rawDisposals;
  const audits = scopeIds ? rawAudits.filter((a) => inScope(a.siteId)) : rawAudits;
  const dash = scopeIds ? scopedDash(apiDash, assets, categories, locations) : apiDash;
  const k = dash.summary;
  // Requests still needing action: awaiting approval, or approved but not yet carried out.
  const pendingDisposals = allDisposals.filter((d) => ['pending', 'approved'].includes(disposalStage(d)));
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = (raw?: string | null) => Boolean(raw && String(raw).slice(0, 7) === currentMonth);
  const totalDisposalsThisMonth = allDisposals.filter((d) => {
    const when = d.disposalDate || d.approvalDate || d.requestDate || d.createdDate;
    return isCurrentMonth(when);
  }).length;
  const warrantyChart = mergeMonths(dash.warrantyExpiryByMonth, upcomingByMonth(assets.map((a) => a.warrantyEndDate)));
  const amcChart = mergeMonths(dash.amcExpiryByMonth, upcomingByMonth(assets.map((a) => a.amcEndDate)));
  const depreciationThisMonth = (dash.depreciationByMonth || []).filter((p) => p.label === currentMonth);
  const within30 = (d?: string | null) => {
    const n = daysUntil(d);
    return n !== null && n >= 0 && n <= 30;
  };
  const warrantyExpiring = Math.max(k.warrantyExpiring || 0, assets.filter((a) => within30(a.warrantyEndDate)).length);
  const amcExpiring = Math.max(k.amcExpiring || 0, assets.filter((a) => within30(a.amcEndDate)).length);
  const insuranceBuckets = expiryBuckets(assets.map((a) => a.insuranceEndDate));
  const warrantyBuckets = expiryBuckets(assets.map((a) => a.warrantyEndDate));
  const openAudits = audits.filter((a) => !isCompleted(a.status));
  // The API's summary.assetsUnderRepair stays 0 even when assets are In Repair, so count from the status breakdown.
  const underRepair = Math.max(
    k.assetsUnderRepair || 0,
    (dash.assetDistribution || []).filter((s) => ['in repair', 'under maintenance'].includes(s.label.toLowerCase())).reduce((n, s) => n + s.value, 0)
  );
  const hour = new Date().getHours();

  const categoryTotal = (dash.assetsByCategory || []).reduce((s, c) => s + c.value, 0);
  const categoryPie = (dash.assetsByCategory || []).map((c) => ({
    name: c.label,
    value: c.value,
    pct: categoryTotal ? (c.value / categoryTotal) * 100 : 0,
  }));

  const expiring = assets
    .flatMap((a) => [
      { a, kind: 'Warranty', d: a.warrantyEndDate },
      { a, kind: 'AMC', d: a.amcEndDate },
      { a, kind: 'Insurance', d: a.insuranceEndDate },
    ])
    .map((x) => ({ ...x, days: daysUntil(x.d) }))
    .filter((x) => x.days !== null && x.days >= 0 && x.days <= 60)
    .sort((x, y) => (x.days || 0) - (y.days || 0))
    .slice(0, 7);

  const recent = [...assets].sort((x, y) => String(y.createdDate).localeCompare(String(x.createdDate))).slice(0, 7);

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user?.name || ''}`}
        subtitle="Here's what's happening across your asset portfolio today."
        actions={
          <>
            {can('assets', 'create') && (
              <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>
                <Plus size={16} /> Add asset
              </button>
            )}
          </>
        }
      />

      {activeBranch && (
        <div className="alert alert-info mb">
          Showing figures for branch <b>{activeBranch.name}</b> only. Depreciation by month is available for all branches.
        </div>
      )}
      <div className="grid grid-4">
        <ExpiryCard title="Insurance Expiry" icon={<Shield size={16} />} buckets={insuranceBuckets} to="/contracts?tab=warranty" />
        <Kpi label="Total Assets" value={num(k.totalAssets)} hint="Asset count" icon={<Boxes size={20} />} toneName="green" to="/assets" />
        <ExpiryCard title="Warranty Expiry" icon={<ShieldAlert size={16} />} buckets={warrantyBuckets} to="/contracts?tab=warranty" />
        <Kpi label="Total Disposal" value={num(totalDisposalsThisMonth)} hint={`${num(allDisposals.length)} all-time · current month`} icon={<Trash2 size={20} />} toneName="amber" to="/disposal" />
      </div>

      <div className="grid grid-kpi mt">
        <Kpi label="Asset Value" value={money(k.assetValue, { compact: true })} hint="Purchase cost" icon={<DollarSign size={20} />} toneName="purple" to="/depreciation" />
        <Kpi label="Active Assets" value={num(k.activeAssets)} hint={`${k.totalAssets ? Math.round((k.activeAssets / k.totalAssets) * 100) : 0}% utilisation`} icon={<CheckCircle2 size={20} />} toneName="green" to="/assets?status=Active" />
        <Kpi label="Under Repair" value={num(underRepair)} icon={<Wrench size={20} />} toneName="amber" to="/assets?status=In Repair,Under Maintenance" />
        <Kpi label="Missing Assets" value={num(k.missingAssets)} icon={<MapPinOff size={20} />} toneName="red" to="/assets?status=Missing" />
        <Kpi label="Warranty Expiring" value={num(warrantyExpiring)} hint="Next 30 days" icon={<ShieldAlert size={20} />} toneName="amber" to="/contracts?tab=warranty" />
        <Kpi label="AMC Expiring" value={num(amcExpiring)} hint="Next 30 days" icon={<CalendarClock size={20} />} toneName="cyan" to="/contracts?tab=alerts" />
        <Kpi label="Total Disposal" value={num(totalDisposalsThisMonth)} hint={`${num(pendingDisposals.length)} open · ${num(openAudits.length)} audits open`} icon={<FileWarning size={20} />} toneName="slate" to="/disposal" />
      </div>

      <div className="grid grid-2 mt">
        <Card title="Site Wise Asset Count" subtitle="Assets by location">
          {dash.assetsByLocation?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dash.assetsByLocation} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  fontSize={11}
                  domain={[0, (max: number) => Math.max(4, Math.ceil(max))]}
                  tickFormatter={(v) => String(Math.round(v))}
                />
                <Tooltip formatter={(v: number) => num(v)} />
                <Bar dataKey="value" name="Assets" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={42} label={{ position: 'top', fontSize: 11, fill: '#64748b' }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty title="No locations yet" />
          )}
        </Card>
        <Card title="Category Wise Asset Count" subtitle="Share of total assets">
          {categoryPie.length ? (
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <ResponsiveContainer width="55%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    stroke="none"
                    label={({ value }) => {
                      const pct = categoryTotal ? (Number(value) / categoryTotal) * 100 : 0;
                      return `${value} : ${pct.toFixed(2)}%`;
                    }}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {categoryPie.map((c, i) => (
                      <Cell key={c.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _n, item) => {
                      const pct = (item?.payload as { pct?: number })?.pct ?? 0;
                      return [`${num(v)} (${pct.toFixed(2)}%)`, 'Assets'];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="stack" style={{ flex: 1, gap: 7, maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
                {categoryPie.map((c, i) => (
                  <div key={c.name} className="row-between small" style={{ gap: 10 }}>
                    <span className="row" style={{ gap: 8, minWidth: 0 }}>
                      <i style={{ width: 9, height: 9, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                      <span className="ellipsis">{c.name}</span>
                    </span>
                    <b style={{ whiteSpace: 'nowrap' }}>
                      {num(c.value)} · {c.pct.toFixed(1)}%
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty title="No assets yet" />
          )}
        </Card>
      </div>

      <div className="grid grid-3 mt">
        <Card title="Asset Status" subtitle="Operational distribution">
          {dash.assetDistribution?.length ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={dash.assetDistribution} dataKey="value" nameKey="label" innerRadius={56} outerRadius={86} paddingAngle={2} stroke="none">
                    {dash.assetDistribution.map((s) => (
                      <Cell key={s.label} fill={STATUS_COLORS[s.label] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legend" style={{ justifyContent: 'center' }}>
                {dash.assetDistribution.map((s) => (
                  <span key={s.label}>
                    <i style={{ background: STATUS_COLORS[s.label] || '#94a3b8' }} />
                    {s.label} <b style={{ color: 'var(--text)' }}>{s.value}</b>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No assets yet" />
          )}
        </Card>
        <Card title="Warranty Expiry" subtitle="Assets per month">
          <MonthlyBars data={warrantyChart} color="#f59e0b" name="Assets" />
        </Card>
        <Card title="AMC Expiry" subtitle="Assets per month">
          <MonthlyBars data={amcChart} color="#06b6d4" name="Assets" />
        </Card>
      </div>

      <div className="grid grid-3 mt">
        <Card title="Depreciation" subtitle="Current month">
          <MonthlyBars data={depreciationThisMonth} color="#8b5cf6" name="Depreciation" currency emptyTitle="No data" />
        </Card>
        <Card title="Expiring Soon" subtitle="Warranty, AMC & insurance in 60 days" bodyClass="tight">
          {expiring.length ? (
            expiring.map((x) => (
              <Link to={`/assets/${x.a.assetId}`} key={x.kind + x.a.assetId} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className={`kpi-icon ${x.kind === 'AMC' ? 'tone-cyan' : x.kind === 'Insurance' ? 'tone-blue' : 'tone-amber'}`} style={{ width: 34, height: 34 }}>
                  {x.kind === 'AMC' ? <CalendarClock size={16} /> : x.kind === 'Insurance' ? <Shield size={16} /> : <ShieldAlert size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-main ellipsis">{x.a.assetName}</div>
                  <div className="cell-sub ellipsis">
                    {x.kind} · {x.a.assetCode} · {date(x.d)}
                  </div>
                </div>
                <span className={`badge ${(x.days ?? 99) <= 10 ? 'badge-red' : 'badge-amber'}`}>{x.days}d</span>
              </Link>
            ))
          ) : (
            <Empty title="Nothing expiring" message="No warranties, AMCs or insurance policies expire in the next 60 days." />
          )}
        </Card>
        <Card title="Recently Registered" bodyClass="tight" actions={<Link to="/assets" className="small">View all</Link>}>
          {recent.length ? (
            recent.map((a) => (
              <Link to={`/assets/${a.assetId}`} key={a.assetId} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="kpi-icon tone-indigo" style={{ width: 34, height: 34 }}>
                  <Boxes size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-main ellipsis">{a.assetName}</div>
                  <div className="cell-sub ellipsis">
                    {a.assetCode} · {date(a.createdDate)}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <Empty title="No assets yet" />
          )}
        </Card>
      </div>

      {(pendingDisposals.length > 0 || openAudits.length > 0) && (
        <div className="grid grid-2 mt">
          <Card title="Total disposals" bodyClass="tight" actions={<Link to="/disposal" className="small">View all</Link>}>
            {pendingDisposals.length ? (
              pendingDisposals.slice(0, 6).map((d) => (
                <Link to={`/disposal/${d.disposalId}`} key={d.disposalId} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="kpi-icon tone-red" style={{ width: 34, height: 34 }}>
                    <Trash2 size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-main ellipsis">{d.disposalRequestNumber}</div>
                    <div className="cell-sub ellipsis">
                      {disposalStage(d) === 'approved' ? 'Approved · to dispose' : 'Awaiting approval'} · {d.retirementReason}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <Empty title="Nothing pending" />
            )}
          </Card>
          <Card title="Open audits" bodyClass="tight" actions={<Link to="/audits" className="small">View all</Link>}>
            {openAudits.length ? (
              openAudits.slice(0, 6).map((a) => (
                <Link to={`/audits/${a.auditId}`} key={a.auditId} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="kpi-icon tone-purple" style={{ width: 34, height: 34 }}>
                    <ClipboardCheck size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-main ellipsis">{a.auditName}</div>
                    <div className="cell-sub ellipsis">
                      {a.auditCode} · due {date(a.endDate)}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <Empty title="No open audits" />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
