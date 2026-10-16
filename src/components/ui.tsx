import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';
import { initials, label as fmtLabel, tone } from '../lib/format';

export function PageHeader({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[] }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <ChevronRight size={13} />}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, bodyClass, className, style }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; bodyClass?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`card ${className || ''}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClass || ''}`}>{children}</div>
    </div>
  );
}

export function Kpi({ label, value, hint, icon, toneName = 'indigo', to, onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; toneName?: string; to?: string; onClick?: () => void }) {
  const inner = (
    <>
      <div className={`kpi-icon tone-${toneName}`}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {hint && <div className="kpi-hint">{hint}</div>}
      </div>
    </>
  );
  if (to)
    return (
      <Link to={to} className="card kpi">
        {inner}
      </Link>
    );
  return (
    <div className={`card kpi ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      {inner}
    </div>
  );
}

export function Badge({ children, color, plain }: { children: ReactNode; color?: string; plain?: boolean }) {
  return <span className={`badge badge-${color || 'slate'} ${plain ? 'plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ status, text }: { status?: string; text?: string }) {
  if (!status) return <span className="faint">—</span>;
  return <Badge color={tone(status)}>{text || fmtLabel(status)}</Badge>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: ReactNode; count?: number; icon?: ReactNode }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, size }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, message, confirmText = 'Confirm', danger, onConfirm, onClose, busy }: { open: boolean; title: string; message: ReactNode; confirmText?: string; danger?: boolean; onConfirm: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {confirmText}
          </button>
        </>
      }
    >
      <div className="muted" style={{ lineHeight: 1.6 }}>
        {message}
      </div>
    </Modal>
  );
}

export function Empty({ title = 'Nothing here yet', message, icon, action }: { title?: string; message?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <Inbox size={24} />}</div>
      <h4>{title}</h4>
      {message && <div className="small">{message}</div>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card card-body">
      <div className="alert alert-danger">
        <div style={{ flex: 1 }}>{message}</div>
        {onRetry && (
          <button className="btn btn-sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className || ''}`}>
      <label className={required ? 'req' : ''}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Avatar({ name, size }: { name?: string; size?: 'sm' }) {
  const hue = useMemo(() => {
    let h = 0;
    for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }, [name]);
  return (
    <div className={`avatar ${size || ''}`} style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 50%))` }}>
      {initials(name)}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Search size={16} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => any;
  className?: string;
  width?: number | string;
  sortable?: boolean;
}

export function DataTable<T extends { _id?: string }>({
  columns,
  rows,
  onRowClick,
  pageSize = 15,
  empty,
  initialSort,
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  pageSize?: number;
  empty?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  rowKey?: (row: T, i: number) => string;
}) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [rows.length]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = (r: T) => (col.sortValue ? col.sortValue(r) : (r as any)[col.key]);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (!rows.length) return <>{empty || <Empty />}</>;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false && (c.sortValue || typeof c.label === 'string');
                return (
                  <th
                    key={c.key}
                    className={`${c.className || ''} ${sortable ? 'sortable' : ''}`}
                    style={{ width: c.width }}
                    onClick={() => sortable && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))}
                  >
                    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
                      {c.label}
                      {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={rowKey ? rowKey(r, i) : r._id || i} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(r) : ((r as any)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize && <Pager page={page} pages={pages} total={sorted.length} pageSize={pageSize} onPage={setPage} />}
    </>
  );
}

export function Pager({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  return (
    <div className="table-foot">
      <span>
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pager">
        <button className="btn btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} />
        </button>
        <span className="small" style={{ padding: '0 8px' }}>
          Page {page} of {pages}
        </span>
        <button className="btn btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="kv-grid">
      {items.map(([k, v]) => (
        <div className="kv" key={k}>
          <div className="k">{k}</div>
          <div className="v">{v === undefined || v === null || v === '' ? <span className="faint">—</span> : v}</div>
        </div>
      ))}
    </div>
  );
}
