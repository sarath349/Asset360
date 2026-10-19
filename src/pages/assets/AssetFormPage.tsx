import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Boxes, Calendar, MapPin, Plus, Tag } from 'lucide-react';
import { ApiAsset, ApiAssetType, assetApi, assetTypeApi, ASSET_STATUSES, CONDITIONS, CURRENCIES, OWNERSHIP_TYPES } from '../../api/assetApi';
import { useBranch } from '../../context/BranchContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { getCurrency, toInputDate } from '../../lib/format';
import { useFetch } from '../../lib/hooks';
import { ErrorState, Field, Loading, PageHeader } from '../../components/ui';
import { DepartmentPicker, EmployeePicker, LocationPicker, SearchSelect } from '../../components/pickers';
import { CategoryLevel, CategoryQuickAdd } from '../../components/CategoryQuickAdd';
import { nextAssetCode, nextSerialNumber } from '../../lib/assetCodes';

function Section({ icon, title, desc, children, toneName = 'indigo' }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode; toneName?: string }) {
  return (
    <div className="form-section">
      <div className="form-section-title">
        <div className={`kpi-icon tone-${toneName}`}>{icon}</div>
        <div>
          <h3>{title}</h3>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

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
  custodianEmployeeId: '',
};

const DATE_FIELDS = ['purchaseDate', 'warrantyStartDate', 'warrantyEndDate', 'amcStartDate', 'amcEndDate'] as const;

export default function AssetFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { categories, employees } = useData();
  const { activeBranchId } = useBranch();
  const [f, setF] = useState<Partial<ApiAsset>>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [quickAdd, setQuickAdd] = useState<CategoryLevel | null>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    assetApi
      .get(id)
      .then(setF)
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

  // New assets start in the active branch so they stay visible in the branch view.
  useEffect(() => {
    if (!isEdit && activeBranchId) setF((p) => (p.locationId ? p : { ...p, locationId: Number(activeBranchId) }));
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.categoryId) return toast.error('Category is required');
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
        toast.error(dup);
        setSaving(false);
        return;
      }
      const body: Partial<ApiAsset> = {
        ...f,
        assetName: f.assetName?.trim(),
        assetCode: f.assetCode?.trim() || (await nextAssetCode()),
        serialNumber: f.serialNumber?.trim() || (isEdit ? null : (await nextSerialNumber()) || null),
        purchaseCost: f.purchaseCost === null || f.purchaseCost === undefined || String(f.purchaseCost) === '' ? null : Number(f.purchaseCost),
        updatedDate: isEdit ? new Date().toISOString() : null,
      };
      for (const k of DATE_FIELDS) body[k] = f[k] ? toInputDate(f[k]) : null;
      if (!body.qrCode) body.qrCode = body.assetCode;
      const saved = isEdit && id ? await assetApi.update(id, body) : await assetApi.create(body);
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

  return (
    <form onSubmit={submit}>
      <PageHeader
        crumbs={[{ label: 'Assets', to: '/assets' }, { label: isEdit ? f.assetCode || `#${id}` : 'New asset' }]}
        title={isEdit ? `Edit ${f.assetCode || f.assetName}` : 'Register new asset'}
        subtitle={isEdit ? f.assetName : 'The asset code is generated automatically if left blank.'}
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

      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <div className="card span-2">
          <Section icon={<Boxes size={17} />} title="Identification" desc="What the asset is">
            <div className="form-grid">
              <Field label="Asset name" required className="full">
                <input className="input" value={f.assetName || ''} onChange={(e) => set('assetName', e.target.value)} required placeholder="e.g. Dell Latitude Laptop" />
              </Field>
              <Field label="Asset code" hint={isEdit ? undefined : 'Leave blank to auto-generate'}>
                <input className="input mono" value={f.assetCode || ''} onChange={(e) => set('assetCode', e.target.value)} placeholder="AST-000123" />
              </Field>
              <Field label="Serial number" hint={isEdit ? undefined : 'Auto-filled as the next number after the last asset'}>
                <input className="input" value={f.serialNumber || ''} onChange={(e) => set('serialNumber', e.target.value)} placeholder="e.g. 1" />
              </Field>
              <Field
                label="Category"
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
                  placeholder={categoryOptions.length ? 'Select category…' : 'No categories yet — add one below'}
                />
              </Field>
              <Field
                label="Subcategory"
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
                  placeholder={!f.categoryId ? 'Select a category first' : subCategoryOptions.length ? 'Select subcategory…' : 'No subcategories yet — add one below'}
                  disabled={!f.categoryId}
                />
              </Field>
              <Field label="Asset type" hint={f.subCategoryId && !typeOptions.length ? 'Add asset types under Categories' : undefined}>
                <SearchSelect
                  options={typeOptions}
                  value={toKey(f.assetTypeId)}
                  onChange={(v) => set('assetTypeId', toId(v))}
                  placeholder={!f.subCategoryId ? 'Select a subcategory first' : typeOptions.length ? 'Select asset type…' : 'No asset types yet'}
                  disabled={!f.subCategoryId}
                />
              </Field>
              <Field label="Brand">
                <input className="input" value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} />
              </Field>
              <Field label="Model">
                <input className="input" value={f.model || ''} onChange={(e) => set('model', e.target.value)} />
              </Field>
              <Field label="Description" className="full">
                <textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <Field label="Remarks" className="full">
                <textarea className="textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional notes for the register" />
              </Field>
            </div>
          </Section>

          <Section icon={<Calendar size={17} />} title="Purchase, warranty & AMC" toneName="cyan">
            <div className="form-grid-3">
              <Field label="Purchase date">
                <input type="date" className="input" value={toInputDate(f.purchaseDate)} onChange={(e) => set('purchaseDate', e.target.value)} />
              </Field>
              <Field label="Purchase cost">
                <input type="number" min={0} step="0.01" className="input" value={f.purchaseCost ?? ''} onChange={(e) => set('purchaseCost', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Currency">
                <select className="select" value={f.currency || getCurrency()} onChange={(e) => set('currency', e.target.value)}>
                  {f.currency && !CURRENCIES.includes(f.currency) && <option>{f.currency}</option>}
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Warranty start">
                <input type="date" className="input" value={toInputDate(f.warrantyStartDate)} onChange={(e) => set('warrantyStartDate', e.target.value)} />
              </Field>
              <Field label="Warranty end">
                <input type="date" className="input" value={toInputDate(f.warrantyEndDate)} onChange={(e) => set('warrantyEndDate', e.target.value)} />
              </Field>
              <div />
              <Field label="AMC start">
                <input type="date" className="input" value={toInputDate(f.amcStartDate)} onChange={(e) => set('amcStartDate', e.target.value)} />
              </Field>
              <Field label="AMC end">
                <input type="date" className="input" value={toInputDate(f.amcEndDate)} onChange={(e) => set('amcEndDate', e.target.value)} />
              </Field>
            </div>
          </Section>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <Section icon={<MapPin size={17} />} title="Location & custody" toneName="blue">
              <div className="stack">
                <Field label="Location">
                  <LocationPicker
                    value={toKey(f.locationId)}
                    onChange={(v) => setF({ ...f, locationId: toId(v), subLocationId: null })}
                    types={['company', 'site', 'building', 'floor', 'area', 'location']}
                  />
                </Field>
                <Field label="Sublocation" hint={!f.locationId ? 'Select a location first' : undefined}>
                  <LocationPicker
                    value={toKey(f.subLocationId)}
                    onChange={(v) => set('subLocationId', toId(v))}
                    types={['sublocation', 'room']}
                    underId={toKey(f.locationId)}
                    placeholder={f.locationId ? 'Select sublocation…' : 'Select a location first'}
                  />
                </Field>
                <Field label="Department">
                  <DepartmentPicker value={toKey(f.departmentId)} onChange={(v) => set('departmentId', toId(v))} />
                </Field>
                <Field label="Assigned to" hint={isEdit ? 'Use Assign / Transfer on the asset page to keep a custody history' : undefined}>
                  <EmployeePicker
                    value={toKey(f.assignedTo)}
                    onChange={(v) => {
                      const emp = employees.find((e) => e._id === v);
                      setF({ ...f, assignedTo: toId(v), custodianEmployeeId: emp?.empCode || f.custodianEmployeeId || '' });
                    }}
                    placeholder="Unassigned"
                  />
                </Field>
                <Field label="Custodian employee ID" hint="Employee code of the custodian">
                  <input className="input mono" value={f.custodianEmployeeId || ''} onChange={(e) => set('custodianEmployeeId', e.target.value)} placeholder="e.g. EMP-00123" />
                </Field>
              </div>
            </Section>
          </div>
          <div className="card">
            <Section icon={<Tag size={17} />} title="Status & tagging" toneName="purple">
              <div className="stack">
                <Field label="Status">
                  <select className="select" value={f.status || ''} onChange={(e) => set('status', e.target.value)}>
                    {f.status && !ASSET_STATUSES.includes(f.status) && <option>{f.status}</option>}
                    {ASSET_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Condition">
                  <select className="select" value={f.condition || ''} onChange={(e) => set('condition', e.target.value)}>
                    <option value="">—</option>
                    {f.condition && !CONDITIONS.includes(f.condition) && <option>{f.condition}</option>}
                    {CONDITIONS.map((c) => (
                      <option key={c}>{c}</option>
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
                <Field label="QR code value" hint="Defaults to the asset code">
                  <input className="input mono" value={f.qrCode || ''} onChange={(e) => set('qrCode', e.target.value)} />
                </Field>
                <Field label="RFID tag (EPC)">
                  <input className="input mono" value={f.rfidTag || ''} onChange={(e) => set('rfidTag', e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>
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
