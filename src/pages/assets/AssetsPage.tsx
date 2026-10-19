import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Filter, ImageIcon, Plus, X } from 'lucide-react';
import { ApiAsset, ApiAssetSummary, assetApi, ASSET_STATUSES } from '../../api/assetApi';
import { useDebounced, useFetch } from '../../lib/hooks';
import { date, daysUntil, downloadCsv, money } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useData, useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { descendantIds } from '../../lib/tree';
import { Badge, Empty, ErrorState, Loading, PageHeader, Pager, SearchInput, StatusBadge } from '../../components/ui';
import { LocationPicker, SearchSelect } from '../../components/pickers';

const PAGE = 25;

type SortKey = 'assetCode' | 'assetName' | 'status' | 'purchaseCost' | 'warrantyEndDate' | 'createdDate';

export default function AssetsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { categories, employees, locations } = useData();
  const names = useNames();
  const { inScope, branchName } = useBranch();
  const toast = useToast();
  const [q, setQ] = useState(params.get('q') || '');
  const dq = useDebounced(q, 200);
  const [showFilters, setShowFilters] = useState(['category', 'subcategory', 'assetType', 'assignedTo', 'location'].some((k) => params.get(k)));

  const filters = {
    status: params.get('status') || '',
    category: params.get('category') || '',
    subcategory: params.get('subcategory') || '',
    assetType: params.get('assetType') || '',
    location: params.get('location') || '',
    assignedTo: params.get('assignedTo') || '',
    warrantyExpiring: params.get('warrantyExpiring') || '',
    sort: params.get('sort') || '-createdDate',
    page: Number(params.get('page') || 1),
  };
  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    if (k === 'category') next.delete('subcategory');
    if (k === 'category' || k === 'subcategory') next.delete('assetType');
    setParams(next, { replace: true });
  };

  const { data, loading, error, reload } = useFetch(() => assetApi.list(), []);
  const { data: summaries } = useFetch(() => assetApi.listFull().catch(() => [] as ApiAssetSummary[]), []);
  const summaryById = useMemo(() => new Map((summaries || []).map((s) => [s.assetId, s])), [summaries]);

  const catName = useMemo(() => new Map(categories.map((c) => [c._id, c.name])), [categories]);
  const categoryName = (a: ApiAsset) => (a.categoryId && catName.get(`c${a.categoryId}`)) || summaryById.get(a.assetId)?.category || undefined;
  const subCategoryName = (a: ApiAsset) =>
    [a.subCategoryId && catName.get(`s${a.subCategoryId}`), a.assetTypeId && catName.get(`t${a.assetTypeId}`)].filter(Boolean).join(' › ') || summaryById.get(a.assetId)?.subCategory || '';

  const filtered = useMemo(() => {
    let list = (data || []).filter((a) => inScope(a.locationId));
    const statuses = filters.status ? filters.status.split(',') : [];
    if (statuses.length) list = list.filter((a) => statuses.includes(a.status || ''));
    if (filters.category) list = list.filter((a) => String(a.categoryId) === filters.category);
    if (filters.subcategory) list = list.filter((a) => String(a.subCategoryId) === filters.subcategory);
    if (filters.assetType) list = list.filter((a) => String(a.assetTypeId) === filters.assetType);
    if (filters.location) {
      const ids = new Set(descendantIds(filters.location, locations));
      list = list.filter((a) => a.locationId && ids.has(String(a.locationId)));
    }
    if (filters.assignedTo) list = list.filter((a) => String(a.assignedTo) === filters.assignedTo);
    if (filters.warrantyExpiring) {
      const within = Number(filters.warrantyExpiring);
      list = list.filter((a) => {
        const d = daysUntil(a.warrantyEndDate);
        return d !== null && d >= 0 && d <= within;
      });
    }
    if (dq) {
      const s = dq.toLowerCase();
      list = list.filter((a) => [a.assetCode, a.assetName, a.serialNumber, a.brand, a.model, a.rfidTag].some((x) => x?.toLowerCase().includes(s)));
    }
    const desc = filters.sort.startsWith('-');
    const key = filters.sort.replace(/^-/, '') as SortKey;
    return [...list].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return desc ? -cmp : cmp;
    });
  }, [data, dq, locations, inScope, filters.status, filters.category, filters.subcategory, filters.assetType, filters.location, filters.assignedTo, filters.warrantyExpiring, filters.sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(filters.page, pages);
  const items = filtered.slice((page - 1) * PAGE, page * PAGE);
  const activeFilters = ['status', 'category', 'subcategory', 'assetType', 'location', 'assignedTo', 'warrantyExpiring'].filter((k) => params.get(k)).length;

  const sortBy = (field: SortKey) => setFilter('sort', filters.sort === field ? `-${field}` : field);
  const sortIcon = (field: SortKey) => (filters.sort === field ? ' ↑' : filters.sort === `-${field}` ? ' ↓' : '');

  const categoryOptions = categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name }));
  const subCategoryOptions = categories
    .filter((c) => c.level === 'subcategory' && (!filters.category || String(c.categoryId) === filters.category))
    .map((c) => ({ value: String(c.id), label: c.name, sub: catName.get(c.parent || '') }));
  const employeeOptions = employees.map((e) => ({ value: e._id, label: e.name, sub: [e.empCode, e.designation].filter(Boolean).join(' · ') }));

  const exportCsv = () =>
    downloadCsv(
      'asset-register.csv',
      [
        { key: 'assetCode', label: 'AssetCode' },
        { key: 'assetType', label: 'AssetType' },
        { key: 'category', label: 'Category' },
        { key: 'assetName', label: 'AssetName' },
        { key: 'brand', label: 'Brand' },
        { key: 'model', label: 'Model' },
        { key: 'serialNumber', label: 'SerialNumber' },
        { key: 'department', label: 'Department' },
        { key: 'assignedTo', label: 'AssignedTo' },
        { key: 'location', label: 'Location' },
        { key: 'subLocation', label: 'SubLocation' },
        { key: 'purchaseDate', label: 'PurchaseDate' },
        { key: 'purchaseCost', label: 'PurchaseCost' },
        { key: 'currency', label: 'Currency' },
        { key: 'status', label: 'Status' },
        { key: 'condition', label: 'Condition' },
        { key: 'ownershipType', label: 'OwnershipType' },
        { key: 'warrantyStartDate', label: 'WarrantyStartDate' },
        { key: 'warrantyEndDate', label: 'WarrantyEndDate' },
        { key: 'custodianEmployeeId', label: 'CustodianEmployeeID' },
        { key: 'description', label: 'Description' },
        { key: 'remarks', label: 'Remarks' },
      ],
      filtered.map((a) => ({
        ...a,
        assetType: a.assetTypeId ? catName.get(`t${a.assetTypeId}`) : '',
        category: categoryName(a),
        location: names.location(a.locationId),
        subLocation: names.location(a.subLocationId),
        department: names.department(a.departmentId),
        assignedTo: names.employee(a.assignedTo),
        purchaseDate: a.purchaseDate?.slice(0, 10),
        warrantyStartDate: a.warrantyStartDate?.slice(0, 10),
        warrantyEndDate: a.warrantyEndDate?.slice(0, 10),
      }))
    );

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Asset Register"
        subtitle={data ? `${filtered.length.toLocaleString()} of ${data.length.toLocaleString()} assets` : 'Master list of all company assets'}
        actions={
          <>
            {can('assets', 'export') && (
              <button className="btn" onClick={() => (filtered.length ? exportCsv() : toast.error('Nothing to export'))}>
                <Download size={16} /> Export
              </button>
            )}
            {can('assets', 'create') && (
              <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>
                <Plus size={16} /> Add asset
              </button>
            )}
          </>
        }
      />

      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search code, name, serial, brand, model, RFID…" />
          <select className="select" style={{ width: 170 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {ASSET_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className={`btn ${showFilters ? 'btn-primary' : ''}`} onClick={() => setShowFilters((s) => !s)}>
            <Filter size={15} /> Filters {activeFilters > 0 && <Badge color="indigo" plain>{activeFilters}</Badge>}
          </button>
          {activeFilters > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams(q ? { q } : {}), { replace: true })}>
              <X size={14} /> Clear
            </button>
          )}
        </div>
        {showFilters && (
          <div className="toolbar" style={{ background: 'var(--surface-2)' }}>
            <div style={{ width: 220 }}>
              <SearchSelect options={categoryOptions} value={filters.category} onChange={(v) => setFilter('category', v)} placeholder="Any category" />
            </div>
            <div style={{ width: 220 }}>
              <SearchSelect options={subCategoryOptions} value={filters.subcategory} onChange={(v) => setFilter('subcategory', v)} placeholder="Any subcategory" />
            </div>
            <div style={{ width: 220 }}>
              <LocationPicker value={filters.location || null} onChange={(v) => setFilter('location', v)} placeholder="Any location" />
            </div>
            <div style={{ width: 220 }}>
              <SearchSelect options={employeeOptions} value={filters.assignedTo} onChange={(v) => setFilter('assignedTo', v)} placeholder="Any custodian" />
            </div>
            <select className="select" style={{ width: 190 }} value={filters.warrantyExpiring} onChange={(e) => setFilter('warrantyExpiring', e.target.value)}>
              <option value="">Warranty: any</option>
              <option value="30">Expiring in 30 days</option>
              <option value="90">Expiring in 90 days</option>
            </select>
          </div>
        )}

        {loading && !data ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty
            title={data?.length ? 'No assets found' : 'No assets yet'}
            message={data?.length ? 'Try adjusting the search or filters.' : 'Register your first asset to get started.'}
            action={
              !data?.length &&
              can('assets', 'create') && (
                <button className="btn btn-primary" onClick={() => navigate('/assets/new')}>
                  <Plus size={16} /> Add asset
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => sortBy('assetName')}>Asset{sortIcon('assetName')}</th>
                    <th>Category</th>
                    <th>Brand / model</th>
                    <th>Assigned to</th>
                    <th className="sortable" onClick={() => sortBy('status')}>Status{sortIcon('status')}</th>
                    <th className="sortable num" onClick={() => sortBy('purchaseCost')}>Cost{sortIcon('purchaseCost')}</th>
                    <th className="sortable" onClick={() => sortBy('warrantyEndDate')}>Warranty{sortIcon('warrantyEndDate')}</th>
                  </tr>
                </thead>
                <tbody style={{ opacity: loading ? 0.6 : 1 }}>
                  {items.map((a) => {
                    const wd = daysUntil(a.warrantyEndDate);
                    return (
                      <tr key={a.assetId} className="clickable" onClick={() => navigate(`/assets/${a.assetId}`)}>
                        <td>
                          <div className="asset-cell">
                            <div className="thumb">
                              <ImageIcon size={16} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div className="cell-main ellipsis">{a.assetName || '(unnamed)'}</div>
                              <div className="cell-sub">
                                <span className="mono">{a.assetCode || `#${a.assetId}`}</span>
                                {a.serialNumber && <> · SN {a.serialNumber}</>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="small bold">{categoryName(a) || '—'}</div>
                          <div className="cell-sub">{subCategoryName(a)}</div>
                        </td>
                        <td>
                          <div className="small bold">{a.brand || '—'}</div>
                          <div className="cell-sub">{a.model}</div>
                        </td>
                        <td>
                          {a.assignedTo ? <span className="small bold">{names.employee(a.assignedTo)}</span> : <span className="muted small">Unassigned</span>}
                          {a.locationId && <div className="cell-sub">{[branchName(a.locationId), names.location(a.locationId)].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' › ')}</div>}
                        </td>
                        <td>
                          <StatusBadge status={a.status || undefined} />
                        </td>
                        <td className="num small bold">{money(a.purchaseCost)}</td>
                        <td>
                          {a.warrantyEndDate ? (
                            <span className={`small ${wd !== null && wd < 0 ? 'faint' : wd !== null && wd <= 30 ? 'neg bold' : ''}`}>{date(a.warrantyEndDate)}</span>
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} pages={pages} total={filtered.length} pageSize={PAGE} onPage={(p) => setFilter('page', String(p))} />
          </>
        )}
      </div>
    </>
  );
}
