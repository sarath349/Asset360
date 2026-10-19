import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building, Crosshair, LayoutGrid, Layers, MapPin, Pencil, Plus, Square, Trash2 } from 'lucide-react';
import { ApiAsset, ApiLocation, assetApi, locationApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { LocationNode, useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../lib/hooks';
import { money, num } from '../lib/format';
import { descendantIds, pathOf } from '../lib/tree';
import { Card, Confirm, Empty, Field, Kpi, PageHeader, SearchInput, Switch, Tabs } from '../components/ui';
import { DepartmentPicker } from '../components/pickers';

type Tab = 'location' | 'sublocation' | 'room';
type Draft = Partial<ApiLocation>;

const TAB_META: Record<Tab, { label: string; type: string; singular: string; parentLabel?: string; parentTypes: string[] }> = {
  location: { label: 'Location', type: 'Location', singular: 'location', parentTypes: ['company', 'site', 'building', 'floor', 'area', 'location'] },
  sublocation: { label: 'Sublocation', type: 'Sublocation', singular: 'sublocation', parentLabel: 'Location', parentTypes: ['location', 'company', 'site', 'building', 'floor', 'area'] },
  room: { label: 'Room', type: 'Room', singular: 'room', parentLabel: 'Sublocation', parentTypes: ['sublocation'] },
};

const toDraft = (l: ApiLocation): Draft => ({
  locationId: l.locationId,
  parentLocationId: l.parentLocationId,
  locationCode: l.locationCode,
  locationName: l.locationName,
  locationType: l.locationType,
  description: l.description,
  departmentId: l.departmentId,
  costCenter: l.costCenter,
  latitude: l.latitude,
  longitude: l.longitude,
  isActive: l.isActive,
  createdDate: l.createdDate,
});

const norm = (value?: string | null) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

function findByName(text: string, items: LocationNode[]) {
  const s = norm(text);
  if (!s) return { status: 'empty' as const };
  const exact = items.filter((l) => norm(l.name) === s || norm(l.code) === s);
  if (exact.length === 1) return { status: 'one' as const, item: exact[0] };
  if (exact.length > 1) return { status: 'many' as const };
  const partial = items.filter((l) => norm(l.name).includes(s) || norm(l.code).includes(s));
  if (partial.length === 1) return { status: 'one' as const, item: partial[0] };
  if (partial.length > 1) return { status: 'many' as const };
  return { status: 'none' as const };
}

function matchesTab(node: LocationNode, tab: Tab) {
  const t = node.type.toLowerCase();
  if (tab === 'location') return t === 'location' || (!t && !node.parent);
  if (tab === 'sublocation') return t === 'sublocation';
  return t === 'room';
}

export default function LocationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = ((params.get('tab') as Tab) || 'location') as Tab;
  const meta = TAB_META[tab] || TAB_META.location;

  const { locations: allLocations, reload } = useData();
  const { scopeIds, activeBranch } = useBranch();
  const locations = useMemo(() => (scopeIds ? allLocations.filter((l) => scopeIds.has(l._id)) : allLocations), [allLocations, scopeIds]);
  const { can } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parentText, setParentText] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: assets } = useFetch(() => assetApi.list().catch(() => [] as ApiAsset[]), []);

  const tabRows = useMemo(() => {
    let list = locations.filter((l) => matchesTab(l, tab));
    if (filter.trim()) {
      const s = filter.toLowerCase();
      list = list.filter((l) => [l.name, l.code, l.type, l.description].some((x) => x?.toLowerCase().includes(s)));
    }
    return list;
  }, [locations, tab, filter]);

  const parentPool = useMemo(
    () =>
      allLocations.filter((l) => {
        if (draft?.locationId && descendantIds(String(draft.locationId), allLocations).includes(l._id)) return false;
        return meta.parentTypes.includes(l.type.toLowerCase());
      }),
    [allLocations, draft?.locationId, meta.parentTypes]
  );

  const typeCounts = useMemo(() => {
    const c = { location: 0, sublocation: 0, room: 0 };
    locations.forEach((l) => {
      const t = l.type.toLowerCase();
      if (t === 'location') c.location += 1;
      else if (t === 'sublocation') c.sublocation += 1;
      else if (t === 'room') c.room += 1;
    });
    return c;
  }, [locations]);

  const childCount = useMemo(() => {
    if (!draft?.locationId) return 0;
    return locations.filter((l) => l.parent === String(draft.locationId)).length;
  }, [locations, draft?.locationId]);

  const stats = useMemo(() => {
    if (!draft?.locationId) return { count: 0, value: 0 };
    const ids = new Set(descendantIds(String(draft.locationId), locations).map(Number));
    const here = (assets || []).filter((a) => a.locationId && ids.has(a.locationId));
    return { count: here.length, value: here.reduce((s, a) => s + (a.purchaseCost || 0), 0) };
  }, [draft?.locationId, locations, assets]);

  const switchTab = (next: string) => {
    setParams({ tab: next });
    setFilter('');
    setDraft(null);
    setParentText('');
    setConfirmDel(false);
  };

  const openEdit = async (row: LocationNode) => {
    try {
      const fresh = await locationApi.get(row.locationId);
      const record = toDraft(fresh || row);
      setDraft(record);
      setParentText(record.parentLocationId ? allLocations.find((l) => l.locationId === record.parentLocationId)?.name || '' : '');
    } catch (err) {
      toast.error(err);
    }
  };

  const startNew = () => {
    setDraft({
      locationName: '',
      locationCode: '',
      locationType: meta.type,
      parentLocationId: null,
      isActive: true,
    });
    setParentText('');
  };

  const resolveParent = () => {
    if (!parentText.trim()) return { ok: true as const, id: null as number | null };
    const match = findByName(parentText, parentPool);
    if (match.status === 'one') return { ok: true as const, id: match.item.locationId };
    if (match.status === 'many') {
      toast.error(`More than one match for "${parentText.trim()}". Type the exact name or code.`);
      return { ok: false as const };
    }
    toast.error(`No ${meta.parentLabel || 'parent'} matches "${parentText.trim()}".`);
    return { ok: false as const };
  };

  const save = async () => {
    if (!draft?.locationName?.trim()) return;
    if (!draft.locationCode?.trim()) return toast.error('Code is required');
    if (tab !== 'location' && !parentText.trim()) return toast.error(`${meta.parentLabel} is required`);
    const parent = resolveParent();
    if (!parent.ok) return;
    setSaving(true);
    try {
      const body: Draft = {
        ...draft,
        locationName: draft.locationName.trim(),
        locationCode: draft.locationCode?.trim() || null,
        locationType: meta.type,
        parentLocationId: parent.id,
        latitude: draft.latitude === null || draft.latitude === undefined || String(draft.latitude) === '' ? null : Number(draft.latitude),
        longitude: draft.longitude === null || draft.longitude === undefined || String(draft.longitude) === '' ? null : Number(draft.longitude),
        isActive: draft.isActive !== false,
      };
      if (draft.locationId) {
        await locationApi.update(draft.locationId, body);
        toast.success(`${meta.label} saved`);
      } else {
        const created = await locationApi.create(body);
        toast.success(`${meta.label} created`);
        if (created?.locationId) {
          const fresh = await locationApi.get(created.locationId).catch(() => created);
          setDraft(toDraft(fresh));
        }
      }
      await reload(['locations']);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const captureGps = () => {
    if (!window.isSecureContext || !navigator.geolocation) return toast.error('GPS needs HTTPS or localhost. Enter latitude/longitude manually.');
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft((d) => ({ ...d, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) })),
      (err) =>
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location for this site, or enter coordinates manually.'
            : 'GPS position unavailable. Enter coordinates manually.'
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (!['location', 'sublocation', 'room'].includes(tab)) setParams({ tab: 'location' }, { replace: true });
  }, [tab, setParams]);

  const editable = can('locations', draft?.locationId ? 'edit' : 'create');
  const blocked = childCount > 0 || stats.count > 0;

  return (
    <>
      <PageHeader
        title="Location Management"
        subtitle={activeBranch ? `Branch: ${activeBranch.name}` : 'Manage locations, sublocations and rooms separately'}
        actions={can('locations', 'create') && <button className="btn btn-primary" onClick={startNew}><Plus size={16} /> Add {meta.singular}</button>}
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Locations" value={num(typeCounts.location)} icon={<MapPin size={19} />} toneName="indigo" />
        <Kpi label="Sublocations" value={num(typeCounts.sublocation)} icon={<LayoutGrid size={19} />} toneName="cyan" />
        <Kpi label="Rooms" value={num(typeCounts.room)} icon={<Square size={19} />} toneName="purple" />
      </div>

      <div className="card mb">
        <Tabs
          active={tab}
          onChange={switchTab}
          tabs={[
            { key: 'location', label: 'Location', count: typeCounts.location, icon: <MapPin size={15} /> },
            { key: 'sublocation', label: 'Sublocation', count: typeCounts.sublocation, icon: <LayoutGrid size={15} /> },
            { key: 'room', label: 'Room', count: typeCounts.room, icon: <Square size={15} /> },
          ]}
        />
      </div>

      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="toolbar">
            <SearchInput value={filter} onChange={setFilter} placeholder={`Search ${meta.singular}s…`} />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            {tabRows.length === 0 ? (
              <Empty
                title={`No ${meta.singular}s yet`}
                message={`Add a ${meta.singular} using the button above.`}
                action={can('locations', 'create') && <button className="btn btn-sm btn-primary" onClick={startNew}><Plus size={14} /> Add {meta.singular}</button>}
              />
            ) : (
              <div className="stack" style={{ gap: 2 }}>
                {tabRows.map((l) => (
                  <button
                    key={l._id}
                    type="button"
                    className={`nav-link ${draft?.locationId === l.locationId ? 'active' : ''}`}
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => openEdit(l)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-main ellipsis">{l.name}</div>
                      <div className="cell-sub mono">{l.code || '—'}{l.parent ? ` · ${pathOf(l.parent, allLocations)}` : ''}</div>
                    </div>
                    {can('locations', 'edit') && <Pencil size={14} className="faint" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="span-2 stack" style={{ gap: 18 }}>
          {!draft ? (
            <Card>
              <Empty icon={<MapPin size={24} />} title={`Select a ${meta.singular}`} message={`Or add a new ${meta.singular}.`} />
            </Card>
          ) : (
            <>
              {draft.locationId && (
                <div className="grid grid-3">
                  <Kpi label="Assets here (incl. children)" value={num(stats.count)} icon={<LayoutGrid size={19} />} />
                  <Kpi label="Asset value" value={money(stats.value, { compact: true })} icon={<Building size={19} />} toneName="purple" />
                  <Kpi label="Direct children" value={childCount} icon={<Layers size={19} />} toneName="cyan" />
                </div>
              )}
              <Card
                title={draft.locationId ? draft.locationName || '(unnamed)' : `New ${meta.singular}`}
                subtitle={meta.type}
                actions={
                  draft.locationId && (
                    <>
                      <Link className="btn btn-sm" to={`/assets?location=${draft.locationId}`}>View assets</Link>
                      {can('locations', 'delete') && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDel(true)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )
                }
              >
                <div className="form-grid">
                  <Field label="Name" required>
                    <input className="input" value={draft.locationName || ''} onChange={(e) => setDraft({ ...draft, locationName: e.target.value })} disabled={!editable} autoFocus={!draft.locationId} />
                  </Field>
                  <Field label="Code" required>
                    <input className="input mono" value={draft.locationCode || ''} onChange={(e) => setDraft({ ...draft, locationCode: e.target.value })} disabled={!editable} />
                  </Field>
                  {tab === 'location' ? (
                    <Field label="Parent" hint="Optional. Type a company, site, building or area name." className="full">
                      <input className="input" list="loc-parent-options" value={parentText} onChange={(e) => setParentText(e.target.value)} disabled={!editable} placeholder="Type a parent (optional)" />
                      <datalist id="loc-parent-options">
                        {parentPool.map((l) => (
                          <option key={l._id} value={l.name} />
                        ))}
                      </datalist>
                    </Field>
                  ) : (
                    <Field label={meta.parentLabel!} required hint={`Type a saved ${meta.parentLabel!.toLowerCase()} name or code.`} className="full">
                      <input className="input" list={`${tab}-parent-options`} value={parentText} onChange={(e) => setParentText(e.target.value)} disabled={!editable} placeholder={`Type a ${meta.parentLabel!.toLowerCase()}`} />
                      <datalist id={`${tab}-parent-options`}>
                        {parentPool.map((l) => (
                          <option key={l._id} value={l.name} />
                        ))}
                      </datalist>
                    </Field>
                  )}
                  <Field label="Department">
                    <DepartmentPicker value={draft.departmentId ? String(draft.departmentId) : null} onChange={(v) => setDraft({ ...draft, departmentId: v ? Number(v) : null })} />
                  </Field>
                  <Field label="Cost center">
                    <input className="input" value={draft.costCenter || ''} onChange={(e) => setDraft({ ...draft, costCenter: e.target.value })} disabled={!editable} />
                  </Field>
                  <Field label="GPS latitude">
                    <input className="input" value={draft.latitude ?? ''} onChange={(e) => setDraft({ ...draft, latitude: e.target.value as any })} disabled={!editable} />
                  </Field>
                  <Field label="GPS longitude">
                    <div className="row">
                      <input className="input" value={draft.longitude ?? ''} onChange={(e) => setDraft({ ...draft, longitude: e.target.value as any })} disabled={!editable} />
                      {editable && (
                        <button type="button" className="btn btn-icon" title="Use my location" onClick={captureGps}>
                          <Crosshair size={15} />
                        </button>
                      )}
                    </div>
                  </Field>
                  <Field label="Description" className="full">
                    <textarea className="textarea" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={!editable} />
                  </Field>
                  <label className="row small" style={{ gap: 10 }}>
                    <Switch checked={draft.isActive !== false} onChange={(v) => setDraft({ ...draft, isActive: v })} disabled={!editable} /> Active
                  </label>
                </div>
                {draft.latitude && draft.longitude ? (
                  <a className="small" href={`https://maps.google.com/?q=${draft.latitude},${draft.longitude}`} target="_blank" rel="noreferrer">
                    <MapPin size={13} /> Open in Google Maps
                  </a>
                ) : null}
                {editable && (
                  <div className="row mt" style={{ justifyContent: 'flex-end' }}>
                    {!draft.locationId && <button className="btn" onClick={() => setDraft(null)}>Cancel</button>}
                    <button className="btn btn-primary" onClick={save} disabled={saving || !draft.locationName?.trim() || !draft.locationCode?.trim()}>
                      {draft.locationId ? 'Save changes' : `Create ${meta.singular}`}
                    </button>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <Confirm
        open={confirmDel}
        title={`Delete ${meta.singular}?`}
        danger={!blocked}
        confirmText={blocked ? 'OK' : 'Delete'}
        message={blocked ? `This ${meta.singular} still has children or assets. Move them first.` : `Delete "${draft?.locationName}"? This cannot be undone.`}
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (blocked || !draft?.locationId) return setConfirmDel(false);
          try {
            await locationApi.remove(draft.locationId);
            toast.success('Deleted');
            setDraft(null);
            await reload(['locations']);
          } catch (err) {
            toast.error(err);
          } finally {
            setConfirmDel(false);
          }
        }}
      />
    </>
  );
}
