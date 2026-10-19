import { ReactNode, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { ApiAsset, assetApi } from '../api/assetApi';
import { useClickOutside, useFetch } from '../lib/hooks';
import { buildTree, descendantIds, flatten, pathOf } from '../lib/tree';
import { useBranch } from '../context/BranchContext';
import { useData } from '../context/DataContext';

export interface Option {
  value: string;
  label: string;
  sub?: string;
  depth?: number;
  badge?: ReactNode;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  clearable = true,
  disabled,
  size,
}: {
  options: Option[];
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  size?: 'sm';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!q) return options.slice(0, 300);
    const s = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(s) || o.sub?.toLowerCase().includes(s)).slice(0, 300);
  }, [q, options]);

  return (
    <div className="picker" ref={ref}>
      <div
        className={`input picker-value ${size === 'sm' ? 'input-sm' : ''}`}
        style={{ opacity: disabled ? 0.6 : 1 }}
        onClick={() => !disabled && setOpen((o) => !o)}
        tabIndex={0}
      >
        <span className={`ellipsis ${selected ? '' : 'ph'}`}>{selected ? selected.label : placeholder}</span>
        <span className="row" style={{ gap: 2 }}>
          {clearable && selected && !disabled && (
            <X
              size={14}
              className="faint"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronDown size={15} className="faint" />
        </span>
      </div>
      {open && (
        <div className="picker-menu">
          <input className="input input-sm" autoFocus placeholder="Type to search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 4 }} />
          {filtered.length === 0 && <div className="picker-opt muted small">No matches</div>}
          {filtered.map((o) => (
            <div
              key={o.value}
              className={`picker-opt ${o.value === value ? 'active' : ''}`}
              style={{ paddingLeft: 10 + (q ? 0 : (o.depth || 0) * 14) }}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQ('');
              }}
            >
              <div className="row-between">
                <span className="cell-main" style={{ fontWeight: 550 }}>
                  {o.label}
                </span>
                {o.badge}
              </div>
              {o.sub && <div className="cell-sub">{o.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Select location…',
  types,
  underId,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  types?: string[];
  /** When set, only show this location and its descendants. */
  underId?: string | null;
}) {
  const { locations: all } = useData();
  const { scopeIds } = useBranch();
  const locations = useMemo(() => (scopeIds ? all.filter((l) => scopeIds.has(l._id) || l._id === value) : all), [all, scopeIds, value]);
  const options = useMemo(() => {
    const allowed = underId ? new Set(descendantIds(underId, locations)) : null;
    return flatten(buildTree(locations))
      .filter((n) => !types || types.includes(n.item.type.toLowerCase()))
      .filter((n) => !allowed || allowed.has(n.item._id) || n.item._id === value)
      .map((n) => ({
        value: n.item._id,
        label: n.item.name,
        depth: n.depth,
        sub: pathOf(n.item.parent, locations) || undefined,
        badge: n.item.type ? <span className="type-pill tone-slate">{n.item.type}</span> : undefined,
      }));
  }, [locations, types, underId, value]);
  return <SearchSelect options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

export function EmployeePicker({ value, onChange, placeholder = 'Select employee…' }: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const { employees, departments } = useData();
  const { scopeIds, deptInScope } = useBranch();
  const options = useMemo(
    () =>
      employees
        .filter((e) => !scopeIds || e._id === value || (e.locationId ? scopeIds.has(String(e.locationId)) : deptInScope(e.departmentId)))
        .filter((e) => e.active !== false || e._id === value)
        .map((e) => ({ value: e._id, label: e.name, sub: [e.empCode, e.designation, departments.find((d) => d.departmentId === e.departmentId)?.name].filter(Boolean).join(' · ') })),
    [employees, departments, value, scopeIds, deptInScope]
  );
  return <SearchSelect options={options} value={value} onChange={onChange} placeholder={employees.length ? placeholder : 'No employees yet — add them under Organization'} />;
}

// Login accounts from the AssetAPI /users endpoint (auditors, approvers, requesters).
export function AccountPicker({ value, onChange, placeholder = 'Select user…' }: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const { users } = useData();
  const options = useMemo(() => users.filter((u) => u.active || u._id === value).map((u) => ({ value: u._id, label: u.name, sub: [u.email, u.role].filter(Boolean).join(' · ') })), [users, value]);
  return <SearchSelect options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

// Assets from the AssetAPI register (numeric ids).
export function AssetSelect({ value, onChange, placeholder = 'Search asset by code, name or serial…', exclude }: { value?: string | null; onChange: (v: string | null, asset?: ApiAsset) => void; placeholder?: string; exclude?: number[] }) {
  const { data } = useFetch(() => assetApi.list().catch(() => [] as ApiAsset[]), []);
  const { inScope } = useBranch();
  const options = useMemo(
    () =>
      (data || [])
        .filter((a) => inScope(a.locationId) || String(a.assetId) === value)
        .filter((a) => !exclude?.includes(a.assetId))
        .map((a) => ({ value: String(a.assetId), label: `${a.assetCode || `#${a.assetId}`} · ${a.assetName || '(unnamed)'}`, sub: [a.serialNumber && `SN ${a.serialNumber}`, a.brand, a.model, a.status].filter(Boolean).join(' · ') })),
    [data, exclude, inScope, value]
  );
  return <SearchSelect options={options} value={value} onChange={(v) => onChange(v, data?.find((a) => String(a.assetId) === v))} placeholder={data ? placeholder : 'Loading assets…'} />;
}

export function DepartmentPicker({ value, onChange, placeholder = 'Select department…' }: { value?: string | null; onChange: (v: string | null) => void; placeholder?: string }) {
  const { departments } = useData();
  const { deptInScope } = useBranch();
  const options = useMemo(
    () => departments.filter((d) => deptInScope(d.departmentId) || d._id === value).map((d) => ({ value: d._id, label: d.name, sub: d.code || undefined })),
    [departments, deptInScope, value]
  );
  return <SearchSelect options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}