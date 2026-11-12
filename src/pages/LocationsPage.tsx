import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building, Crosshair, LayoutGrid, Layers, MapPin, Pencil, Plus, Square, Trash2 } from 'lucide-react';
import { ApiAsset, ApiLocation, ApiSubLocation, SUB_LOCATION_TYPES, assetApi, locationApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { LocationNode, useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../lib/hooks';
import { money, num } from '../lib/format';
import { pathOf } from '../lib/tree';
import { Card, Confirm, Empty, Field, Kpi, PageHeader, SearchInput, Switch, Tabs } from '../components/ui';
import { DepartmentPicker } from '../components/pickers';

type Tab = 'location' | 'sublocation' | 'room';

type LocationDraft = Partial<ApiLocation>;
type SubDraft = Partial<ApiSubLocation> & { _parentName?: string };

const TAB_META: Record<Tab, { label: string; singular: string; type: string }> = {
  location: { label: 'Location', singular: 'location', type: 'Location' },
  sublocation: { label: 'Sublocation', singular: 'sublocation', type: 'Area' },
  room: { label: 'Room', singular: 'room', type: 'Room' },
};

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
  const [locDraft, setLocDraft] = useState<LocationDraft | null>(null);
  const [subDraft, setSubDraft] = useState<SubDraft | null>(null);
  const [parentText, setParentText] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: assets } = useFetch(() => assetApi.list().catch(() => [] as ApiAsset[]), []);

  const locationRows = useMemo(() => locations.filter((l) => l.kind === 'location'), [locations]);
  const subRows = useMemo(() => {
    const list = locations.filter((l) => l.kind === 'sublocation');
    if (tab === 'room') return list.filter((l) => l.type.toLowerCase() === 'room');
    if (tab === 'sublocation') return list.filter((l) => l.type.toLowerCase() !== 'room');
    return list;
  }, [locations, tab]);

  const tabRows = tab === 'location' ? locationRows : subRows;

  const filtered = useMemo(() => {
    if (!filter.trim()) return tabRows;
    const s = filter.toLowerCase();
    return tabRows.filter((l) => [l.name, l.code, l.type, l.description, l.branchCode, l.branchName].some((x) => x?.toLowerCase().includes(s)));
  }, [tabRows, filter]);

  const parentPool = useMemo(() => {
    if (tab === 'location') return [];
    if (tab === 'room') return locations.filter((l) => l.kind === 'sublocation' && l.type.toLowerCase() !== 'room');
    return locationRows;
  }, [tab, locations, locationRows]);

  const typeCounts = useMemo(
    () => ({
      location: locationRows.length,
      sublocation: locations.filter((l) => l.kind === 'sublocation' && l.type.toLowerCase() !== 'room').length,
      room: locations.filter((l) => l.kind === 'sublocation' && l.type.toLowerCase() === 'room').length,
    }),
    [locations, locationRows]
  );

  const activeId = tab === 'location' ? locDraft?.locationId : subDraft?.subLocationId;

  const childCount = useMemo(() => {
    if (tab === 'location' && locDraft?.locationId) {
      return locations.filter((l) => l.kind === 'sublocation' && l.locationId === locDraft.locationId).length;
    }
    if (subDraft?.subLocationId) {
      return locations.filter((l) => l.kind === 'sublocation' && l.parent === `s${subDraft.subLocationId}`).length;
    }
    return 0;
  }, [tab, locDraft?.locationId, subDraft?.subLocationId, locations]);

  const stats = useMemo(() => {
    if (tab === 'location' && locDraft?.locationId) {
      const here = (assets || []).filter((a) => a.locationId === locDraft.locationId);
      return { count: here.length, value: here.reduce((s, a) => s + (a.purchaseCost || 0), 0) };
    }
    if (subDraft?.subLocationId) {
      const here = (assets || []).filter((a) => a.subLocationId === subDraft.subLocationId);
      return { count: here.length, value: here.reduce((s, a) => s + (a.purchaseCost || 0), 0) };
    }
    return { count: 0, value: 0 };
  }, [tab, locDraft?.locationId, subDraft?.subLocationId, assets]);

  const switchTab = (next: string) => {
    setParams({ tab: next });
    setFilter('');
    setLocDraft(null);
    setSubDraft(null);
    setParentText('');
    setConfirmDel(false);
  };

  const openEdit = async (row: LocationNode) => {
    try {
      if (row.kind === 'location') {
        const fresh = await locationApi.get(row.locationId);
        setLocDraft(fresh || row);
        setSubDraft(null);
        setParentText('');
      } else {
        const id = row.subLocationId!;
        const fresh = await locationApi.getSublocation(id);
        setSubDraft(fresh);
        setLocDraft(null);
        const parent =
          fresh.parentSubLocationId != null
            ? allLocations.find((l) => l.kind === 'sublocation' && l.subLocationId === fresh.parentSubLocationId)
            : allLocations.find((l) => l.kind === 'location' && l.locationId === fresh.locationId);
        setParentText(parent?.name || '');
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const startNew = () => {
    if (tab === 'location') {
      setLocDraft({
        locationName: '',
        locationCode: '',
        branchCode: '',
        branchName: '',
        locationType: 'Site',
        isActive: true,
      });
      setSubDraft(null);
      setParentText('');
    } else {
      setSubDraft({
        subLocationName: '',
        subLocationCode: '',
        subLocationType: meta.type,
        parentSubLocationId: null,
        isActive: true,
      });
      setLocDraft(null);
      setParentText(activeBranch?.name || '');
    }
  };

  const resolveParent = () => {
    if (tab === 'location') return { ok: true as const };
    if (!parentText.trim()) {
      toast.error(tab === 'room' ? 'Parent sublocation is required' : 'Parent location is required');
      return { ok: false as const };
    }
    const match = findByName(parentText, parentPool);
    if (match.status === 'one') {
      if (tab === 'room') {
        return { ok: true as const, locationId: match.item.locationId, parentSubLocationId: match.item.subLocationId ?? null };
      }
      return { ok: true as const, locationId: match.item.locationId, parentSubLocationId: null };
    }
    if (match.status === 'many') {
      toast.error(`More than one match for "${parentText.trim()}". Type the exact name or code.`);
      return { ok: false as const };
    }
    toast.error(`No parent matches "${parentText.trim()}".`);
    return { ok: false as const };
  };

  const save = async () => {
    if (tab === 'location') {
      if (!locDraft?.locationName?.trim()) return;
      if (!locDraft.locationCode?.trim()) return toast.error('Code is required');
    } else {
      if (!subDraft?.subLocationName?.trim()) return;
      if (!subDraft.subLocationCode?.trim()) return toast.error('Code is required');
      const parent = resolveParent();
      if (!parent.ok) return;
    }

    setSaving(true);
    try {
      if (tab === 'location' && locDraft) {
        const body: Partial<ApiLocation> = {
          ...locDraft,
          locationName: locDraft.locationName!.trim(),
          locationCode: locDraft.locationCode!.trim(),
          branchCode: (locDraft.branchCode || locDraft.locationCode)!.trim(),
          branchName: (locDraft.branchName || locDraft.locationName)!.trim(),
          locationType: locDraft.locationType || 'Site',
          latitude: locDraft.latitude === null || locDraft.latitude === undefined || String(locDraft.latitude) === '' ? null : Number(locDraft.latitude),
          longitude: locDraft.longitude === null || locDraft.longitude === undefined || String(locDraft.longitude) === '' ? null : Number(locDraft.longitude),
          isActive: locDraft.isActive !== false,
        };
        if (locDraft.locationId) {
          await locationApi.update(locDraft.locationId, body);
          toast.success('Location saved');
        } else {
          const created = await locationApi.create(body);
          toast.success('Location created');
          if (created?.locationId) setLocDraft(await locationApi.get(created.locationId).catch(() => created));
        }
      } else if (subDraft) {
        const parent = resolveParent();
        if (!parent.ok) return;
        const body: Partial<ApiSubLocation> = {
          ...subDraft,
          subLocationName: subDraft.subLocationName!.trim(),
          subLocationCode: subDraft.subLocationCode!.trim(),
          subLocationType: tab === 'room' ? 'Room' : subDraft.subLocationType || 'Area',
          locationId: parent.locationId!,
          parentSubLocationId: parent.parentSubLocationId ?? null,
          latitude: subDraft.latitude === null || subDraft.latitude === undefined || String(subDraft.latitude) === '' ? null : Number(subDraft.latitude),
          longitude: subDraft.longitude === null || subDraft.longitude === undefined || String(subDraft.longitude) === '' ? null : Number(subDraft.longitude),
          isActive: subDraft.isActive !== false,
        };
        if (subDraft.subLocationId) {
          await locationApi.updateSublocation(subDraft.subLocationId, body);
          toast.success(`${meta.label} saved`);
        } else {
          const created = await locationApi.createSublocation(parent.locationId!, body);
          toast.success(`${meta.label} created`);
          if (created?.subLocationId) setSubDraft(await locationApi.getSublocation(created.subLocationId).catch(() => created));
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
      (p) => {
        const lat = Number(p.coords.latitude.toFixed(6));
        const lng = Number(p.coords.longitude.toFixed(6));
        if (tab === 'location') setLocDraft((d) => ({ ...d, latitude: lat, longitude: lng }));
        else setSubDraft((d) => ({ ...d, latitude: lat, longitude: lng }));
      },
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

  const editable = can('locations', activeId ? 'edit' : 'create');
  const draftName = tab === 'location' ? locDraft?.locationName : subDraft?.subLocationName;
  const draftCode = tab === 'location' ? locDraft?.locationCode : subDraft?.subLocationCode;
  const draftLat = tab === 'location' ? locDraft?.latitude : subDraft?.latitude;
  const draftLng = tab === 'location' ? locDraft?.longitude : subDraft?.longitude;
  const hasDraft = tab === 'location' ? Boolean(locDraft) : Boolean(subDraft);

  return (
    <>
      <PageHeader
        title="Location Management"
        subtitle={activeBranch ? `Branch: ${activeBranch.name}` : 'Manage locations, sublocations and rooms (Swagger-aligned)'}
        actions={can('locations', 'create') && (
          <button className="btn btn-primary" onClick={startNew}>
            <Plus size={16} /> Add {meta.singular}
          </button>
        )}
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
        <div className="card loc-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="loc-panel-head">
            <div>
              <h3>Available {meta.label}s</h3>
              <div className="muted">{filtered.length} of {tabRows.length} shown</div>
            </div>
            {can('locations', 'create') && (
              <button className="btn btn-sm" onClick={startNew} title={`Add ${meta.singular}`}>
                <Plus size={14} />
              </button>
            )}
          </div>
          <div className="loc-panel-search">
            <SearchInput value={filter} onChange={setFilter} placeholder={`Search ${meta.singular}s…`} />
          </div>
          <div className="loc-list">
            {filtered.length === 0 ? (
              <Empty
                title={`No ${meta.singular}s yet`}
                message={`Add a ${meta.singular} using the button above.`}
                action={can('locations', 'create') && (
                  <button className="btn btn-sm btn-primary" onClick={startNew}>
                    <Plus size={14} /> Add {meta.singular}
                  </button>
                )}
              />
            ) : (
              filtered.map((l) => {
                const selected =
                  tab === 'location' ? locDraft?.locationId === l.locationId && l.kind === 'location' : subDraft?.subLocationId === l.subLocationId;
                const assetCount =
                  l.kind === 'location'
                    ? (assets || []).filter((a) => a.locationId === l.locationId).length
                    : (assets || []).filter((a) => a.subLocationId === l.subLocationId).length;
                const parentPath = l.parent ? pathOf(l.parent, allLocations) : '';
                const Icon = l.kind === 'location' ? MapPin : l.type.toLowerCase() === 'room' ? Square : LayoutGrid;
                return (
                  <button
                    key={l._id}
                    type="button"
                    className={`loc-row ${selected ? 'selected' : ''} ${l.active === false ? 'loc-row-inactive' : ''}`}
                    onClick={() => openEdit(l)}
                  >
                    <div className="loc-row-icon">
                      <Icon size={18} />
                    </div>
                    <div className="loc-row-body">
                      <div className="loc-row-title ellipsis">{l.name || '(unnamed)'}</div>
                      <div className="loc-row-meta">
                        <span className="loc-row-code">{l.code || '—'}</span>
                        {l.kind === 'location' && l.branchCode && l.branchCode !== l.code && (
                          <span className="loc-row-code">{l.branchCode}</span>
                        )}
                        <span className="chip" style={{ padding: '1px 7px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l.type || meta.type}</span>
                      </div>
                      {parentPath && <div className="loc-row-path" title={parentPath}>{parentPath}</div>}
                    </div>
                    <div className="loc-row-side">
                      <span className="loc-row-count">{assetCount} asset{assetCount === 1 ? '' : 's'}</span>
                      {can('locations', 'edit') && <Pencil size={13} className="faint" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="span-2 stack" style={{ gap: 18 }}>
          {!hasDraft ? (
            <Card>
              <Empty icon={<MapPin size={24} />} title={`Select a ${meta.singular}`} message={`Or add a new ${meta.singular}.`} />
            </Card>
          ) : (
            <>
              {activeId && (
                <div className="grid grid-3">
                  <Kpi label="Assets here" value={num(stats.count)} icon={<LayoutGrid size={19} />} />
                  <Kpi label="Asset value" value={money(stats.value, { compact: true })} icon={<Building size={19} />} toneName="purple" />
                  <Kpi label="Children" value={childCount} icon={<Layers size={19} />} toneName="cyan" />
                </div>
              )}
              <Card
                title={activeId ? draftName || '(unnamed)' : `New ${meta.singular}`}
                subtitle={tab === 'location' ? 'Location / branch' : meta.type}
                actions={
                  activeId && (
                    <>
                      {tab === 'location' && locDraft?.locationId && (
                        <Link className="btn btn-sm" to={`/assets?location=${locDraft.locationId}`}>
                          View assets
                        </Link>
                      )}
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
                  {tab === 'location' ? (
                    <>
                      <Field label="Name" required>
                        <input
                          className="input"
                          value={locDraft?.locationName || ''}
                          onChange={(e) => setLocDraft({ ...locDraft!, locationName: e.target.value, branchName: locDraft?.branchName || e.target.value })}
                          disabled={!editable}
                          autoFocus={!locDraft?.locationId}
                        />
                      </Field>
                      <Field label="Code" required>
                        <input
                          className="input mono"
                          value={locDraft?.locationCode || ''}
                          onChange={(e) => setLocDraft({ ...locDraft!, locationCode: e.target.value, branchCode: locDraft?.branchCode || e.target.value })}
                          disabled={!editable}
                        />
                      </Field>
                      <Field label="Branch code" required>
                        <input className="input mono" value={locDraft?.branchCode || ''} onChange={(e) => setLocDraft({ ...locDraft!, branchCode: e.target.value })} disabled={!editable} />
                      </Field>
                      <Field label="Branch name" required>
                        <input className="input" value={locDraft?.branchName || ''} onChange={(e) => setLocDraft({ ...locDraft!, branchName: e.target.value })} disabled={!editable} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Name" required>
                        <input
                          className="input"
                          value={subDraft?.subLocationName || ''}
                          onChange={(e) => setSubDraft({ ...subDraft!, subLocationName: e.target.value })}
                          disabled={!editable}
                          autoFocus={!subDraft?.subLocationId}
                        />
                      </Field>
                      <Field label="Code" required>
                        <input className="input mono" value={subDraft?.subLocationCode || ''} onChange={(e) => setSubDraft({ ...subDraft!, subLocationCode: e.target.value })} disabled={!editable} />
                      </Field>
                      <Field label="Type" required>
                        <select
                          className="input"
                          value={subDraft?.subLocationType || meta.type}
                          onChange={(e) => setSubDraft({ ...subDraft!, subLocationType: e.target.value })}
                          disabled={!editable || tab === 'room'}
                        >
                          {(tab === 'room' ? ['Room'] : SUB_LOCATION_TYPES).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={tab === 'room' ? 'Parent sublocation' : 'Parent location'} required hint="Type a saved name or code." className="full">
                        <input className="input" list={`${tab}-parent-options`} value={parentText} onChange={(e) => setParentText(e.target.value)} disabled={!editable} />
                        <datalist id={`${tab}-parent-options`}>
                          {parentPool.map((l) => (
                            <option key={l._id} value={l.name} />
                          ))}
                        </datalist>
                      </Field>
                    </>
                  )}
                  <Field label="Department">
                    <DepartmentPicker
                      value={(tab === 'location' ? locDraft?.departmentId : subDraft?.departmentId) ? String(tab === 'location' ? locDraft?.departmentId : subDraft?.departmentId) : null}
                      onChange={(v) => {
                        const id = v ? Number(v) : null;
                        if (tab === 'location') setLocDraft({ ...locDraft!, departmentId: id });
                        else setSubDraft({ ...subDraft!, departmentId: id });
                      }}
                    />
                  </Field>
                  <Field label="Cost center">
                    <input
                      className="input"
                      value={(tab === 'location' ? locDraft?.costCenter : subDraft?.costCenter) || ''}
                      onChange={(e) => {
                        if (tab === 'location') setLocDraft({ ...locDraft!, costCenter: e.target.value });
                        else setSubDraft({ ...subDraft!, costCenter: e.target.value });
                      }}
                      disabled={!editable}
                    />
                  </Field>
                  <Field label="GPS latitude">
                    <input
                      className="input"
                      value={draftLat ?? ''}
                      onChange={(e) => {
                        if (tab === 'location') setLocDraft({ ...locDraft!, latitude: e.target.value as any });
                        else setSubDraft({ ...subDraft!, latitude: e.target.value as any });
                      }}
                      disabled={!editable}
                    />
                  </Field>
                  <Field label="GPS longitude">
                    <div className="row">
                      <input
                        className="input"
                        value={draftLng ?? ''}
                        onChange={(e) => {
                          if (tab === 'location') setLocDraft({ ...locDraft!, longitude: e.target.value as any });
                          else setSubDraft({ ...subDraft!, longitude: e.target.value as any });
                        }}
                        disabled={!editable}
                      />
                      {editable && (
                        <button type="button" className="btn btn-icon" title="Use my location" onClick={captureGps}>
                          <Crosshair size={15} />
                        </button>
                      )}
                    </div>
                  </Field>
                  <Field label="Description" className="full">
                    <textarea
                      className="textarea"
                      value={(tab === 'location' ? locDraft?.description : subDraft?.description) || ''}
                      onChange={(e) => {
                        if (tab === 'location') setLocDraft({ ...locDraft!, description: e.target.value });
                        else setSubDraft({ ...subDraft!, description: e.target.value });
                      }}
                      disabled={!editable}
                    />
                  </Field>
                  <label className="row small" style={{ gap: 10 }}>
                    <Switch
                      checked={(tab === 'location' ? locDraft?.isActive : subDraft?.isActive) !== false}
                      onChange={(v) => {
                        if (tab === 'location') setLocDraft({ ...locDraft!, isActive: v });
                        else setSubDraft({ ...subDraft!, isActive: v });
                      }}
                      disabled={!editable}
                    />{' '}
                    Active
                  </label>
                </div>
                {draftLat && draftLng ? (
                  <a className="small" href={`https://maps.google.com/?q=${draftLat},${draftLng}`} target="_blank" rel="noreferrer">
                    <MapPin size={13} /> Open in Google Maps
                  </a>
                ) : null}
                {editable && (
                  <div className="row mt" style={{ justifyContent: 'flex-end' }}>
                    {!activeId && (
                      <button
                        className="btn"
                        onClick={() => {
                          setLocDraft(null);
                          setSubDraft(null);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <button className="btn btn-primary" onClick={save} disabled={saving || !draftName?.trim() || !draftCode?.trim()}>
                      {activeId ? 'Save changes' : `Create ${meta.singular}`}
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
        danger={!(stats.count > 0)}
        confirmText={stats.count > 0 ? 'OK' : childCount > 0 ? 'Delete with children' : 'Delete'}
        message={
          stats.count > 0
            ? `This ${meta.singular} still has ${stats.count} asset(s). Move or delete those assets first.`
            : childCount > 0
              ? `Delete "${draftName}" and its ${childCount} child sublocation(s)? This cannot be undone.`
              : `Delete "${draftName}"? This cannot be undone.`
        }
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (!activeId) return setConfirmDel(false);
          if (stats.count > 0) return setConfirmDel(false);
          try {
            if (tab === 'location') await locationApi.remove(activeId);
            else await locationApi.removeSublocation(activeId);
            toast.success('Deleted');
            setLocDraft(null);
            setSubDraft(null);
            await reload(['locations']);
            setConfirmDel(false);
          } catch (err) {
            toast.error(err);
            throw err;
          }
        }}
      />
    </>
  );
}
