import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, MapPin, Play, ScanLine } from 'lucide-react';
import { ApiAsset, assetApi, auditApi, nowIso, reportApi } from '../api/assetApi';
import { getQueue, mutate } from '../api/offline';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useNames } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { extractCode, findAsset } from '../lib/assetLookup';
import { date, dateTime, daysUntil } from '../lib/format';
import { tryGpsText } from '../lib/geo';
import { useFetch } from '../lib/hooks';
import { Confirm, Empty, ErrorState, Field, Loading, Modal, Segmented, StatusBadge } from '../components/ui';
import { LocationPicker } from '../components/pickers';
import { AutoView } from '../components/AutoData';
import { Scanner } from '../components/Scanner';
import { isCompleted, isRunning } from '../pages/audits/AuditsPage';
import { AssetScanSelect, PhotoPicker, Top, useOutbox } from './kit';
import { addInspection, newId, useInspections, useSettings } from './deviceStore';

const CONDITIONS = ['Good', 'Damaged', 'Faulty', 'Missing'] as const;
const CONDITION_TONE: Record<string, string> = { Good: 'green', Damaged: 'red', Faulty: 'amber', Missing: 'slate' };
const CONDITION_STATUS: Record<string, string> = { Damaged: 'Damaged', Faulty: 'In Repair', Missing: 'Missing' };
const CHECKLIST = ['Asset present at the recorded location', 'Asset tag / label readable', 'Physical condition acceptable', 'Powers on / working normally', 'Accessories complete'];

// ---------- list ----------

export function MInspection() {
  const { user } = useAuth();
  const names = useNames();
  const { inScope } = useBranch();
  const inspections = useInspections();
  const [mine, setMine] = useState('mine');
  const [tab, setTab] = useState('active');
  const { data, loading, error, reload } = useFetch(() => auditApi.campaigns(), []);

  const list = useMemo(
    () =>
      (data || [])
        .filter((a) => inScope(a.siteId))
        .filter((a) => mine === 'all' || a.assignedTo === user?.userId)
        .filter((a) => (tab === 'active' ? !isCompleted(a.status) : isCompleted(a.status)))
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
    [data, inScope, mine, tab, user]
  );

  if (error && !data) return <><Top title="Asset inspection" back /><div className="m-body"><ErrorState message={error} onRetry={reload} /></div></>;

  return (
    <>
      <Top title="Asset inspection" sub="Physical audits and verification" back />
      <div className="m-body">
        <div className="stack" style={{ gap: 8 }}>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active' }, { value: 'done', label: 'Completed' }]} />
          <Segmented value={mine} onChange={setMine} options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'all', label: 'All audits' }]} />
        </div>
        <div style={{ marginTop: 12 }}>
          {loading && !data ? <Loading /> : list.length === 0 ? (
            <Empty icon={<ClipboardCheck size={24} />} title="No audits here" message={mine === 'mine' ? 'Audits assigned to you appear here. Switch to “All audits” to see the rest.' : 'No audit campaigns match.'} />
          ) : (
            list.map((a) => {
              const d = daysUntil(a.endDate);
              const overdue = !isCompleted(a.status) && d !== null && d < 0;
              return (
                <Link key={a.auditId} to={`/m/inspection/${a.auditId}`} className="m-card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                  <div className="row-between">
                    <b className="ellipsis">{a.auditName}</b>
                    <StatusBadge status={a.status || 'Planned'} />
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    <span className="mono">{a.auditCode}</span> · {names.location(a.siteId)}{a.areaId ? ` › ${names.location(a.areaId)}` : ''}
                  </div>
                  <div className="xs" style={{ marginTop: 6 }}>
                    <span className={overdue ? 'neg bold' : 'muted'}>{overdue ? 'Overdue · ' : 'Due '}{date(a.endDate)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
        {inspections.length > 0 && <div className="small muted center mt">{inspections.length} inspection{inspections.length === 1 ? '' : 's'} recorded on this device</div>}
      </div>
    </>
  );
}

// ---------- detail ----------

function Remote({ load, deps, empty }: { load: () => Promise<any>; deps: any[]; empty: string }) {
  const { data, loading, error, reload } = useFetch(load, deps);
  if (loading && data === null) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <AutoView data={data} empty={<Empty title={empty} />} />;
}

export function MAudit() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'inspect';
  const toast = useToast();
  const { can } = useAuth();
  const names = useNames();
  const { data: list, loading, error, reload } = useFetch(() => auditApi.campaigns(), [id]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const a = list?.find((x) => String(x.auditId) === id);

  if (loading && !list) return <><Top title="Audit" back /><Loading /></>;
  if (error || !a) return <><Top title="Audit" back /><div className="m-body"><ErrorState message={error || 'Audit not found'} onRetry={reload} /></div></>;

  const running = isRunning(a.status);
  const completed = isCompleted(a.status);
  const act = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      await reload();
      setRefresh((n) => n + 1);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <Top title={a.auditName} sub={<span className="mono">{a.auditCode}</span>} back right={<StatusBadge status={a.status || 'Planned'} />} />
      <div className="m-body">
        <div className="m-card">
          <div className="m-row"><span>Site</span><span>{names.location(a.siteId)}</span></div>
          {a.areaId && <div className="m-row"><span>Area</span><span>{names.location(a.areaId)}</span></div>}
          <div className="m-row"><span>Auditor</span><span>{names.user(a.assignedTo) || '—'}</span></div>
          <div className="m-row"><span>Due</span><span>{date(a.endDate)}</span></div>
        </div>

        {can('audits', 'edit') && !completed && (
          <div className="row mt-sm" style={{ gap: 8 }}>
            {!running && <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => act(() => auditApi.start(a.auditId), 'Audit started')}><Play size={16} /> Start audit</button>}
            <button className={`btn ${running ? 'btn-primary' : ''}`} style={{ flex: 1 }} disabled={busy} onClick={() => setConfirm(true)}><CheckCircle2 size={16} /> Complete</button>
          </div>
        )}

        <div style={{ margin: '12px 0' }}>
          <Segmented
            value={tab}
            onChange={(t) => setParams(t === 'inspect' ? {} : { tab: t }, { replace: true })}
            options={[{ value: 'inspect', label: 'Inspect' }, { value: 'assets', label: 'Assets' }, { value: 'log', label: 'Log' }, { value: 'report', label: 'Report' }]}
          />
        </div>

        {tab === 'inspect' && (completed ? <Empty title="Audit completed" message="No more inspections can be recorded." /> : <InspectPanel auditId={a.auditId} auditName={a.auditName} running={running} defaultLocation={a.areaId || a.siteId} onDone={() => setRefresh((n) => n + 1)} />)}
        {tab === 'assets' && <Remote load={() => auditApi.assets(a.auditId)} deps={[a.auditId, refresh]} empty="No assets in scope yet. Start the audit to load them." />}
        {tab === 'log' && <LogPanel auditId={a.auditId} refresh={refresh} />}
        {tab === 'report' && (
          <div className="stack">
            <Remote load={() => auditApi.report(a.auditId)} deps={[a.auditId, refresh]} empty="The report is available once scanning has started." />
            <h4 className="small bold">Discrepancies</h4>
            <Remote load={() => reportApi.auditDiscrepancies(a.auditId)} deps={[a.auditId, refresh]} empty="No discrepancies found." />
          </div>
        )}
      </div>
      <Confirm open={confirm} title="Complete audit?" message="Closing the audit finalises the results. Assets that were not inspected are reported as discrepancies." confirmText="Complete audit" busy={busy} onClose={() => setConfirm(false)} onConfirm={() => act(() => auditApi.complete(a.auditId), 'Audit completed')} />
    </>
  );
}

// ---------- inspect ----------

interface Target {
  asset: ApiAsset | null;
  code: string;
  via: 'QR' | 'Manual';
}

function InspectPanel({ auditId, auditName, running, defaultLocation, onDone }: { auditId: number; auditName: string; running: boolean; defaultLocation: number | null; onDone: () => void }) {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  const resolve = async (raw: string, via: Target['via']) => {
    const code = extractCode(raw);
    if (!code) return;
    setBusy(true);
    try {
      const asset = await findAsset(code);
      setTarget({ asset, code: asset?.assetCode || code, via });
      setScanning(false);
      setManual('');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {!running && <div className="alert alert-warn">Start the audit first so the asset list is loaded.</div>}
      <button className="btn btn-primary btn-lg btn-block" onClick={() => setScanning(true)}><ScanLine size={18} /> Scan asset</button>
      <form className="row" onSubmit={(e) => (e.preventDefault(), resolve(manual, 'Manual'))}>
        <input className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or scan a code, then Go" />
        <button className="btn" disabled={busy || !manual.trim()}>Go</button>
      </form>
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>Or search the register</div>
        <AssetScanSelect value={null} onChange={(a) => a && setTarget({ asset: a, code: a.assetCode || String(a.assetId), via: 'Manual' })} />
      </div>
      <Modal open={scanning} onClose={() => setScanning(false)} title="Scan asset">
        {scanning && <Scanner onScan={(t) => resolve(t, 'QR')} paused={busy} />}
      </Modal>
      {target && <RecordSheet key={target.code} auditId={auditId} auditName={auditName} target={target} defaultLocation={defaultLocation} onClose={() => setTarget(null)} onDone={() => (setTarget(null), onDone())} />}
    </div>
  );
}

function RecordSheet({ auditId, auditName, target, defaultLocation, onClose, onDone }: { auditId: number; auditName: string; target: Target; defaultLocation: number | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const settings = useSettings();
  const names = useNames();
  const { asset } = target;
  const [condition, setCondition] = useState<string>('Good');
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => true));
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<string | null>(String(asset?.locationId || defaultLocation || '') || null);
  const [updateStatus, setUpdateStatus] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!asset && !location) return toast.error('Select where you found this tag');
    setBusy(true);
    try {
      const gps = settings.gps ? await tryGpsText() : '';
      const checklist = CHECKLIST.map((label, i) => ({ label, ok: checks[i] }));
      const failed = checklist.filter((c) => !c.ok).map((c) => c.label);
      // The API has no condition, checklist, GPS or photo fields on a scan, so they travel in the remarks.
      const text = [
        `Condition: ${condition}`,
        failed.length ? `Failed checks: ${failed.join('; ')}` : 'All checks passed',
        gps,
        photos.length ? `${photos.length} photo(s) kept on device` : '',
        `Inspector: ${user?.name}${user?.roleName ? ` (${user.roleName})` : ''}`,
        remarks.trim(),
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 480);
      const body = {
        scanLogId: 0,
        auditId,
        auditItemId: null,
        assetId: asset?.assetId ?? null,
        scanCode: target.code,
        scanType: target.via,
        scannedLocationId: location ? Number(location) : null,
        scannedBy: user?.userId ?? null,
        scannedDate: nowIso(),
        remarks: text,
      };
      const r = await mutate('POST', '/assetaudit/scan', body, `Inspection ${target.code}`);
      if (updateStatus && asset && CONDITION_STATUS[condition]) {
        await assetApi.update(asset.assetId, { ...asset, status: CONDITION_STATUS[condition], updatedDate: nowIso() }).catch((e) => toast.error(e));
      }
      addInspection({
        id: newId(),
        auditId,
        auditName,
        assetId: asset?.assetId ?? null,
        assetCode: target.code,
        assetName: asset?.assetName || 'Unregistered tag',
        condition,
        checklist,
        remarks: remarks.trim(),
        photos,
        gps,
        at: new Date().toISOString(),
        inspector: user?.name || '',
        queueId: r.queued ? getQueue().slice(-1)[0]?.id : undefined,
      });
      toast.success(r.queued ? 'Saved offline. It will sync when you are back online' : 'Inspection recorded');
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record inspection" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>Save inspection</button></>}>
      <div className="stack">
        <div className={`alert ${asset ? 'alert-info' : 'alert-warn'}`}>
          <div>
            <b>{asset ? asset.assetName || '(unnamed)' : 'Unregistered tag'}</b>
            <div className="xs mono">{target.code}</div>
            {asset && <div className="xs" style={{ marginTop: 2 }}>{names.location(asset.locationId) || 'No location'} · {asset.status}</div>}
            {!asset && <div className="xs" style={{ marginTop: 2 }}>No asset in the register matches this code. It will be logged as found.</div>}
          </div>
        </div>
        <Field label="Condition">
          <div className="row wrap" style={{ gap: 8 }}>
            {CONDITIONS.map((c) => (
              <button key={c} type="button" className={`btn ${condition === c ? `btn-${c === 'Good' ? 'success' : c === 'Missing' ? 'primary' : 'danger'}` : ''}`} onClick={() => setCondition(c)}>{c}</button>
            ))}
          </div>
        </Field>
        <div>
          <div className="small bold" style={{ marginBottom: 6 }}>Checklist</div>
          {CHECKLIST.map((label, i) => (
            <label key={label} className="checkbox small" style={{ display: 'flex', padding: '6px 0' }}>
              <input type="checkbox" checked={checks[i]} onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} /> {label}
            </label>
          ))}
        </div>
        <Field label={asset ? 'Found at' : 'Found at (required)'}><LocationPicker value={location} onChange={setLocation} /></Field>
        <Field label="Remarks"><textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        <PhotoPicker label="Photos" photos={photos} onChange={setPhotos} />
        {asset && CONDITION_STATUS[condition] && (
          <label className="checkbox small"><input type="checkbox" checked={updateStatus} onChange={(e) => setUpdateStatus(e.target.checked)} /> Also set the asset’s status to “{CONDITION_STATUS[condition]}”</label>
        )}
        <div className="xs muted"><MapPin size={11} /> Time, inspector{settings.gps ? ' and your location' : ''} are recorded with this inspection.</div>
      </div>
    </Modal>
  );
}

function LogPanel({ auditId, refresh }: { auditId: number; refresh: number }) {
  const entries = useInspections().filter((e) => e.auditId === auditId);
  const outbox = useOutbox();
  return (
    <div className="stack">
      <div className="small bold">Recorded on this device</div>
      {entries.length === 0 ? <Empty title="Nothing recorded yet" /> : entries.map((e) => (
        <div key={e.id} className="m-card">
          <div className="row-between">
            <b className="ellipsis">{e.assetName}</b>
            <span className={`badge badge-${CONDITION_TONE[e.condition] || 'slate'}`}>{e.condition}</span>
          </div>
          <div className="small muted"><span className="mono">{e.assetCode}</span> · {dateTime(e.at)}</div>
          {e.queueId && outbox.some((q) => q.id === e.queueId) && <div className="xs" style={{ color: 'var(--amber)', marginTop: 4 }}>Waiting to sync</div>}
          {e.gps && <div className="xs muted" style={{ marginTop: 4 }}><MapPin size={11} /> {e.gps}</div>}
          {e.photos.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{e.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }} />)}</div>}
        </div>
      ))}
      <div className="small bold" style={{ marginTop: 8 }}>Server scan history</div>
      <Remote load={() => auditApi.scanHistory(auditId)} deps={[auditId, refresh]} empty="No scans recorded yet." />
    </div>
  );
}
