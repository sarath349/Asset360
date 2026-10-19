import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Archive, Calculator, Coins, Download, Landmark, Plus, RefreshCw, Table2, TrendingDown } from 'lucide-react';
import { ApiDepreciation } from '../api/assetApi';
import { ApiAsset, assetApi, DEPRECIATION_METHODS, depreciationApi, depreciationMethodLabel } from '../api/assetApi';
import { useFetch } from '../lib/hooks';
import { CHART_COLORS, date, dateTime, downloadCsv, money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { Card, DataTable, Empty, ErrorState, Kpi, Loading, PageHeader, Progress, SearchInput } from '../components/ui';
import { SearchSelect } from '../components/pickers';
import { DepreciationModal } from '../components/assetModals';
import { ScheduleModal } from '../components/DepreciationSchedule';

export default function DepreciationPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { categories } = useData();
  const { inScope } = useBranch();
  const [category, setCategory] = useState<string | null>(null);
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState<(ApiDepreciation & { assetCode: string; assetName: string }) | null>(null);
  const { data, loading, error, reload } = useFetch(() => Promise.all([depreciationApi.list(), assetApi.list().catch(() => [] as ApiAsset[])]), []);
  const [rawRecords, rawAssets] = data || [[], []];
  const assets = useMemo(() => rawAssets.filter((a) => inScope(a.locationId)), [rawAssets, inScope]);
  const records = useMemo(() => {
    const ids = new Set(assets.map((a) => a.assetId));
    return rawRecords.filter((r) => ids.has(r.assetId));
  }, [rawRecords, assets]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.assetId, a])), [assets]);
  const catName = useMemo(() => new Map(categories.map((c) => [c._id, c.name])), [categories]);

  const all = useMemo(
    () =>
      records.map((r) => {
        const a = assetById.get(r.assetId);
        const depreciable = Math.max(0, r.purchaseValue - r.residualValue);
        return {
          ...r,
          _id: String(r.depreciationId),
          assetCode: a?.assetCode || `#${r.assetId}`,
          assetName: a?.assetName || '',
          categoryId: a?.categoryId || null,
          category: a?.categoryId ? catName.get(`c${a.categoryId}`) || '' : '',
          percent: depreciable ? Math.min(100, (r.accumulatedDepreciation / depreciable) * 100) : 0,
        };
      }),
    [records, assetById, catName]
  );

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (!category || String(r.categoryId) === category) &&
          (!method || r.depreciationMethod === method) &&
          (!q || [r.assetCode, r.assetName, r.category].some((x) => x.toLowerCase().includes(q.toLowerCase())))
      ),
    [all, category, method, q]
  );

  const sum = (k: 'purchaseValue' | 'accumulatedDepreciation' | 'currentBookValue') => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const byCategory = useMemo(() => {
    const m: Record<string, { name: string; book: number }> = {};
    for (const r of rows) {
      const k = r.category || 'Uncategorised';
      m[k] = m[k] || { name: k, book: 0 };
      m[k].book += r.currentBookValue;
    }
    return Object.values(m).sort((a, b) => b.book - a.book);
  }, [rows]);

  const recalc = async (ids: number[]) => {
    setBusy(true);
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await depreciationApi.calculate(id);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Calculation failed');
      }
    }
    setBusy(false);
    if (errors.length) {
      const unique = [...new Set(errors)];
      if (ids.length === 1) toast.error(unique[0]);
      else if (unique.length === 1) toast.error(`${errors.length} of ${ids.length}: ${unique[0]}`);
      else toast.error(`${errors.length} of ${ids.length} failed. ${unique[0]}`);
    } else {
      toast.success(ids.length === 1 ? 'Recalculated' : `Recalculated ${ids.length} assets`);
    }
    reload();
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;

  const exportCsv = () =>
    downloadCsv(
      `depreciation-register-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: 'assetCode', label: 'Asset code' },
        { key: 'assetName', label: 'Name' },
        { key: 'category', label: 'Category' },
        { key: 'depreciationMethod', label: 'Method' },
        { key: 'usefulLifeMonths', label: 'Useful life (months)' },
        { key: 'depreciationStartDate', label: 'Start date' },
        { key: 'purchaseValue', label: 'Purchase value' },
        { key: 'residualValue', label: 'Residual value' },
        { key: 'accumulatedDepreciation', label: 'Accumulated' },
        { key: 'currentBookValue', label: 'Book value' },
        { key: 'lastCalculatedDate', label: 'Last calculated' },
      ],
      rows.map((r) => ({ ...r, depreciationStartDate: r.depreciationStartDate?.slice(0, 10), lastCalculatedDate: r.lastCalculatedDate?.slice(0, 10) }))
    );

  const cost = sum('purchaseValue');
  const accumulated = sum('accumulatedDepreciation');

  return (
    <>
      <PageHeader
        title="Depreciation"
        subtitle="Straight-line and declining-balance depreciation calculated by the AssetAPI from purchase value, useful life and residual value."
        actions={
          <>
            <button className="btn" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export</button>
            {can('depreciation', 'edit') && (
              <button className="btn" onClick={() => recalc(rows.map((r) => r.depreciationId))} disabled={busy || !rows.length}>
                <RefreshCw size={16} /> Recalculate all
              </button>
            )}
            {can('depreciation', 'create') && <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Set up asset</button>}
          </>
        }
      />
      {can('depreciation', 'edit') && all.some((r) => !r.lastCalculatedDate) && (
        <div className="alert alert-warn mb">
          <div style={{ flex: 1 }}>
            {all.filter((r) => !r.lastCalculatedDate).length} schedule(s) have never been calculated, so book value still equals cost.
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={() => recalc(all.filter((r) => !r.lastCalculatedDate).map((r) => r.depreciationId))}>
            <RefreshCw size={14} /> Calculate now
          </button>
        </div>
      )}
      <div className="grid grid-kpi mb">
        <Kpi label="Gross asset cost" value={money(cost, { compact: true })} hint={`${rows.length} depreciable assets`} icon={<Landmark size={19} />} />
        <Kpi label="Accumulated depreciation" value={money(accumulated, { compact: true })} hint={`${cost ? Math.round((accumulated / cost) * 100) : 0}% of cost`} icon={<TrendingDown size={19} />} toneName="red" />
        <Kpi label="Net book value" value={money(sum('currentBookValue'), { compact: true })} icon={<Coins size={19} />} toneName="green" />
        <Kpi label="Fully depreciated" value={rows.filter((r) => r.currentBookValue <= r.residualValue).length} icon={<Archive size={19} />} toneName="slate" />
        <Kpi label="Not set up" value={Math.max(0, assets.length - new Set(records.map((r) => r.assetId)).size)} hint="Assets without a schedule" icon={<Calculator size={19} />} toneName="amber" />
      </div>
      <div className="grid grid-3 mb" style={{ alignItems: 'start' }}>
        <div className="card span-2">
          <div className="card-head">
            <div>
              <h3>Depreciation register</h3>
              <div className="sub">One row per depreciation schedule</div>
            </div>
          </div>
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search assets…" />
            <div style={{ width: 200 }}>
              <SearchSelect
                options={categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name }))}
                value={category}
                onChange={setCategory}
                placeholder="All categories"
              />
            </div>
            <select className="select" style={{ width: 180 }} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">All methods</option>
              {DEPRECIATION_METHODS.map((m) => <option key={m} value={m}>{depreciationMethodLabel(m)}</option>)}
            </select>
          </div>
          <DataTable
            rows={rows}
            pageSize={20}
            onRowClick={(r) => navigate(`/assets/${r.assetId}?tab=depreciation`)}
            initialSort={{ key: 'currentBookValue', dir: 'desc' }}
            empty={<Empty title="No depreciation schedules" message="Set up depreciation for an asset to start tracking its book value." />}
            columns={[
              { key: 'assetCode', label: 'Asset', render: (r) => <div><div className="cell-main">{r.assetName || r.assetCode}</div><div className="cell-sub mono">{r.assetCode}</div></div> },
              { key: 'depreciationMethod', label: 'Method', render: (r) => <span className="small">{depreciationMethodLabel(r.depreciationMethod)}<div className="cell-sub">{r.usefulLifeMonths} months{r.annualDepreciationRate ? ` · ${r.annualDepreciationRate}%` : ''}</div></span> },
              { key: 'depreciationStartDate', label: 'Start', render: (r) => date(r.depreciationStartDate) },
              { key: 'purchaseValue', label: 'Cost', className: 'right', render: (r) => money(r.purchaseValue) },
              { key: 'accumulatedDepreciation', label: 'Accumulated', className: 'right', render: (r) => money(r.accumulatedDepreciation) },
              { key: 'currentBookValue', label: 'Book value', className: 'right', render: (r) => <b>{money(r.currentBookValue)}</b> },
              {
                key: 'percent',
                label: 'Depreciated',
                render: (r) => (
                  <div style={{ minWidth: 90 }} title={r.lastCalculatedDate ? `Last calculated ${dateTime(r.lastCalculatedDate)}` : 'Not calculated yet'}>
                    <div className="xs muted">{Math.round(r.percent)}%</div>
                    <Progress value={r.percent} />
                  </div>
                ),
              },
              {
                key: 'act',
                label: '',
                sortable: false,
                className: 'right',
                render: (r) =>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      title="Year-by-year schedule"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSchedule(r);
                      }}
                    >
                      <Table2 size={14} />
                    </button>
                  {can('depreciation', 'edit') && (
                    <button
                      className="btn btn-sm btn-ghost btn-icon"
                      title="Recalculate"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        recalc([r.depreciationId]);
                      }}
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                  </div>,
              },
            ]}
          />
        </div>
        <Card title="Book value by category">
          {byCategory.length ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={byCategory} dataKey="book" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                    {byCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="stack" style={{ gap: 6 }}>
                {byCategory.slice(0, 8).map((c, i) => (
                  <div key={c.name} className="row-between small">
                    <span className="row" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length] }} />{c.name}</span>
                    <b>{money(c.book, { compact: true })}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No data" />
          )}
        </Card>
      </div>
      <DepreciationModal open={open} onClose={() => setOpen(false)} onDone={reload} />
      <ScheduleModal open={Boolean(schedule)} onClose={() => setSchedule(null)} record={schedule} title={schedule ? `${schedule.assetName || schedule.assetCode} · ${depreciationMethodLabel(schedule.depreciationMethod)} schedule` : undefined} />
    </>
  );
}
