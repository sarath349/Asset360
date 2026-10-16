import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, FileBarChart2, Printer, RefreshCw } from 'lucide-react';
import { auditApi, reportApi } from '../api/assetApi';
import { useFetch } from '../lib/hooks';
import { dateTime, downloadCsv, money, num } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { Empty, ErrorState, Kpi, Loading, PageHeader, SearchInput } from '../components/ui';
import { AutoTable, humanize } from '../components/AutoData';

interface ReportDef {
  key: string;
  name: string;
  group: string;
  description: string;
  range?: boolean;
  audit?: boolean;
  load: (p: { fromDate?: string; toDate?: string; auditId?: string }) => Promise<any>;
}

const REPORTS: ReportDef[] = [
  { key: 'assets-by-location', name: 'Assets by location', group: 'Inventory', description: 'Asset count and value per location', load: () => reportApi.assetsByLocation() },
  { key: 'assets-by-category', name: 'Assets by category', group: 'Inventory', description: 'Asset count and value per category', load: () => reportApi.assetsByCategory() },
  { key: 'asset-value', name: 'Asset value', group: 'Financial', description: 'Purchase value, accumulated depreciation and book value per asset', load: () => reportApi.assetValue() },
  { key: 'depreciation', name: 'Depreciation', group: 'Financial', description: 'Depreciation posted in the period', range: true, load: (p) => reportApi.depreciation(p) },
  { key: 'disposals', name: 'Disposals', group: 'Financial', description: 'Disposed assets and recovered value in the period', range: true, load: (p) => reportApi.disposals(p) },
  { key: 'warranty-expiry', name: 'Warranty expiry', group: 'Compliance', description: 'Warranties ending in the period', range: true, load: (p) => reportApi.warrantyExpiry(p) },
  { key: 'amc-expiry', name: 'AMC expiry', group: 'Compliance', description: 'AMC coverage ending in the period', range: true, load: (p) => reportApi.amcExpiry(p) },
  { key: 'audit-discrepancies', name: 'Audit discrepancies', group: 'Compliance', description: 'Missing, mismatched and unexpected assets for an audit', audit: true, load: (p) => (p.auditId ? reportApi.auditDiscrepancies(p.auditId) : Promise.resolve(null)) },
];

// Reports return either a plain list or a summary object with one list of detail rows.
function split(data: any): { summary: [string, any][]; rows: any[] } {
  if (Array.isArray(data)) return { summary: [], rows: data };
  if (!data || typeof data !== 'object') return { summary: [], rows: [] };
  const entries = Object.entries(data);
  const list = entries.find(([, v]) => Array.isArray(v));
  return { summary: entries.filter(([, v]) => v === null || typeof v !== 'object'), rows: (list?.[1] as any[]) || [] };
}

const isMoneyKey = (k: string) => /(value|cost|amount|depreciation)$/i.test(k);

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const active = REPORTS.find((r) => r.key === params.get('r')) || REPORTS[0];
  const { can } = useAuth();
  const { activeBranch } = useBranch();
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [auditId, setAuditId] = useState('');
  const { data: audits } = useFetch(() => (active.audit ? auditApi.campaigns() : Promise.resolve([])), [active.audit]);
  const { data, loading, error, reload } = useFetch(
    () => active.load({ fromDate: active.range ? fromDate || undefined : undefined, toDate: active.range ? toDate || undefined : undefined, auditId }),
    [active.key, fromDate, toDate, auditId]
  );
  const generatedAt = useMemo(() => new Date().toISOString(), [data]);

  const { summary, rows: allRows } = useMemo(() => split(data), [data]);
  const rows = useMemo(() => {
    if (!q) return allRows;
    const s = q.toLowerCase();
    return allRows.filter((r) => Object.values(r || {}).some((v) => String(v ?? '').toLowerCase().includes(s)));
  }, [allRows, q]);

  const keys = useMemo(() => [...new Set(allRows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))], [allRows]);
  const chart = useMemo(() => {
    const x = keys.find((k) => allRows.every((r) => typeof r?.[k] === 'string'));
    const numeric = keys.filter((k) => !/id$/i.test(k) && allRows.some((r) => typeof r?.[k] === 'number'));
    const y = numeric.find((k) => /count/i.test(k)) || numeric.find((k) => /book/i.test(k)) || numeric.find(isMoneyKey) || numeric[0];
    return x && y && allRows.length > 1 && allRows.length <= 40 ? { x, y } : null;
  }, [keys, allRows]);

  const groups = useMemo(() => {
    const g: Record<string, ReportDef[]> = {};
    for (const r of REPORTS) (g[r.group] = g[r.group] || []).push(r);
    return g;
  }, []);

  return (
    <>
      <PageHeader title="Reports" subtitle="Inventory, financial and compliance reports from the AssetAPI. Export to CSV or print to PDF." />
      {activeBranch && <div className="alert alert-warn mb">Reports are generated by the AssetAPI for all branches. The branch filter ({activeBranch.name}) does not apply here.</div>}
      <div className="grid" style={{ gridTemplateColumns: '270px 1fr', alignItems: 'start' }}>
        <div className="card no-print" style={{ position: 'sticky', top: 80 }}>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g} style={{ padding: '10px 10px 4px' }}>
              <div className="xs muted bold" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 8px 6px' }}>{g}</div>
              {list.map((r) => (
                <button
                  key={r.key}
                  onClick={() => { setParams({ r: r.key }); setQ(''); }}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, border: 0, background: active.key === r.key ? 'var(--primary-50, #eef2ff)' : 'transparent', color: active.key === r.key ? 'var(--primary)' : 'inherit', fontWeight: active.key === r.key ? 600 : 500, cursor: 'pointer', fontSize: 13.5 }}
                >
                  <FileBarChart2 size={15} /> {r.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{active.name}</h3>
                <div className="sub">{active.description} · generated {dateTime(generatedAt)}</div>
              </div>
              <div className="row no-print">
                {active.range && (
                  <>
                    <input type="date" className="input input-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" style={{ width: 150 }} />
                    <span className="faint">→</span>
                    <input type="date" className="input input-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" style={{ width: 150 }} />
                  </>
                )}
                {active.audit && (
                  <select className="select input-sm" value={auditId} onChange={(e) => setAuditId(e.target.value)} style={{ width: 240 }}>
                    <option value="">Select audit…</option>
                    {(audits || []).map((a) => (
                      <option key={a.auditId} value={a.auditId}>{a.auditCode} · {a.auditName}</option>
                    ))}
                  </select>
                )}
                <button className="btn btn-sm btn-ghost btn-icon" onClick={reload} title="Refresh"><RefreshCw size={15} /></button>
                {can('reports', 'export') && (
                  <button className="btn btn-sm" disabled={!rows.length} onClick={() => downloadCsv(`${active.key}-${new Date().toISOString().slice(0, 10)}.csv`, keys.map((k) => ({ key: k, label: humanize(k) })), rows)}>
                    <Download size={14} /> CSV
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
              </div>
            </div>
            {error ? (
              <div className="card-body"><ErrorState message={error} onRetry={reload} /></div>
            ) : loading && data === null ? (
              <Loading />
            ) : active.audit && !auditId ? (
              <Empty title="Select an audit" message="Pick an audit campaign to see its discrepancies." />
            ) : (
              <>
                {summary.length > 0 && (
                  <div className="grid grid-kpi" style={{ padding: 16, paddingBottom: 0 }}>
                    {summary.map(([k, v]) => (
                      <Kpi key={k} label={humanize(k)} value={typeof v === 'number' ? (isMoneyKey(k) ? money(v, { compact: true }) : num(v)) : String(v ?? '—')} icon={<BarChart3 size={18} />} />
                    ))}
                  </div>
                )}
                {chart && (
                  <div className="card-body" style={{ borderBottom: '1px solid var(--border)' }}>
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={[...allRows].sort((a, b) => (b[chart.y] || 0) - (a[chart.y] || 0))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                        <XAxis dataKey={chart.x} tickLine={false} axisLine={false} fontSize={11} interval={0} />
                        <YAxis tickLine={false} axisLine={false} fontSize={11} width={60} allowDecimals={false} tickFormatter={(v) => (isMoneyKey(chart.y) ? money(v, { compact: true }) : v)} />
                        <Tooltip formatter={(v: number) => (isMoneyKey(chart.y) ? money(v) : num(v))} />
                        <Bar dataKey={chart.y} name={humanize(chart.y)} fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="toolbar no-print">
                  <SearchInput value={q} onChange={setQ} placeholder="Filter rows…" />
                  <div className="spacer" />
                  <span className="small muted"><BarChart3 size={14} style={{ verticalAlign: -2 }} /> {rows.length} rows</span>
                </div>
                <AutoTable rows={rows} pageSize={25} empty={<Empty title="No rows for this report" message={active.range ? 'Try a wider date range.' : undefined} />} />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
