import { ReactNode, useMemo } from 'react';
import { date, dateTime, money, num } from '../lib/format';
import { DataTable, Empty, KV, StatusBadge } from './ui';

// Renders AssetAPI responses whose shape is not documented in the Swagger spec.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MONEY_KEY = /(cost|value|amount|price|depreciation)$/i;

export const humanize = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export function autoFormat(key: string, v: any): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="faint">—</span>;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return MONEY_KEY.test(key) && !/rate|percent/i.test(key) ? money(v) : num(v);
  if (typeof v === 'string' && ISO_DATE.test(v)) return /T00:00:00/.test(v) ? date(v) : dateTime(v);
  if (/status|result/i.test(key) && typeof v === 'string') return <StatusBadge status={v} />;
  if (typeof v === 'object') return <span className="small muted">{Array.isArray(v) ? `${v.length} items` : JSON.stringify(v).slice(0, 80)}</span>;
  return String(v);
}

const isScalar = (v: any) => v === null || typeof v !== 'object';

export function AutoTable({ rows, empty, hide = [], pageSize = 15, onRowClick }: { rows: any[]; empty?: ReactNode; hide?: string[]; pageSize?: number; onRowClick?: (r: any) => void }) {
  const keys = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r && typeof r === 'object') Object.keys(r).forEach((k) => seen.add(k));
    return [...seen].filter((k) => !hide.includes(k) && rows.some((r) => isScalar(r?.[k]) && r?.[k] !== null && r?.[k] !== ''));
  }, [rows, hide]);
  const data = useMemo(() => rows.map((r, i) => (r && typeof r === 'object' ? { _id: String(i), ...r } : { _id: String(i), value: r })), [rows]);
  return (
    <DataTable
      rows={data}
      pageSize={pageSize}
      onRowClick={onRowClick}
      empty={empty || <Empty title="No records" />}
      columns={(keys.length ? keys : ['value']).map((k) => ({
        key: k,
        label: humanize(k),
        className: rows.some((r) => typeof r?.[k] === 'number') ? 'right' : undefined,
        sortValue: (r: any) => r[k],
        render: (r: any) => autoFormat(k, r[k]),
      }))}
    />
  );
}

// Objects become a key/value grid of their scalar fields followed by a table for each array field.
export function AutoView({ data, empty }: { data: any; empty?: ReactNode }) {
  if (data === null || data === undefined || data === '') return <>{empty || <Empty title="No data" />}</>;
  if (Array.isArray(data)) return <AutoTable rows={data} empty={empty} />;
  if (typeof data !== 'object') return <div className="small">{String(data)}</div>;
  const scalars = Object.entries(data).filter(([, v]) => isScalar(v));
  const nested = Object.entries(data).filter(([, v]) => !isScalar(v));
  return (
    <div className="stack">
      {scalars.length > 0 && <KV items={scalars.map(([k, v]) => [humanize(k), autoFormat(k, v)])} />}
      {nested.map(([k, v]) => (
        <div key={k}>
          <h4 className="small bold" style={{ margin: '6px 0 10px' }}>
            {humanize(k)}
          </h4>
          <AutoView data={v} empty={<div className="small muted">None</div>} />
        </div>
      ))}
    </div>
  );
}
