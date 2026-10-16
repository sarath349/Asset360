import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, Building2, Crosshair, Factory, Layers, LayoutGrid, MapPin, Plus, Server, Square, Trash2, Warehouse } from 'lucide-react';
import { ApiAsset, ApiLocation, assetApi, LOCATION_TYPES, locationApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { LocationNode, useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../lib/hooks';
import { money, num } from '../lib/format';
import { descendantIds, pathOf } from '../lib/tree';
import { Card, Confirm, Empty, Field, Kpi, PageHeader, SearchInput, Switch } from '../components/ui';
import { DepartmentPicker } from '../components/pickers';
import { TreeView } from '../components/TreeView';

const ICON: Record<string, any> = { company: Building2, site: Factory, building: Building, floor: Layers, area: LayoutGrid, room: Square, zone: Warehouse, rack: Server };
const NEXT: Record<string, string> = { Company: 'Site', Site: 'Building', Building: 'Floor', Floor: 'Area', Area: 'Room', Room: 'Zone', Zone: 'Rack' };

type Draft = Partial<ApiLocation>;

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

export default function LocationsPage() {
  const { locations: allLocations, reload } = useData();
  const { scopeIds, activeBranch } = useBranch();
  const locations = useMemo(() => (scopeIds ? allLocations.filter((l) => scopeIds.has(l._id)) : allLocations), [allLocations, scopeIds]);
  const { can } = useAuth();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: assets } = useFetch(() => assetApi.list().catch(() => [] as ApiAsset[]), []);
  const selected = useMemo(() => locations.find((l) => l._id === selectedId), [locations, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraft(toDraft(selected));
    let live = true;
    locationApi
      .get(selected.locationId)
      .then((l) => live && l && setDraft(toDraft(l)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selected]);
  useEffect(() => {
    if (!selectedId && !draft && locations.length) setSelectedId(locations.find((l) => !l.parent)?._id || null);
  }, [locations, selectedId, draft]);

  const { data: subLocations } = useFetch(() => (selectedId ? locationApi.byParent(selectedId).catch(() => null) : Promise.resolve(null)), [selectedId, locations]);
  const childCount = useMemo(
    () => (subLocations ? subLocations.filter((l) => String(l.parentLocationId) === selectedId).length : locations.filter((l) => l.parent === selectedId).length),
    [subLocations, locations, selectedId]
  );
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    locations.forEach((l) => (c[l.type.toLowerCase()] = (c[l.type.toLowerCase()] || 0) + 1));
    return c;
  }, [locations]);

  const stats = useMemo(() => {
    if (!selectedId) return { count: 0, value: 0 };
    const ids = new Set(descendantIds(selectedId, locations).map(Number));
    const here = (assets || []).filter((a) => a.locationId && ids.has(a.locationId));
    return { count: here.length, value: here.reduce((s, a) => s + (a.purchaseCost || 0), 0) };
  }, [selectedId, locations, assets]);

  const directCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of assets || []) if (a.locationId) m.set(a.locationId, (m.get(a.locationId) || 0) + 1);
    return m;
  }, [assets]);

  const startNew = (parent?: LocationNode | Draft) => {
    setSelectedId(null);
    const parentType = parent?.locationType || '';
    setDraft({ locationName: '', locationCode: '', locationType: parent ? NEXT[parentType] || 'Room' : 'Company', parentLocationId: parent?.locationId || null, isActive: true });
  };

  // The API only accepts a Company at the top level and the next type down under each parent.
  const changeParent = (value: string) => {
    const parentId = value ? Number(value) : null;
    const parent = locations.find((l) => l.locationId === parentId);
    setDraft((d) => ({ ...d, parentLocationId: parentId, locationType: parent ? NEXT[parent.locationType || ''] || d?.locationType : 'Company' }));
  };

  const save = async () => {
    if (!draft?.locationName?.trim()) return;
    if (!draft.locationCode?.trim()) return toast.error('Location code is required');
    setSaving(true);
    try {
      const body: Draft = {
        ...draft,
        locationName: draft.locationName.trim(),
        locationCode: draft.locationCode?.trim() || null,
        latitude: draft.latitude === null || draft.latitude === undefined || String(draft.latitude) === '' ? null : Number(draft.latitude),
        longitude: draft.longitude === null || draft.longitude === undefined || String(draft.longitude) === '' ? null : Number(draft.longitude),
        isActive: draft.isActive !== false,
      };
      if (draft.locationId) {
        await locationApi.update(draft.locationId, body);
        toast.success('Location saved');
      } else {
        const l = await locationApi.create(body);
        toast.success('Location created');
        if (l?.locationId) setSelectedId(String(l.locationId));
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
            ? 'Location permission denied. Allow location for this site (and for the browser in macOS Location Services), or enter coordinates manually.'
            : err.code === err.TIMEOUT
              ? 'GPS timed out. Try again or enter coordinates manually.'
              : 'GPS position unavailable on this device. Enter coordinates manually.'
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const editable = can('locations', draft?.locationId ? 'edit' : 'create');
  const parentKey = draft?.parentLocationId ? String(draft.parentLocationId) : null;
  const blocked = childCount > 0 || stats.count > 0;

  return (
    <>
      <PageHeader
        title="Location Management"
        subtitle={activeBranch ? `Branch: ${activeBranch.name} · Building → Floor → Area → Room → Zone → Rack` : 'Company → Site (branch) → Building → Floor → Area → Room → Zone → Rack'}
        actions={can('locations', 'create') && !scopeIds && <button className="btn btn-primary" onClick={() => startNew()}><Plus size={16} /> New company</button>}
      />
      <div className="grid grid-kpi mb">
        {['site', 'building', 'floor', 'room'].map((t) => {
          const I = ICON[t];
          return <Kpi key={t} label={t === 'site' ? 'Branches (sites)' : `${t[0].toUpperCase()}${t.slice(1)}s`} value={num(typeCounts[t] || 0)} icon={<I size={19} />} toneName={t === 'site' ? 'indigo' : t === 'building' ? 'cyan' : t === 'floor' ? 'purple' : 'green'} />;
        })}
      </div>
      <div className="grid grid-3" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="toolbar">
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter locations…" />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
            {locations.length === 0 ? (
              <Empty
                title="No locations yet"
                message="Start with your company, then add sites, buildings, floors and rooms under it."
                action={can('locations', 'create') && <button className="btn btn-sm btn-primary" onClick={() => startNew()}><Plus size={14} /> New company</button>}
              />
            ) : (
              <TreeView
                items={locations}
                selected={selectedId}
                filter={filter}
                defaultDepth={2}
                onSelect={(l) => setSelectedId(l._id)}
                renderIcon={(l) => {
                  const I = ICON[l.type.toLowerCase()] || MapPin;
                  return <I size={14} className="muted" />;
                }}
                renderMeta={(l) => <span className="count">{directCount.get(l.locationId) || 0}</span>}
              />
            )}
          </div>
        </div>
        <div className="span-2 stack" style={{ gap: 18 }}>
          {!draft ? (
            <Card>
              <Empty icon={<MapPin size={24} />} title="Select a location" />
            </Card>
          ) : (
            <>
              {draft.locationId && (
                <div className="grid grid-3">
                  <Kpi label="Assets here (incl. sub-locations)" value={num(stats.count)} icon={<LayoutGrid size={19} />} />
                  <Kpi label="Asset value" value={money(stats.value, { compact: true })} icon={<Building size={19} />} toneName="purple" />
                  <Kpi label="Direct sub-locations" value={childCount} icon={<Layers size={19} />} toneName="cyan" />
                </div>
              )}
              {draft.locationId && selectedId && <LocationSummary rootId={selectedId} locations={locations} assets={assets || []} onSelect={setSelectedId} />}
              <Card
                title={draft.locationId ? draft.locationName || '(unnamed)' : 'New location'}
                subtitle={<>{draft.locationType || 'Location'}{parentKey && <> · in {pathOf(parentKey, locations)}</>}</>}
                actions={
                  draft.locationId && (
                    <>
                      {can('locations', 'create') && (
                        <button className="btn btn-sm" onClick={() => startNew(draft)}>
                          <Plus size={14} /> Add {NEXT[draft.locationType || ''] || 'sub-location'}
                        </button>
                      )}
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
                  <Field label="Type">
                    <select className="select" value={draft.locationType || ''} onChange={(e) => setDraft({ ...draft, locationType: e.target.value })} disabled={!editable}>
                      {draft.locationType && !LOCATION_TYPES.includes(draft.locationType) && <option>{draft.locationType}</option>}
                      {LOCATION_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Code" required>
                    <input className="input mono" value={draft.locationCode || ''} onChange={(e) => setDraft({ ...draft, locationCode: e.target.value })} disabled={!editable} />
                  </Field>
                  <Field label="Parent location">
                    <select className="select" value={draft.parentLocationId ?? ''} onChange={(e) => changeParent(e.target.value)} disabled={!editable}>
                      <option value="">— Top level (Company) —</option>
                      {locations
                        .filter((l) => !draft.locationId || !descendantIds(String(draft.locationId), locations).includes(l._id))
                        .map((l) => (
                          <option key={l._id} value={l.locationId}>
                            {pathOf(l._id, locations)}
                          </option>
                        ))}
                    </select>
                  </Field>
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
                    {!draft.locationId && (
                      <button className="btn" onClick={() => setDraft(selected ? toDraft(selected) : null)}>
                        Cancel
                      </button>
                    )}
                    <button className="btn btn-primary" onClick={save} disabled={saving || !draft.locationName?.trim() || !draft.locationCode?.trim()}>
                      {draft.locationId ? 'Save changes' : 'Create location'}
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
        title="Delete location?"
        danger={!blocked}
        confirmText={blocked ? 'OK' : 'Delete'}
        message={blocked ? 'This location still has sub-locations or assets. Move them first.' : `Delete "${draft?.locationName}"? This cannot be undone.`}
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (blocked || !draft?.locationId) return setConfirmDel(false);
          try {
            await locationApi.remove(draft.locationId);
            toast.success('Deleted');
            setSelectedId(null);
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

const STATUS_TONE: Record<string, string> = { Active: 'green', 'In Store': 'blue', 'In Repair': 'amber', 'Under Maintenance': 'amber', Missing: 'red', Damaged: 'red', Retired: 'slate', Disposed: 'slate' };

// Everything under the selected location at a glance: what it contains, asset status mix and a per-child breakdown.
function LocationSummary({ rootId, locations, assets, onSelect }: { rootId: string; locations: LocationNode[]; assets: ApiAsset[]; onSelect: (id: string) => void }) {
  const summary = useMemo(() => {
    const ids = new Set(descendantIds(rootId, locations));
    const inside = locations.filter((l) => ids.has(l._id) && l._id !== rootId);
    const byType: Record<string, number> = {};
    inside.forEach((l) => (byType[l.type] = (byType[l.type] || 0) + 1));
    const forLocation = (locId: string) => {
      const sub = new Set(descendantIds(locId, locations).map(Number));
      const list = assets.filter((a) => a.locationId && sub.has(a.locationId));
      return { count: list.length, value: list.reduce((s, a) => s + (a.purchaseCost || 0), 0), list };
    };
    const here = forLocation(rootId);
    const status: Record<string, number> = {};
    here.list.forEach((a) => (status[a.status || 'Unknown'] = (status[a.status || 'Unknown'] || 0) + 1));
    const assigned = here.list.filter((a) => a.assignedTo).length;
    const direct = locations
      .filter((l) => l.parent === rootId)
      .map((l) => {
        const x = forLocation(l._id);
        const sub = descendantIds(l._id, locations).length - 1;
        return { l, sub, count: x.count, value: x.value, attention: x.list.filter((a) => ['In Repair', 'Under Maintenance', 'Missing', 'Damaged'].includes(a.status || '')).length };
      });
    return { byType, status, here, assigned, direct };
  }, [rootId, locations, assets]);

  return (
    <Card title="Location summary" subtitle="Contents, asset status and sub-locations">
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          {Object.entries(summary.byType).length === 0 && <span className="small muted">No sub-locations</span>}
          {Object.entries(summary.byType).map(([t, n]) => (
            <span key={t} className="chip">
              {n} {t.toLowerCase()}{n === 1 ? '' : 's'}
            </span>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="chip">{summary.here.count} assets</span>
          <span className="chip">{summary.assigned} assigned to employees</span>
          <span className="chip">{summary.here.count - summary.assigned} unassigned</span>
          {Object.entries(summary.status).map(([s, n]) => (
            <span key={s} className={`badge badge-${STATUS_TONE[s] || 'slate'}`}>{s}: {n}</span>
          ))}
        </div>
        {summary.direct.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sub-location</th>
                  <th className="right">Contains</th>
                  <th className="right">Assets</th>
                  <th className="right">Needs attention</th>
                  <th className="right">Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.direct.map(({ l, sub, count, value, attention }) => (
                  <tr key={l._id} className="clickable" onClick={() => onSelect(l._id)}>
                    <td>
                      <div className="cell-main">{l.name}</div>
                      <div className="cell-sub">{l.type}</div>
                    </td>
                    <td className="right">{sub ? `${sub} below` : '—'}</td>
                    <td className="right">{count}</td>
                    <td className="right">{attention ? <b className="neg">{attention}</b> : '—'}</td>
                    <td className="right">{money(value, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
