import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Play, ScanLine } from 'lucide-react';
import { auditApi, reportApi } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date, dateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { Card, Confirm, Empty, ErrorState, Field, KV, Loading, PageHeader, StatusBadge, Switch, Tabs } from '../../components/ui';
import { LocationPicker } from '../../components/pickers';
import { Scanner } from '../../components/Scanner';
import { AutoView } from '../../components/AutoData';
import { isCompleted, isRunning } from './AuditsPage';

const SCAN_TYPES = ['QR', 'Barcode', 'RFID', 'Manual'];

export default function AuditDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'assets';
  const toast = useToast();
  const { can } = useAuth();
  const names = useNames();
  const { data: list, loading, error, reload } = useFetch(() => auditApi.campaigns(), [id]);
  const [busy, setBusy] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const a = list?.find((x) => String(x.auditId) === id);

  if (loading && !list) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!a) return <ErrorState message="Audit campaign not found" />;

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
      setConfirmComplete(false);
    }
  };

  const completed = isCompleted(a.status);
  const running = isRunning(a.status);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Audits', to: '/audits' }, { label: a.auditCode }]}
        title={a.auditName}
        subtitle={
          <span className="row wrap" style={{ gap: 8 }}>
            <span className="mono">{a.auditCode}</span>
            <StatusBadge status={a.status || 'Planned'} />
          </span>
        }
        actions={
          can('audits', 'edit') && (
            <>
              {!running && !completed && (
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => auditApi.start(a.auditId), 'Audit started')}>
                  <Play size={16} /> Start audit
                </button>
              )}
              {!completed && (
                <button className={`btn ${running ? 'btn-primary' : ''}`} disabled={busy} onClick={() => setConfirmComplete(true)}>
                  <CheckCircle2 size={16} /> Complete
                </button>
              )}
            </>
          )
        }
      />
      <Card>
        <KV
          items={[
            ['Site', names.location(a.siteId)],
            ['Area', a.areaId ? names.location(a.areaId) : 'Whole site'],
            ['Auditor', names.user(a.assignedTo)],
            ['Start', date(a.startDate)],
            ['Due', date(a.endDate)],
            ['Completed', a.completedDate ? dateTime(a.completedDate) : null],
            ['Created by', names.user(a.createdBy)],
            ['Remarks', a.remarks],
          ]}
        />
      </Card>
      <div className="card mt">
        <Tabs
          active={tab}
          onChange={(t) => setParams(t === 'assets' ? {} : { tab: t }, { replace: true })}
          tabs={[
            { key: 'assets', label: 'Assets in scope' },
            ...(!completed ? [{ key: 'scan', label: 'Scan', icon: <ScanLine size={15} /> }] : []),
            { key: 'history', label: 'Scan history' },
            { key: 'report', label: 'Report' },
            { key: 'discrepancies', label: 'Discrepancies' },
          ]}
        />
        <div className="card-body">
          {tab === 'assets' && <Remote load={() => auditApi.assets(a.auditId)} deps={[a.auditId, refresh]} empty="No assets in scope yet. Start the audit to load assets for this site." />}
          {tab === 'scan' && <ScanPanel auditId={a.auditId} running={running} onScanned={() => setRefresh((n) => n + 1)} />}
          {tab === 'history' && <Remote load={() => auditApi.scanHistory(a.auditId)} deps={[a.auditId, refresh]} empty="No scans recorded yet." />}
          {tab === 'report' && <Remote load={() => auditApi.report(a.auditId)} deps={[a.auditId, refresh]} empty="The report is available once scanning has started." />}
          {tab === 'discrepancies' && <Remote load={() => reportApi.auditDiscrepancies(a.auditId)} deps={[a.auditId, refresh]} empty="No discrepancies found." />}
        </div>
      </div>
      <Confirm
        open={confirmComplete}
        title="Complete audit?"
        message="Closing the audit finalises the results. Assets that were not scanned are reported as discrepancies."
        confirmText="Complete audit"
        busy={busy}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => act(() => auditApi.complete(a.auditId), 'Audit completed')}
      />
    </>
  );
}

function Remote({ load, deps, empty }: { load: () => Promise<any>; deps: any[]; empty: string }) {
  const { data, loading, error, reload } = useFetch(load, deps);
  if (loading && data === null) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <AutoView data={data} empty={<Empty title={empty} />} />;
}

function ScanPanel({ auditId, running, onScanned }: { auditId: number; running: boolean; onScanned: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [scanType, setScanType] = useState('QR');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ code: string; at: string; result: any; ok: boolean }[]>([]);

  const scan = async (raw: string) => {
    const code = raw.trim();
    if (!code || busy) return;
    if (!locationId) return toast.error('Select the location you are scanning at');
    setBusy(true);
    try {
      const result = await auditApi.scan({ auditId, scanCode: code, scanType, scannedLocationId: locationId ? Number(locationId) : null, scannedBy: user?.userId || null, remarks: remarks || null });
      setResults((r) => [{ code, at: new Date().toISOString(), result, ok: true }, ...r].slice(0, 30));
      onScanned();
    } catch (err: any) {
      setResults((r) => [{ code, at: new Date().toISOString(), result: err?.message || 'Scan failed', ok: false }, ...r].slice(0, 30));
      toast.error(err);
    } finally {
      setBusy(false);
      setManual('');
    }
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        {!running && <div className="alert alert-warn">Start the audit before scanning so the asset list is loaded.</div>}
        <div className="form-grid">
          <Field label="Scan type">
            <select className="select" value={scanType} onChange={(e) => setScanType(e.target.value)}>
              {SCAN_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Scanned at location" required>
            <LocationPicker value={locationId} onChange={setLocationId} placeholder="Where are you scanning?" />
          </Field>
          <Field label="Remarks" className="full">
            <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional, applied to each scan" />
          </Field>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            scan(manual);
          }}
        >
          <input className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or scan asset code / QR / RFID, then Enter" autoFocus />
          <button className="btn btn-primary" disabled={busy || !manual.trim()}>Record</button>
        </form>
        <label className="row small" style={{ gap: 10 }}>
          <Switch checked={camera} onChange={setCamera} /> Use camera
        </label>
        {camera && <Scanner onScan={scan} paused={busy} />}
      </div>
      <div>
        <h4 className="small bold" style={{ marginBottom: 10 }}>This session</h4>
        {results.length === 0 ? (
          <Empty title="No scans yet" message="Scanned codes and the backend's result appear here." />
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {results.map((r, i) => (
              <div key={i} className={`alert ${r.ok ? 'alert-success' : 'alert-danger'}`}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row-between">
                    <b className="mono">{r.code}</b>
                    <span className="xs muted">{dateTime(r.at)}</span>
                  </div>
                  <div className="xs" style={{ marginTop: 4 }}>
                    {typeof r.result === 'string' ? r.result : r.result?.scanResult || r.result?.message || r.result?.result || 'Recorded'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
