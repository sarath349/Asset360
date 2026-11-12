import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Boxes, Calculator, Calendar, CheckCircle2, FileText, ImagePlus, MapPin, Navigation, Plus, Tag, Trash2, Upload } from 'lucide-react';
import {
  ApiAsset,
  ApiAssetDocument,
  ApiAssetType,
  ApiDepreciation,
  assetApi,
  assetTypeApi,
  ASSET_STATUSES,
  CONDITIONS,
  CURRENCIES,
  DEPRECIATION_METHODS,
  depreciationApi,
  depreciationMethodLabel,
  OWNERSHIP_TYPES,
} from '../../api/assetApi';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { date, getCurrency, money, toInputDate } from '../../lib/format';
import { useFetch } from '../../lib/hooks';
import { ErrorState, Field, Loading, PageHeader } from '../../components/ui';
import { DepartmentPicker, EmployeePicker, LocationPicker, SearchSelect } from '../../components/pickers';
import { CategoryLevel, CategoryQuickAdd } from '../../components/CategoryQuickAdd';
import { nextAssetCode, nextSerialNumber } from '../../lib/assetCodes';

type TabKey = 'main' | 'product' | 'finance' | 'media' | 'geo';

const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: 'main', label: 'Main', desc: 'Identity, status, assignment and location' },
  { key: 'product', label: 'Product Details', desc: 'Make, model, specifications and warranty' },
  { key: 'finance', label: 'Finance Accounting', desc: 'Purchase, depreciation, AMC and insurance' },
  { key: 'media', label: 'Images & Documents', desc: 'Photos, invoices, manuals and certificates' },
  { key: 'geo', label: 'Geo Location', desc: 'Where the asset is installed' },
];

const EMPTY: Partial<ApiAsset> = {
  assetCode: '',
  assetName: '',
  description: '',
  remarks: '',
  status: 'In Store',
  condition: 'New',
  ownershipType: 'Owned',
  currency: getCurrency(),
  purchaseCost: null,
  quantity: 1,
  custodianEmployeeId: '',
  vendorName: '',
  images: [],
  documents: [],
};

const DATE_FIELDS = [
  'purchaseDate',
  'warrantyStartDate',
  'warrantyEndDate',
  'amcStartDate',
  'amcEndDate',
  'insuranceStartDate',
  'insuranceEndDate',
  'placedInServiceDate',
] as const;

type DepSetup = { enabled: boolean; method: string; usefulLifeMonths: number | null; residualValue: number | null; startDate: string };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const monthsBetween = (from?: string | null) => {
  if (!from) return 0;
  const a = new Date(from);
  if (Number.isNaN(a.getTime())) return 0;
  const b = new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0));
};

// Mirrors server/src/helpers.js calcDepreciation so the Finance tab can preview before the schedule exists.
function previewDepreciation(cost: number, salvageIn: number, life: number, method: string, start: string) {
  const salvage = Math.min(Math.max(0, salvageIn || 0), cost);
  if (!(cost > 0) || !(life > 0)) return { accumulated: 0, book: cost, elapsed: 0 };
  const elapsed = Math.min(life, monthsBetween(start));
  let book = cost;
  let accumulated = 0;
  if (/declin/i.test(method)) {
    const rate = life / 12 > 0 ? 2 / (life / 12) : 0;
    for (let m = 0; m < elapsed; m++) {
      const dep = Math.min(book * (rate / 12), Math.max(0, book - salvage));
      book -= dep;
      accumulated += dep;
    }
  } else {
    const monthly = (cost - salvage) / life;
    accumulated = Math.min(monthly * elapsed, cost - salvage);
    book = cost - accumulated;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { accumulated: r2(accumulated), book: r2(Math.max(salvage, book)), elapsed };
}

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

function validate(f: Partial<ApiAsset>): Record<TabKey, string[]> {
  const main: string[] = [];
  if (isBlank(f.assetName)) main.push('Asset name');
  if (!f.categoryId) main.push('Category');
  if (isBlank(f.serialNumber)) main.push('Serial number');
  if (!(Number(f.quantity) >= 1)) main.push('Quantity');
  if (isBlank(f.status)) main.push('Asset status');
  if (isBlank(f.condition)) main.push('Asset condition');
  if (!f.locationId) main.push('Site / location');

  const product: string[] = [];
  if (isBlank(f.brand)) product.push('Brand');
  if (isBlank(f.model)) product.push('Model');
  if (f.warrantyStartDate && f.warrantyEndDate && new Date(f.warrantyEndDate) < new Date(f.warrantyStartDate)) product.push('Warranty end must be after start');

  const finance: string[] = [];
  if (isBlank(f.purchaseDate)) finance.push('Purchase date');
  if (f.purchaseCost === null || f.purchaseCost === undefined || String(f.purchaseCost) === '' || Number(f.purchaseCost) < 0) finance.push('Purchase price');
  if (isBlank(f.currency)) finance.push('Currency');
  if (f.amcStartDate && f.amcEndDate && new Date(f.amcEndDate) < new Date(f.amcStartDate)) finance.push('AMC end must be after start');
  if (f.insuranceStartDate && f.insuranceEndDate && new Date(f.insuranceEndDate) < new Date(f.insuranceStartDate)) finance.push('Insurance end must be after start');

  const geo: string[] = [];
  const hasLat = !isBlank(f.latitude);
  const hasLng = !isBlank(f.longitude);
  if (hasLat !== hasLng) geo.push('Both latitude and longitude');
  if (hasLat && (Number(f.latitude) < -90 || Number(f.latitude) > 90)) geo.push('Latitude between -90 and 90');
  if (hasLng && (Number(f.longitude) < -180 || Number(f.longitude) > 180)) geo.push('Longitude between -180 and 180');

  return { main, product, finance, media: [], geo };
}

function SectionTitle({ icon, title, desc, tone = 'indigo' }: { icon: React.ReactNode; title: string; desc?: string; tone?: string }) {
  return (
    <div className="form-section-title" style={{ marginBottom: 14 }}>
      <div className={`kpi-icon tone-${tone}`}>{icon}</div>
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Field label={label}>
      <div className="input" style={{ background: 'var(--slate-50)', display: 'flex', alignItems: 'center', color: 'var(--text)' }}>
        {value ?? '—'}
      </div>
    </Field>
  );
}

export default function AssetFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { categories, employees, locations } = useData();
  const { activeBranchId } = useBranch();
  const [f, setF] = useState<Partial<ApiAsset>>(EMPTY);
  const [tab, setTab] = useState<TabKey>('main');
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [quickAdd, setQuickAdd] = useState<CategoryLevel | null>(null);
  const [dep, setDep] = useState<DepSetup>({ enabled: false, method: DEPRECIATION_METHODS[0], usefulLifeMonths: 60, residualValue: 0, startDate: '' });
  const [existingDep, setExistingDep] = useState<ApiDepreciation | null>(null);
  const [recalc, setRecalc] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    Promise.all([assetApi.get(id), depreciationApi.byAsset(id).catch(() => null)])
      .then(([a, d]) => {
        setF({ ...a, images: a.images || [], documents: a.documents || [] });
        const rec = Array.isArray(d) ? d[0] : d;
        if (rec?.depreciationId) setExistingDep(rec as ApiDepreciation);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    nextSerialNumber().then((sn) => {
      if (!cancelled && sn) setF((prev) => (prev.serialNumber ? prev : { ...prev, serialNumber: sn }));
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit && activeBranchId) {
      const locId = Number(activeBranchId);
      if (Number.isFinite(locId) && locId > 0) {
        setF((p) => (p.locationId ? p : { ...p, locationId: locId }));
      }
    }
  }, [isEdit, activeBranchId]);

  const categoryOptions = useMemo(() => categories.filter((c) => c.level === 'category').map((c) => ({ value: String(c.id), label: c.name })), [categories]);
  const subCategoryOptions = useMemo(
    () => categories.filter((c) => c.level === 'subcategory' && c.categoryId === f.categoryId).map((c) => ({ value: String(c.id), label: c.name })),
    [categories, f.categoryId]
  );
  const { data: subCategoryTypes } = useFetch(
    () => (f.subCategoryId ? assetTypeApi.bySubCategory(f.subCategoryId).catch(() => null) : Promise.resolve([] as ApiAssetType[])),
    [f.subCategoryId, categories]
  );
  const typeOptions = useMemo(() => {
    if (subCategoryTypes)
      return subCategoryTypes.filter((t) => t.subCategoryId === f.subCategoryId).map((t) => ({ value: String(t.assetTypeId), label: t.typeName || '(unnamed)' }));
    return categories.filter((c) => c.level === 'type' && c.subCategoryId === f.subCategoryId).map((c) => ({ value: String(c.id), label: c.name }));
  }, [subCategoryTypes, categories, f.subCategoryId]);

  const set = <K extends keyof ApiAsset>(k: K, v: ApiAsset[K] | null) => setF((prev) => ({ ...prev, [k]: v }));
  const toId = (v: string | null) => (v ? Number(v) : null);
  const toKey = (v: number | null | undefined) => (v ? String(v) : null);

  const errors = useMemo(() => validate(f), [f]);
  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const tabState = (k: TabKey) => (errors[k].length ? (attempted ? 'error' : 'todo') : 'ok');

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const next = await Promise.all([...files].slice(0, 8 - (f.images?.length || 0)).map(readFile));
      setF((p) => ({ ...p, images: [...(p.images || []), ...next].slice(0, 8) }));
    } catch (err) {
      toast.error(err);
    }
  };

  const addDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const docs: ApiAssetDocument[] = [];
      for (const file of [...files].slice(0, 10 - (f.documents?.length || 0))) {
        docs.push({ name: file.name, type: file.type || null, dataUrl: await readFile(file), uploadedDate: new Date().toISOString() });
      }
      setF((p) => ({ ...p, documents: [...(p.documents || []), ...docs].slice(0, 10) }));
    } catch (err) {
      toast.error(err);
    }
  };

  const captureGeo = () => {
    if (!navigator.geolocation) return toast.error('Geolocation is not available in this browser');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({ ...p, latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }));
        setLocating(false);
        toast.success('Location captured');
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || 'Could not get location');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const recalculate = async () => {
    if (!existingDep) return;
    setRecalc(true);
    try {
      const updated = await depreciationApi.calculate(existingDep.depreciationId);
      setExistingDep({ ...existingDep, ...updated });
      toast.success('Depreciation recalculated');
    } catch (err) {
      toast.error(err);
    } finally {
      setRecalc(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const firstBad = TABS.find((t) => errors[t.key].length);
    if (firstBad) {
      setTab(firstBad.key);
      const msg = errors[firstBad.key].join(', ');
      toast.error(
        firstBad.key === 'main' && errors.main.includes('Site / location')
          ? 'Site / location is required — pick the branch/site in the Location & tags section (GPS on the Geo tab is separate).'
          : `${firstBad.label}: ${msg}`
      );
      return;
    }
    if (dep.enabled && !existingDep && !(Number(dep.usefulLifeMonths) > 0)) {
      setTab('finance');
      toast.error('Finance Accounting: useful life (months) is required for depreciation');
      return;
    }
    setSaving(true);
    try {
      const others = (await assetApi.list().catch(() => [] as ApiAsset[])).filter((a) => String(a.assetId) !== String(id));
      const clash = (label: string, key: 'assetCode' | 'serialNumber' | 'qrCode' | 'rfidTag') => {
        const v = (f[key] || '').trim().toLowerCase();
        const hit = v ? others.find((a) => (a[key] || '').trim().toLowerCase() === v) : undefined;
        return hit ? `${label} "${f[key]}" is already used by ${hit.assetCode || `asset #${hit.assetId}`}` : null;
      };
      const dup = clash('Asset code', 'assetCode') || clash('Serial number', 'serialNumber') || clash('QR code', 'qrCode') || clash('RFID tag', 'rfidTag');
      if (dup) {
        setTab('main');
        toast.error(dup);
        setSaving(false);
        return;
      }
      const body: Partial<ApiAsset> = {
        ...f,
        assetName: f.assetName?.trim(),
        assetCode: f.assetCode?.trim() || (await nextAssetCode()),
        serialNumber: f.serialNumber?.trim() || (isEdit ? null : (await nextSerialNumber()) || null),
        purchaseCost: Number(f.purchaseCost),
        quantity: Number(f.quantity) || 1,
        yearOfManufacture: isBlank(f.yearOfManufacture) ? null : Number(f.yearOfManufacture),
        latitude: isBlank(f.latitude) ? null : Number(f.latitude),
        longitude: isBlank(f.longitude) ? null : Number(f.longitude),
        images: f.images || [],
        documents: f.documents || [],
        updatedDate: isEdit ? new Date().toISOString() : null,
      };
      for (const k of DATE_FIELDS) body[k] = f[k] ? toInputDate(f[k]) : null;
      if (!body.qrCode) body.qrCode = body.assetCode;
      const saved = isEdit && id ? await assetApi.update(id, body) : await assetApi.create(body);

      if (dep.enabled && !existingDep && Number(body.purchaseCost) > 0) {
        try {
          const created = await depreciationApi.create({
            assetId: saved.assetId,
            purchaseValue: Number(body.purchaseCost),
            depreciationMethod: dep.method,
            usefulLifeMonths: Number(dep.usefulLifeMonths),
            residualValue: Number(dep.residualValue || 0),
            depreciationStartDate: dep.startDate || body.purchaseDate || new Date().toISOString(),
            currentBookValue: Number(body.purchaseCost),
            status: 'Active',
            createdBy: user?.userId ?? null,
          });
          if (created?.depreciationId) await depreciationApi.calculate(created.depreciationId).catch(() => undefined);
        } catch (err) {
          toast.error(`Asset saved, but the depreciation schedule failed: ${(err as Error).message}`);
        }
      }

      toast.success(isEdit ? 'Asset updated' : `Asset ${saved.assetCode} created`);
      navigate(`/assets/${saved.assetId}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState message={loadError} />;

  const images = f.images || [];
  const documents = f.documents || [];
  const hasCoords = !isBlank(f.latitude) && !isBlank(f.longitude) && !Number.isNaN(Number(f.latitude)) && !Number.isNaN(Number(f.longitude));
  const mapUrl = hasCoords ? `https://www.google.com/maps?q=${f.latitude},${f.longitude}` : null;
  const embedUrl = hasCoords ? `https://maps.google.com/maps?q=${f.latitude},${f.longitude}&z=16&output=embed` : null;

  const cost = Number(f.purchaseCost) || 0;
  const depPreview = previewDepreciation(cost, Number(dep.residualValue) || 0, Number(dep.usefulLifeMonths) || 0, dep.method, dep.startDate || toInputDate(f.purchaseDate));
  const cur = f.currency || getCurrency();
  const fmt = (n: number | null | undefined) => (n == null ? '—' : `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  const req = (k: TabKey, label: string) => attempted && errors[k].includes(label);
  const mark = (k: TabKey, label: string) => (req(k, label) ? 'input-error' : '');

  const footerNav = (
    <div className="row-between" style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <button type="button" className="btn" disabled={tabIndex === 0} onClick={() => setTab(TABS[tabIndex - 1].key)}>
        <ArrowLeft size={15} /> Back
      </button>
      <div className="small muted">
        Step {tabIndex + 1} of {TABS.length} · {TABS[tabIndex].desc}
      </div>
      {tabIndex < TABS.length - 1 ? (
        <button type="button" className="btn btn-primary" onClick={() => setTab(TABS[tabIndex + 1].key)}>
          Next <ArrowRight size={15} />
        </button>
      ) : (
        <button className="btn btn-primary" disabled={saving}>
          {isEdit ? 'Save changes' : 'Create asset'}
        </button>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        crumbs={[{ label: 'Assets', to: '/assets' }, { label: isEdit ? f.assetCode || `#${id}` : 'New asset' }]}
        title={isEdit ? `Edit ${f.assetCode || f.assetName}` : 'Register new asset'}
        subtitle={isEdit ? f.assetName : 'Fill in each tab. Fields marked * are required before the asset can be created.'}
        actions={
          <>
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={saving}>
              {isEdit ? 'Save changes' : 'Create asset'}
            </button>
          </>
        }
      />

      <div className="card">
        <div className="tabs">
          {TABS.map((t, i) => {
            const s = tabState(t.key);
            return (
              <button key={t.key} type="button" className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} title={errors[t.key].join(', ') || 'Complete'}>
                <span className={`asset-step ${s}`}>{s === 'ok' ? <CheckCircle2 size={12} /> : s === 'error' ? <AlertCircle size={12} /> : i + 1}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '20px 22px 24px' }}>
          {attempted && errors[tab].length > 0 && (
            <div className="alert alert-danger mb">
              <b>Required:</b> {errors[tab].join(', ')}
            </div>
          )}

          {tab === 'main' && (
            <div className="grid grid-3" style={{ alignItems: 'start' }}>
              <div className="stack">
                <SectionTitle icon={<Boxes size={17} />} title="Asset" desc="What is being registered" />
                <Field label="Serial number" required hint={isEdit ? undefined : 'Auto-filled; you can overwrite it'}>
                  <input className={`input ${mark('main', 'Serial number')}`} value={f.serialNumber || ''} onChange={(e) => set('serialNumber', e.target.value)} placeholder="e.g. 200000000003" />
                </Field>
                <Field
                  label="Asset category"
                  required
                  hint={
                    <button type="button" className="link-btn" onClick={() => setQuickAdd('category')}>
                      <Plus size={12} /> New category
                    </button>
                  }
                >
                  <SearchSelect
                    options={categoryOptions}
                    value={f.categoryId ? String(f.categoryId) : null}
                    onChange={(v) => setF({ ...f, categoryId: toId(v), subCategoryId: null, assetTypeId: null })}
                    placeholder={categoryOptions.length ? 'Select category…' : 'No categories yet — add one'}
                  />
                </Field>
                <Field
                  label="Asset sub category"
                  hint={
                    f.categoryId ? (
                      <button type="button" className="link-btn" onClick={() => setQuickAdd('subcategory')}>
                        <Plus size={12} /> New subcategory
                      </button>
                    ) : undefined
                  }
                >
                  <SearchSelect
                    options={subCategoryOptions}
                    value={f.subCategoryId ? String(f.subCategoryId) : null}
                    onChange={(v) => setF({ ...f, subCategoryId: toId(v), assetTypeId: null })}
                    placeholder={!f.categoryId ? 'Select a category first' : subCategoryOptions.length ? 'Select subcategory…' : 'No subcategories yet'}
                    disabled={!f.categoryId}
                  />
                </Field>
                <Field label="Product / asset type" hint={f.subCategoryId && !typeOptions.length ? 'Add asset types under Categories' : undefined}>
                  <SearchSelect
                    options={typeOptions}
                    value={toKey(f.assetTypeId)}
                    onChange={(v) => {
                      const label = typeOptions.find((o) => o.value === v)?.label;
                      setF((p) => ({ ...p, assetTypeId: toId(v), assetName: p.assetName?.trim() ? p.assetName : label || '' }));
                    }}
                    placeholder={!f.subCategoryId ? 'Select a subcategory first' : typeOptions.length ? 'Select product…' : 'No asset types yet'}
                    disabled={!f.subCategoryId}
                  />
                </Field>
                <Field label="Asset name" required>
                  <input className={`input ${mark('main', 'Asset name')}`} value={f.assetName || ''} onChange={(e) => set('assetName', e.target.value)} placeholder="e.g. Anchor Projector Screen" />
                </Field>
                <Field label="Product description">
                  <textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
                </Field>
                <Field label="Quantity" required>
                  <input type="number" min={1} step={1} className={`input ${mark('main', 'Quantity')}`} value={f.quantity ?? 1} onChange={(e) => set('quantity', e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
                <Field label="Asset code" hint={isEdit ? undefined : 'Leave blank to auto-generate'}>
                  <input className="input mono" value={f.assetCode || ''} onChange={(e) => set('assetCode', e.target.value)} placeholder="AST-000123" />
                </Field>
              </div>

              <div className="stack">
                <SectionTitle icon={<Tag size={17} />} title="Status & assignment" tone="purple" />
                <Field label="Owner department">
                  <DepartmentPicker value={toKey(f.departmentId)} onChange={(v) => set('departmentId', toId(v))} />
                </Field>
                <Field label="Asset condition" required>
                  <select className={`select ${mark('main', 'Asset condition')}`} value={f.condition || ''} onChange={(e) => set('condition', e.target.value)}>
                    <option value="">Select…</option>
                    {f.condition && !CONDITIONS.includes(f.condition) && <option>{f.condition}</option>}
                    {CONDITIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Asset status" required>
                  <select className={`select ${mark('main', 'Asset status')}`} value={f.status || ''} onChange={(e) => set('status', e.target.value)}>
                    {f.status && !ASSET_STATUSES.includes(f.status) && <option>{f.status}</option>}
                    {ASSET_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ownership type">
                  <select className="select" value={f.ownershipType || ''} onChange={(e) => set('ownershipType', e.target.value)}>
                    <option value="">—</option>
                    {f.ownershipType && !OWNERSHIP_TYPES.includes(f.ownershipType) && <option>{f.ownershipType}</option>}
                    {OWNERSHIP_TYPES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                <Field label="External tag number">
                  <input className="input mono" value={f.externalTagNumber || ''} onChange={(e) => set('externalTagNumber', e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Placed in service">
                  <input type="date" className="input" value={toInputDate(f.placedInServiceDate)} onChange={(e) => set('placedInServiceDate', e.target.value)} />
                </Field>
                <Field label="Employee" hint={isEdit ? 'Use Assign / Transfer on the asset page to keep custody history' : 'Leave empty if the asset stays in store'}>
                  <EmployeePicker
                    value={toKey(f.assignedTo)}
                    onChange={(v) => {
                      const emp = employees.find((e) => e._id === v);
                      setF({ ...f, assignedTo: toId(v), custodianEmployeeId: emp?.empCode || f.custodianEmployeeId || '' });
                    }}
                    placeholder="Unassigned"
                  />
                </Field>
                <Field label="Custodian employee ID">
                  <input className="input mono" value={f.custodianEmployeeId || ''} onChange={(e) => set('custodianEmployeeId', e.target.value)} placeholder="e.g. EMP-00123" />
                </Field>
                <Field label="Supplier">
                  <input className="input" value={f.vendorName || ''} onChange={(e) => set('vendorName', e.target.value)} placeholder="Supplier / vendor name" />
                </Field>
              </div>

              <div className="stack">
                <SectionTitle icon={<MapPin size={17} />} title="Location & tags" tone="blue" />
                <Field label="Site / location" required hint="Branch / site from master data (not GPS). Required even if a room is selected below.">
                  <div className={mark('main', 'Site / location') || undefined}>
                    <LocationPicker
                      value={toKey(f.locationId)}
                      onChange={(v) => setF({ ...f, locationId: toId(v), subLocationId: null })}
                      types={['company', 'site', 'building', 'floor', 'area', 'location', 'branch']}
                    />
                  </div>
                </Field>
                <Field label="Building / floor / room" hint={!f.locationId ? 'Select a site first (or pick a room — site will fill automatically)' : undefined}>
                  <LocationPicker
                    value={f.subLocationId ? `s${f.subLocationId}` : null}
                    onChange={(v) => {
                      if (!v) {
                        set('subLocationId', null);
                        return;
                      }
                      if (v.startsWith('s')) {
                        const subId = Number(v.slice(1)) || null;
                        const node = locations.find((l) => l._id === v);
                        // Sublocation carries its parent site as locationId — fill both so validation passes.
                        setF((p) => ({
                          ...p,
                          subLocationId: subId,
                          locationId: node?.locationId || p.locationId || null,
                        }));
                        return;
                      }
                      // User picked a location-level node in this picker — treat it as the site.
                      setF((p) => ({ ...p, locationId: toId(v), subLocationId: null }));
                    }}
                    types={['building', 'floor', 'area', 'sublocation', 'room', 'zone', 'rack']}
                    underId={toKey(f.locationId)}
                    placeholder={f.locationId ? 'Select sublocation…' : 'Select sublocation…'}
                  />
                </Field>
                <Field label="QR code value" hint="Defaults to the asset code">
                  <input className="input mono" value={f.qrCode || ''} onChange={(e) => set('qrCode', e.target.value)} />
                </Field>
                <Field label="RFID tag (EPC)">
                  <input className="input mono" value={f.rfidTag || ''} onChange={(e) => set('rfidTag', e.target.value)} />
                </Field>
                <Field label="Ref value 1">
                  <input className="input" value={f.refValue1 || ''} onChange={(e) => set('refValue1', e.target.value)} />
                </Field>
                <Field label="Ref value 2">
                  <input className="input" value={f.refValue2 || ''} onChange={(e) => set('refValue2', e.target.value)} />
                </Field>
                <Field label="Ref value 3">
                  <input className="input" value={f.refValue3 || ''} onChange={(e) => set('refValue3', e.target.value)} />
                </Field>
                <Field label="Remarks">
                  <textarea className="textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional notes for the register" />
                </Field>
              </div>
            </div>
          )}

          {tab === 'product' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <div>
                <SectionTitle icon={<Boxes size={17} />} title="Make & model" desc="Physical attributes of the product" />
                <div className="form-grid">
                  <Field label="Brand" required>
                    <input className={`input ${mark('product', 'Brand')}`} value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. HP" />
                  </Field>
                  <Field label="Model" required>
                    <input className={`input ${mark('product', 'Model')}`} value={f.model || ''} onChange={(e) => set('model', e.target.value)} placeholder="e.g. ZBook 14u G5" />
                  </Field>
                  <Field label="Manufacturer">
                    <input className="input" value={f.manufacturer || ''} onChange={(e) => set('manufacturer', e.target.value)} />
                  </Field>
                  <Field label="Year of manufacture">
                    <input type="number" min={1950} max={2100} className="input" value={f.yearOfManufacture ?? ''} onChange={(e) => set('yearOfManufacture', e.target.value === '' ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Color">
                    <input className="input" value={f.color || ''} onChange={(e) => set('color', e.target.value)} />
                  </Field>
                  <ReadOnly label="Quantity (from Main)" value={f.quantity ?? 1} />
                  <Field label="Specifications" className="full">
                    <textarea className="textarea" rows={4} value={f.specifications || ''} onChange={(e) => set('specifications', e.target.value)} placeholder="Dimensions, capacity, processor, technical specs…" />
                  </Field>
                </div>
              </div>
              <div>
                <SectionTitle icon={<Calendar size={17} />} title="Warranty" desc="Manufacturer / supplier warranty cover" tone="amber" />
                <div className="form-grid">
                  <Field label="Warranty start">
                    <input type="date" className="input" value={toInputDate(f.warrantyStartDate)} onChange={(e) => set('warrantyStartDate', e.target.value)} />
                  </Field>
                  <Field label="Warranty end">
                    <input type="date" className={`input ${req('product', 'Warranty end must be after start') ? 'input-error' : ''}`} value={toInputDate(f.warrantyEndDate)} onChange={(e) => set('warrantyEndDate', e.target.value)} />
                  </Field>
                </div>
                <div className="alert alert-info mt">
                  <b>Summary:</b> {[f.brand, f.model].filter(Boolean).join(' ') || 'Brand and model not set'}
                  {f.manufacturer ? ` · ${f.manufacturer}` : ''}
                  {f.yearOfManufacture ? ` · ${f.yearOfManufacture}` : ''}
                  {f.warrantyEndDate ? ` · warranty till ${date(f.warrantyEndDate)}` : ' · no warranty dates'}
                </div>
              </div>
            </div>
          )}

          {tab === 'finance' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <div className="stack" style={{ gap: 22 }}>
                <div>
                  <SectionTitle icon={<Calendar size={17} />} title="Purchase" desc="Acquisition details" tone="cyan" />
                  <div className="form-grid">
                    <Field label="Purchase date" required>
                      <input type="date" className={`input ${mark('finance', 'Purchase date')}`} value={toInputDate(f.purchaseDate)} onChange={(e) => set('purchaseDate', e.target.value)} />
                    </Field>
                    <Field label="Purchase price" required>
                      <input type="number" min={0} step="0.01" className={`input ${mark('finance', 'Purchase price')}`} value={f.purchaseCost ?? ''} onChange={(e) => set('purchaseCost', e.target.value === '' ? null : Number(e.target.value))} placeholder="0.00" />
                    </Field>
                    <Field label="Currency" required>
                      <select className="select" value={f.currency || getCurrency()} onChange={(e) => set('currency', e.target.value)}>
                        {f.currency && !CURRENCIES.includes(f.currency) && <option>{f.currency}</option>}
                        {CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Supplier">
                      <input className="input" value={f.vendorName || ''} onChange={(e) => set('vendorName', e.target.value)} placeholder="Supplier / vendor name" />
                    </Field>
                  </div>
                </div>

                <div>
                  <SectionTitle icon={<Calculator size={17} />} title="Depreciation" desc={existingDep ? 'Posted schedule for this asset' : 'Optional: set up the schedule now'} tone="purple" />
                  {existingDep ? (
                    <>
                      <div className="form-grid">
                        <ReadOnly label="Method" value={depreciationMethodLabel(existingDep.depreciationMethod)} />
                        <ReadOnly label="Useful life" value={`${existingDep.usefulLifeMonths} months`} />
                        <ReadOnly label="Depreciation start date" value={date(existingDep.depreciationStartDate)} />
                        <ReadOnly label="Residual value" value={fmt(existingDep.residualValue)} />
                        <ReadOnly label="Depreciated amount (cumulative)" value={fmt(existingDep.accumulatedDepreciation)} />
                        <ReadOnly label="Last depreciation date" value={existingDep.lastCalculatedDate ? date(existingDep.lastCalculatedDate) : 'Not yet posted'} />
                        <ReadOnly label="Net book value" value={<b>{fmt(existingDep.currentBookValue)}</b>} />
                      </div>
                      <button type="button" className="btn mt-sm" disabled={recalc} onClick={recalculate}>
                        <Calculator size={15} /> {recalc ? 'Recalculating…' : 'Recalculate to today'}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="checkbox" style={{ marginBottom: 12 }}>
                        <input type="checkbox" checked={dep.enabled} onChange={(e) => setDep({ ...dep, enabled: e.target.checked, startDate: dep.startDate || toInputDate(f.purchaseDate) })} />
                        Set up depreciation for this asset
                      </label>
                      {dep.enabled && (
                        <div className="form-grid">
                          <Field label="Method" required>
                            <select className="select" value={dep.method} onChange={(e) => setDep({ ...dep, method: e.target.value })}>
                              {DEPRECIATION_METHODS.map((m) => (
                                <option key={m} value={m}>
                                  {depreciationMethodLabel(m)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Useful life (months)" required>
                            <input type="number" min={1} className="input" value={dep.usefulLifeMonths ?? ''} onChange={(e) => setDep({ ...dep, usefulLifeMonths: e.target.value === '' ? null : Number(e.target.value) })} />
                          </Field>
                          <Field label="Depreciation start date" hint="Defaults to the purchase date">
                            <input type="date" className="input" value={dep.startDate || toInputDate(f.purchaseDate)} onChange={(e) => setDep({ ...dep, startDate: e.target.value })} />
                          </Field>
                          <Field label="Residual (salvage) value">
                            <input type="number" min={0} step="0.01" className="input" value={dep.residualValue ?? ''} onChange={(e) => setDep({ ...dep, residualValue: e.target.value === '' ? null : Number(e.target.value) })} />
                          </Field>
                          <ReadOnly label="Depreciated amount (cumulative)" value={fmt(depPreview.accumulated)} />
                          <ReadOnly label="Last depreciation date" value={depPreview.elapsed ? `${date(new Date())} (preview)` : 'Starts next month'} />
                          <ReadOnly label="Net book value" value={<b>{fmt(depPreview.book)}</b>} />
                          <ReadOnly label="Months elapsed" value={`${depPreview.elapsed} / ${dep.usefulLifeMonths || 0}`} />
                        </div>
                      )}
                      {!dep.enabled && <div className="small muted">Net book value equals the purchase price until a depreciation schedule is set up. You can also do this later from the asset page.</div>}
                    </>
                  )}
                </div>
              </div>

              <div className="stack" style={{ gap: 22 }}>
                <div>
                  <SectionTitle icon={<Calendar size={17} />} title="AMC" desc="Annual maintenance contract" tone="cyan" />
                  <div className="form-grid">
                    <Field label="AMC start">
                      <input type="date" className="input" value={toInputDate(f.amcStartDate)} onChange={(e) => set('amcStartDate', e.target.value)} />
                    </Field>
                    <Field label="AMC end">
                      <input type="date" className={`input ${req('finance', 'AMC end must be after start') ? 'input-error' : ''}`} value={toInputDate(f.amcEndDate)} onChange={(e) => set('amcEndDate', e.target.value)} />
                    </Field>
                  </div>
                </div>
                <div>
                  <SectionTitle icon={<Calendar size={17} />} title="Insurance" desc="Policy cover for this asset" tone="blue" />
                  <div className="form-grid">
                    <Field label="Insurance start">
                      <input type="date" className="input" value={toInputDate(f.insuranceStartDate)} onChange={(e) => set('insuranceStartDate', e.target.value)} />
                    </Field>
                    <Field label="Insurance end">
                      <input type="date" className={`input ${req('finance', 'Insurance end must be after start') ? 'input-error' : ''}`} value={toInputDate(f.insuranceEndDate)} onChange={(e) => set('insuranceEndDate', e.target.value)} />
                    </Field>
                    <Field label="Insurance policy no." className="full">
                      <input className="input mono" value={f.insurancePolicyNumber || ''} onChange={(e) => set('insurancePolicyNumber', e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                </div>
                <div className="alert alert-info">
                  <b>Book value:</b> {existingDep ? fmt(existingDep.currentBookValue) : dep.enabled ? fmt(depPreview.book) : cost ? money(cost) : '—'}
                  {f.purchaseDate ? ` · purchased ${date(f.purchaseDate)}` : ''}
                </div>
              </div>
            </div>
          )}

          {tab === 'media' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <div>
                <SectionTitle icon={<ImagePlus size={17} />} title="Images" desc="Up to 8 photos; the first one is used as the asset picture" />
                <div className="row wrap" style={{ gap: 10 }}>
                  {images.map((src, i) => (
                    <div key={i} style={{ position: 'relative', width: 120, height: 120, borderRadius: 10, overflow: 'hidden', border: i === 0 ? '2px solid var(--primary)' : '1px solid var(--border)', background: 'var(--slate-50)' }}>
                      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {i === 0 && <span className="badge badge-blue" style={{ position: 'absolute', left: 6, bottom: 6 }}>Primary</span>}
                      <button
                        type="button"
                        className="btn btn-icon"
                        style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, background: 'rgba(15,23,42,.75)', color: '#fff', border: 'none' }}
                        onClick={() => setF((p) => ({ ...p, images: (p.images || []).filter((_, j) => j !== i) }))}
                        aria-label="Remove image"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {images.length < 8 && (
                    <button type="button" className="btn" style={{ width: 120, height: 120, flexDirection: 'column', gap: 6 }} onClick={() => imageRef.current?.click()}>
                      <Upload size={18} />
                      <span className="xs">Add image</span>
                    </button>
                  )}
                </div>
                <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addImages(e.target.files), (e.target.value = ''))} />
                {!images.length && <div className="small muted mt-sm">No images yet. Photos help with audits and label verification.</div>}
              </div>

              <div>
                <SectionTitle icon={<FileText size={17} />} title="Documents" desc="Invoices, manuals, certificates — up to 10 files" tone="purple" />
                <div className="stack" style={{ gap: 8 }}>
                  {documents.map((d, i) => (
                    <div key={`${d.name}-${i}`} className="row-between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="cell-main ellipsis">{d.name}</div>
                        <div className="cell-sub">
                          {d.type || 'File'}
                          {d.uploadedDate ? ` · ${date(d.uploadedDate)}` : ''}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <a className="btn btn-sm" href={d.dataUrl} download={d.name}>
                          Download
                        </a>
                        <button type="button" className="btn btn-icon" onClick={() => setF((p) => ({ ...p, documents: (p.documents || []).filter((_, j) => j !== i) }))} aria-label="Remove document">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {documents.length < 10 && (
                    <button type="button" className="btn" onClick={() => docRef.current?.click()}>
                      <Upload size={16} /> Upload document
                    </button>
                  )}
                </div>
                <input ref={docRef} type="file" multiple hidden onChange={(e) => (addDocuments(e.target.files), (e.target.value = ''))} />
                {!documents.length && <div className="small muted mt-sm">Attach the purchase invoice and warranty card so they are available from the asset page.</div>}
              </div>
            </div>
          )}

          {tab === 'geo' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              <div>
                <SectionTitle icon={<Navigation size={17} />} title="Coordinates" desc="Pin where the asset is installed or stored" tone="blue" />
                <div className="form-grid">
                  <Field label="Latitude">
                    <input type="number" step="any" className={`input mono ${attempted && errors.geo.length ? 'input-error' : ''}`} value={f.latitude ?? ''} onChange={(e) => set('latitude', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 25.2048" />
                  </Field>
                  <Field label="Longitude">
                    <input type="number" step="any" className={`input mono ${attempted && errors.geo.length ? 'input-error' : ''}`} value={f.longitude ?? ''} onChange={(e) => set('longitude', e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 55.2708" />
                  </Field>
                  <Field label="Address / landmark" className="full">
                    <input className="input" value={f.geoAddress || ''} onChange={(e) => set('geoAddress', e.target.value)} placeholder="Building, floor, nearby landmark…" />
                  </Field>
                </div>
                <div className="row wrap mt" style={{ gap: 8 }}>
                  <button type="button" className="btn" onClick={captureGeo} disabled={locating}>
                    <Navigation size={16} /> {locating ? 'Locating…' : 'Use current location'}
                  </button>
                  {mapUrl && (
                    <a className="btn" href={mapUrl} target="_blank" rel="noreferrer">
                      <MapPin size={16} /> Open in Google Maps
                    </a>
                  )}
                  {hasCoords && (
                    <button type="button" className="btn btn-ghost" onClick={() => setF((p) => ({ ...p, latitude: null, longitude: null }))}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div>
                <SectionTitle icon={<MapPin size={17} />} title="Map preview" tone="green" />
                {embedUrl ? (
                  <iframe title="Asset location" src={embedUrl} style={{ width: '100%', height: 320, border: '1px solid var(--border)', borderRadius: 12 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                ) : (
                  <div className="small muted" style={{ height: 320, border: '1px dashed var(--border)', borderRadius: 12, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}>
                    Enter coordinates or use your current location to see the asset on the map.
                  </div>
                )}
              </div>
            </div>
          )}

          {footerNav}
        </div>
      </div>

      <CategoryQuickAdd
        open={quickAdd !== null}
        level={quickAdd || 'category'}
        parentId={f.categoryId}
        onClose={() => setQuickAdd(null)}
        onCreated={(c) => setF((prev) => (c.level === 'category' ? { ...prev, categoryId: c.id, subCategoryId: null } : { ...prev, categoryId: c.categoryId, subCategoryId: c.id }))}
      />
    </form>
  );
}
