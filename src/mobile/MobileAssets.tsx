import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, History, Pencil, Plus, Printer, QrCode, Radio, ScanLine, ShieldCheck, Tag, Wrench } from 'lucide-react';
import { ApiAsset, assetApi, ASSET_STATUSES, assetTypeApi, ApiAssetType, AssignmentAction, CONDITIONS, CURRENCIES, OWNERSHIP_TYPES } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useData, useNames } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { cachedAssets, extractCode, findAsset, loadAssets } from '../lib/assetLookup';
import { nextAssetCode, nextSerialNumber } from '../lib/assetCodes';
import { date, daysUntil, getCurrency, money, toInputDate } from '../lib/format';
import { useFetch } from '../lib/hooks';
import { printLabels } from '../lib/labels';
import { pathOf } from '../lib/tree';
import { Badge, Empty, Field, Loading, Modal, StatusBadge } from '../components/ui';
import { DepartmentPicker, EmployeePicker, LocationPicker, SearchSelect } from '../components/pickers';
import { AssignmentModal } from '../components/assetModals';
import { Scanner } from '../components/Scanner';
import LifecyclePage from '../pages/LifecyclePage';
import { ScanModal, StaleNote, Top, useMyEmployee } from './kit';
import { useSettings } from './deviceStore';

function Expiry({ d, label }: { d?: string | null; label: string }) {
  const n = daysUntil(d);
  if (n === null) return <span className="faint">—</span>;
  if (n < 0) return <Badge color="red">{label} expired {date(d)}</Badge>;
  if (n <= 30) return <Badge color="amber">{label}: {n} days left</Badge>;
  return <Badge color="green">{label} till {date(d)}</Badge>;
}

// ---------- scan ----------

export function MScan() {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);

  const onScan = async (raw: string) => {
    setBusy(true);
    setMissing(null);
    try {
      const a = await findAsset(raw);
      if (a) navigate(`/m/asset/${a.assetId}`);
      else setMissing(extractCode(raw));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Top title="Scan asset" sub="Point the camera at the QR code or barcode" back />
      <div className="m-body">
        <div className="m-card">
          <Scanner onScan={onScan} paused={busy} />
        </div>
        {missing && (
          <div className="m-card mt-sm">
            <b>No asset found for “{missing}”</b>
            <div className="small muted" style={{ margin: '4px 0 10px' }}>It is not in the register yet. You can register it now.</div>
            <Link className="btn btn-primary btn-block" to={`/m/asset-new?code=${encodeURIComponent(missing)}`}>
              <Plus size={16} /> Register new asset
            </Link>
          </div>
        )}
        <div className="small muted center mt">Handheld RFID / barcode readers in keyboard mode work in the manual entry field.</div>
      </div>
    </>
  );
}

// ---------- asset detail ----------

export function MAsset() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const names = useNames();
  const toast = useToast();
  const { locations, categories } = useData();
  const { branchName } = useBranch();
  const settings = useSettings();
  const [stale, setStale] = useState(false);
  const [sheet, setSheet] = useState<'' | 'status' | 'transfer'>('');
  const [action, setAction] = useState<AssignmentAction | undefined>();
  const [status, setStatus] = useState('');

  const { data: a, loading, reload } = useFetch(async () => {
    try {
      setStale(false);
      return await assetApi.get(id!);
    } catch (err) {
      const hit = cachedAssets().find((x) => String(x.assetId) === id);
      if (hit && !navigator.onLine) {
        setStale(true);
        return hit;
      }
      throw err;
    }
  }, [id]);

  if (loading && !a) return <><Top title="Asset" back /><Loading /></>;
  if (!a) return <><Top title="Asset" back /><div className="m-body"><Empty title="Asset unavailable" message="It may have been deleted, or you are offline." /></div></>;

  const code = a.assetCode || `#${a.assetId}`;
  const cat = (key: string, v: number | null) => (v ? categories.find((c) => c._id === `${key}${v}`)?.name : undefined);
  const where = [branchName(a.locationId), a.locationId ? pathOf(String(a.locationId), locations) : ''].filter(Boolean).join(' › ');

  const saveStatus = async () => {
    try {
      await assetApi.update(a.assetId, { ...a, status, updatedDate: new Date().toISOString() });
      toast.success(`Status set to ${status}`);
      setSheet('');
      reload();
    } catch (err) {
      toast.error(err);
    }
  };
  const label = async () => {
    try {
      await printLabels([{ code, name: a.assetName || '', rfid: a.rfidTag }], 'both');
    } catch (err) {
      toast.error(err);
    }
  };
  const tile = (icon: React.ReactNode, text: string, onClick: () => void) => (
    <button className="m-action" onClick={onClick}>
      {icon}
      {text}
    </button>
  );

  return (
    <>
      <Top title={a.assetName || '(unnamed)'} sub={<span className="mono">{code}</span>} back right={<StatusBadge status={a.status || undefined} />} />
      <div className="m-body">
        <StaleNote stale={stale} />
        <div className="m-actions">
          {can('transfers', 'create') && tile(<ArrowLeftRight size={20} />, 'Transfer / handover', () => (setAction(a.assignedTo ? 'transfer' : 'assign'), setSheet('transfer')))}
          {tile(<AlertTriangle size={20} />, 'Report fault', () => navigate(`/m/maintenance/new?asset=${a.assetId}&type=Fault`))}
          {tile(<Wrench size={20} />, 'Maintenance job', () => navigate(`/m/maintenance/new?asset=${a.assetId}`))}
          {tile(<History size={20} />, 'History', () => navigate(`/m/history?asset=${a.assetId}`))}
          {tile(<Printer size={20} />, 'Print label', label)}
          {can('assets', 'edit') && tile(<Pencil size={20} />, 'Edit', () => navigate(`/m/asset/${a.assetId}/edit`))}
          {can('assets', 'edit') && tile(<Tag size={20} />, 'Update status', () => (setStatus(a.status || ASSET_STATUSES[0]), setSheet('status')))}
          {tile(<ShieldCheck size={20} />, 'Report incident', () => navigate(`/m/incident?asset=${a.assetId}`))}
        </div>

        <div className="m-section-title">Details</div>
        <div className="m-card">
          <Row k="Asset ID" v={<span className="mono">{code}</span>} />
          <Row k="Serial number" v={a.serialNumber || '—'} />
          <Row k="Brand / model" v={[a.brand, a.model].filter(Boolean).join(' · ') || '—'} />
          <Row k="Category" v={[cat('c', a.categoryId), cat('s', a.subCategoryId), cat('t', a.assetTypeId)].filter(Boolean).join(' › ') || '—'} />
          <Row k="Status" v={<StatusBadge status={a.status || undefined} />} />
          <Row k="Condition" v={a.condition || '—'} />
          <Row k="Ownership" v={a.ownershipType || '—'} />
          <Row k="Warranty" v={<Expiry d={a.warrantyEndDate} label="Warranty" />} />
          <Row k="AMC" v={<Expiry d={a.amcEndDate} label="AMC" />} />
          {a.description && <Row k="Description" v={a.description} />}
          {a.remarks && <Row k="Remarks" v={a.remarks} />}
        </div>

        <div className="m-section-title">Location & custody</div>
        <div className="m-card">
          <Row k="Location" v={where || '—'} />
          <Row k="Sublocation" v={names.location(a.subLocationId) || '—'} />
          <Row k="Department" v={names.department(a.departmentId) || '—'} />
          <Row k="Assigned to" v={a.assignedTo ? names.employee(a.assignedTo) : 'In store / unassigned'} />
          <Row k="Custodian ID" v={a.custodianEmployeeId ? <span className="mono">{a.custodianEmployeeId}</span> : '—'} />
        </div>

        <div className="m-section-title">Purchase & tags</div>
        <div className="m-card">
          <Row k="Purchased" v={a.purchaseDate ? date(a.purchaseDate) : '—'} />
          <Row k="Cost" v={a.purchaseCost == null ? '—' : `${a.currency || ''} ${Number(a.purchaseCost).toLocaleString('en-US')}`.trim()} />
          <Row k={<><QrCode size={12} /> QR value</>} v={<span className="mono">{a.qrCode || '—'}</span>} />
          <Row k={<><Radio size={12} /> RFID</>} v={<span className="mono">{a.rfidTag || '—'}</span>} />
        </div>
      </div>

      <AssignmentModal open={sheet === 'transfer'} onClose={() => setSheet('')} asset={a} defaultAction={action} onDone={reload} captureGps={settings.gps} />
      <Modal
        open={sheet === 'status'}
        onClose={() => setSheet('')}
        title="Update status"
        footer={<><button className="btn" onClick={() => setSheet('')}>Cancel</button><button className="btn btn-primary" onClick={saveStatus}>Save</button></>}
      >
        <div className="stack">
          {ASSET_STATUSES.map((s) => (
            <label key={s} className="checkbox">
              <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} /> {s}
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="m-row">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

// ---------- register / update ----------

function CodeField({ value, onChange, placeholder, mono = true }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <input className={`input ${mono ? 'mono' : ''}`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <button type="button" className="btn btn-icon" onClick={() => setOpen(true)} aria-label="Scan">
          <ScanLine size={17} />
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Scan code">
        {open && (
          <Scanner
            onScan={(t) => {
              onChange(extractCode(t));
              setOpen(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}

const DATES = ['purchaseDate', 'warrantyStartDate', 'warrantyEndDate', 'amcStartDate', 'amcEndDate'] as const;

export function MAssetForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { categories, employees } = useData();
  const { activeBranchId } = useBranch();
  const [f, setF] = useState<Partial<ApiAsset>>({ status: 'In Store', condition: 'New', ownershipType: 'Owned', currency: getCurrency() });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ApiAsset>(k: K, v: ApiAsset[K] | null) => setF((p) => ({ ...p, [k]: v }));
  const toId = (v: string | null) => (v ? Number(v) : null);
  const toKey = (v: number | null | undefined) => (v ? String(v) : null);

  useEffect(() => {
    if (isEdit && id) assetApi.get(id).then(setF).catch((e) => toast.error(e)).finally(() => setLoading(false));
    else {
      const code = params.get('code');
      loadAssets()
        .then(({ assets }) => nextSerialNumber(assets))
        .then((sn) => setF((p) => ({ ...p, serialNumber: p.serialNumber || sn, qrCode: p.qrCode || code || '', locationId: p.locationId || (activeBranchId ? Number(activeBranchId) : null) })))
        .catch(() => setF((p) => ({ ...p, qrCode: p.qrCode || code || '' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cats = useMemo(() => categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name })), [categories]);
  const subs = useMemo(() => categories.filter((c) => c.level === 'subcategory' && c.categoryId === f.categoryId).map((c) => ({ value: String(c.id), label: c.name })), [categories, f.categoryId]);
  const { data: apiTypes } = useFetch(() => (f.subCategoryId ? assetTypeApi.bySubCategory(f.subCategoryId).catch(() => null) : Promise.resolve([] as ApiAssetType[])), [f.subCategoryId]);
  const types = useMemo(
    () =>
      apiTypes
        ? apiTypes.filter((t) => t.subCategoryId === f.subCategoryId).map((t) => ({ value: String(t.assetTypeId), label: t.typeName || '(unnamed)' }))
        : categories.filter((c) => c.level === 'type' && c.subCategoryId === f.subCategoryId).map((c) => ({ value: String(c.id), label: c.name })),
    [apiTypes, categories, f.subCategoryId]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.assetName?.trim()) return toast.error('Asset name is required');
    if (!f.categoryId) return toast.error('Category is required');
    setSaving(true);
    try {
      const { assets } = await loadAssets().catch(() => ({ assets: [] as ApiAsset[] }));
      const others = assets.filter((a) => String(a.assetId) !== String(id));
      for (const [label, key] of [['Asset code', 'assetCode'], ['Serial number', 'serialNumber'], ['QR code', 'qrCode'], ['RFID tag', 'rfidTag']] as const) {
        const v = (f[key] || '').trim().toLowerCase();
        const hit = v ? others.find((a) => (a[key] || '').trim().toLowerCase() === v) : undefined;
        if (hit) throw new Error(`${label} "${f[key]}" is already used by ${hit.assetCode || `asset #${hit.assetId}`}`);
      }
      const body: Partial<ApiAsset> = {
        ...f,
        assetName: f.assetName.trim(),
        assetCode: f.assetCode?.trim() || (await nextAssetCode(assets)),
        serialNumber: f.serialNumber?.trim() || (isEdit ? null : await nextSerialNumber(assets)),
        purchaseCost: f.purchaseCost === null || f.purchaseCost === undefined || String(f.purchaseCost) === '' ? null : Number(f.purchaseCost),
        updatedDate: isEdit ? new Date().toISOString() : null,
      };
      for (const k of DATES) body[k] = f[k] ? toInputDate(f[k]) : null;
      if (!body.qrCode) body.qrCode = body.assetCode;
      const saved = isEdit && id ? await assetApi.update(id, body) : await assetApi.create(body);
      toast.success(isEdit ? 'Asset updated' : `Asset ${saved.assetCode} registered`);
      navigate(`/m/asset/${saved.assetId}`, { replace: true });
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <><Top title="Edit asset" back /><Loading /></>;

  return (
    <form onSubmit={submit}>
      <Top title={isEdit ? `Edit ${f.assetCode || 'asset'}` : 'Register asset'} sub={isEdit ? f.assetName : 'Code and serial number are generated if left blank'} back />
      <div className="m-body">
        <div className="m-card stack">
          <Field label="Asset name" required><input className="input" value={f.assetName || ''} onChange={(e) => set('assetName', e.target.value)} placeholder="e.g. Dell Latitude Laptop" /></Field>
          <Field label="Category" required><SearchSelect options={cats} value={toKey(f.categoryId)} onChange={(v) => setF({ ...f, categoryId: toId(v), subCategoryId: null, assetTypeId: null })} placeholder="Select category…" /></Field>
          <Field label="Subcategory"><SearchSelect options={subs} value={toKey(f.subCategoryId)} onChange={(v) => setF({ ...f, subCategoryId: toId(v), assetTypeId: null })} disabled={!f.categoryId} placeholder={f.categoryId ? 'Select subcategory…' : 'Select a category first'} /></Field>
          <Field label="Asset type"><SearchSelect options={types} value={toKey(f.assetTypeId)} onChange={(v) => set('assetTypeId', toId(v))} disabled={!f.subCategoryId} placeholder={f.subCategoryId ? 'Select type…' : 'Select a subcategory first'} /></Field>
          <div className="form-grid">
            <Field label="Brand"><input className="input" value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Model"><input className="input" value={f.model || ''} onChange={(e) => set('model', e.target.value)} /></Field>
            <Field label="Serial number"><CodeField value={f.serialNumber || ''} onChange={(v) => set('serialNumber', v)} mono={false} /></Field>
            <Field label="Asset code" hint={isEdit ? undefined : 'Blank = auto'}><input className="input mono" value={f.assetCode || ''} onChange={(e) => set('assetCode', e.target.value)} placeholder="AST-000123" /></Field>
          </div>
          <Field label="Description"><textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Remarks"><textarea className="textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} /></Field>
        </div>

        <div className="m-section-title">Location & custody</div>
        <div className="m-card stack">
          <Field label="Location">
            <LocationPicker
              value={toKey(f.locationId)}
              onChange={(v) => setF({ ...f, locationId: toId(v), subLocationId: null })}
              types={['company', 'site', 'building', 'floor', 'area', 'location']}
            />
          </Field>
          <Field label="Sublocation">
            <LocationPicker
              value={toKey(f.subLocationId)}
              onChange={(v) => set('subLocationId', toId(v))}
              types={['sublocation', 'room']}
              underId={toKey(f.locationId)}
              placeholder={f.locationId ? 'Select sublocation…' : 'Select a location first'}
            />
          </Field>
          <Field label="Department"><DepartmentPicker value={toKey(f.departmentId)} onChange={(v) => set('departmentId', toId(v))} /></Field>
          {!isEdit && (
            <Field label="Assigned to">
              <EmployeePicker
                value={toKey(f.assignedTo)}
                onChange={(v) => {
                  const emp = employees.find((e) => e._id === v);
                  setF({ ...f, assignedTo: toId(v), custodianEmployeeId: emp?.empCode || f.custodianEmployeeId || '' });
                }}
                placeholder="Unassigned"
              />
            </Field>
          )}
          <Field label="Custodian employee ID"><input className="input mono" value={f.custodianEmployeeId || ''} onChange={(e) => set('custodianEmployeeId', e.target.value)} placeholder="e.g. EMP-00123" /></Field>
          <Field label="Status">
            <select className="select" value={f.status || ''} onChange={(e) => set('status', e.target.value)}>
              {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select className="select" value={f.condition || ''} onChange={(e) => set('condition', e.target.value)}>
              <option value="">—</option>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Ownership type">
            <select className="select" value={f.ownershipType || ''} onChange={(e) => set('ownershipType', e.target.value)}>
              <option value="">—</option>
              {OWNERSHIP_TYPES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <div className="m-section-title">Purchase, warranty & AMC</div>
        <div className="m-card">
          <div className="form-grid">
            <Field label="Purchase date"><input type="date" className="input" value={toInputDate(f.purchaseDate)} onChange={(e) => set('purchaseDate', e.target.value)} /></Field>
            <Field label="Purchase cost"><input type="number" min={0} step="0.01" className="input" value={f.purchaseCost ?? ''} onChange={(e) => set('purchaseCost', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="Currency">
              <select className="select" value={f.currency || getCurrency()} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Warranty start"><input type="date" className="input" value={toInputDate(f.warrantyStartDate)} onChange={(e) => set('warrantyStartDate', e.target.value)} /></Field>
            <Field label="Warranty end"><input type="date" className="input" value={toInputDate(f.warrantyEndDate)} onChange={(e) => set('warrantyEndDate', e.target.value)} /></Field>
            <Field label="AMC start"><input type="date" className="input" value={toInputDate(f.amcStartDate)} onChange={(e) => set('amcStartDate', e.target.value)} /></Field>
            <Field label="AMC end"><input type="date" className="input" value={toInputDate(f.amcEndDate)} onChange={(e) => set('amcEndDate', e.target.value)} /></Field>
          </div>
        </div>

        <div className="m-section-title">Tags</div>
        <div className="m-card stack">
          <Field label="QR code value" hint="Defaults to the asset code"><CodeField value={f.qrCode || ''} onChange={(v) => set('qrCode', v)} /></Field>
          <Field label="RFID tag (EPC)"><CodeField value={f.rfidTag || ''} onChange={(v) => set('rfidTag', v)} /></Field>
        </div>

        <button className="btn btn-primary btn-lg btn-block mt" disabled={saving}>{isEdit ? 'Save changes' : 'Register asset'}</button>
      </div>
    </form>
  );
}

// ---------- my assigned assets ----------

export function MMine() {
  const { employee, choose } = useMyEmployee();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const { data, loading } = useFetch(() => loadAssets(), []);
  const mine = useMemo(() => {
    const list = (data?.assets || []).filter((a) => employee && a.assignedTo === employee.employeeId);
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter((a) => [a.assetCode, a.assetName, a.serialNumber, a.brand, a.model].some((x) => x?.toLowerCase().includes(s)));
  }, [data, employee, q]);

  return (
    <>
      <Top title="My assigned assets" sub={employee ? `${employee.name}${employee.empCode ? ` · ${employee.empCode}` : ''}` : 'Not linked to an employee'} back />
      <div className="m-body">
        <StaleNote stale={Boolean(data?.stale)} />
        {!employee || pick ? (
          <div className="m-card stack">
            <div className="small">
              {employee ? 'Choose a different employee record:' : "We couldn't match your login to an employee record (by email, employee code or name). Pick yourself to see your assets:"}
            </div>
            <EmployeePicker value={employee?._id || null} onChange={(v) => (choose(v), setPick(false))} />
          </div>
        ) : (
          <>
            <input className="input" placeholder="Search my assets…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="small muted" style={{ margin: '8px 4px' }}>
              {mine.length} asset{mine.length === 1 ? '' : 's'} ·{' '}
              <button className="link-btn" onClick={() => setPick(true)}>Not you?</button>
            </div>
          </>
        )}
        {employee && !pick && (loading && !data ? <Loading /> : mine.length === 0 ? (
          <Empty title="No assets assigned" message="Assets assigned to you will appear here." />
        ) : (
          mine.map((a) => (
            <Link key={a.assetId} to={`/m/asset/${a.assetId}`} className="m-card row" style={{ gap: 12, color: 'inherit', textDecoration: 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cell-main ellipsis">{a.assetName || '(unnamed)'}</div>
                <div className="cell-sub"><span className="mono">{a.assetCode}</span>{a.serialNumber && <> · SN {a.serialNumber}</>}</div>
                <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
                  <StatusBadge status={a.status || undefined} />
                  <Expiry d={a.warrantyEndDate} label="Warranty" />
                </div>
              </div>
            </Link>
          ))
        ))}
      </div>
    </>
  );
}

// ---------- history ----------

export function MHistory() {
  const [, setParams] = useSearchParams();
  const [scan, setScan] = useState(false);
  return (
    <>
      <Top title="Asset history" sub="Transfers, maintenance, audits, depreciation and disposal" back right={<button className="m-back" onClick={() => setScan(true)} aria-label="Scan"><ScanLine size={18} /></button>} />
      <div className="m-body">
        <LifecyclePage />
      </div>
      <ScanModal open={scan} onClose={() => setScan(false)} onAsset={(a) => setParams({ asset: String(a.assetId) }, { replace: true })} />
    </>
  );
}
