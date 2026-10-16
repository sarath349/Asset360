import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Bell, CloudOff, CloudUpload, Grid2x2, Home, LogOut, Monitor, Package, RefreshCw, ScanLine, Trash2, Wrench } from 'lucide-react';
import { flushQueue, removeQueued } from '../api/offline';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { loadAssets } from '../lib/assetLookup';
import { ago, money } from '../lib/format';
import { useFetch } from '../lib/hooks';
import { Confirm, Empty, Field, Modal } from '../components/ui';
import { clearDeviceData, setSettings, useJobs, useSettings } from './deviceStore';
import { Guard, LocalNote, menuFor, StaleNote, Top, useMyEmployee, useOutbox } from './kit';
import { MAsset, MAssetForm, MHistory, MMine, MScan } from './MobileAssets';
import { MIncident, MJob, MJobNew, MMaintenance, MTransfer } from './MobileOps';
import { MAudit, MInspection } from './MobileInspection';
import { MNotifications, NotificationsProvider, useNotices } from './MobileNotifications';

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

// ---------- home ----------

function MHome() {
  const { user } = useAuth();
  const { activeBranch, inScope } = useBranch();
  const { unread } = useNotices();
  const jobs = useJobs();
  const { employee } = useMyEmployee();
  const outbox = useOutbox();
  const { data, loading } = useFetch(() => loadAssets(), []);

  const stats = useMemo(() => {
    const list = (data?.assets || []).filter((a) => inScope(a.locationId));
    const count = (f: (s: string) => boolean) => list.filter((a) => f((a.status || '').toLowerCase())).length;
    return {
      total: list.length,
      active: count((s) => s === 'active'),
      repair: count((s) => s.includes('repair') || s.includes('maintenance')),
      issues: count((s) => s === 'missing' || s === 'damaged'),
      mine: employee ? list.filter((a) => a.assignedTo === employee.employeeId).length : 0,
      value: list.reduce((n, a) => n + (Number(a.purchaseCost) || 0), 0),
    };
  }, [data, inScope, employee]);
  const openJobs = jobs.filter((j) => j.kind !== 'incident' && (j.status === 'Open' || j.status === 'In Progress')).length;
  const items = menuFor(user?.role).filter((m) => !['home', 'scan', 'profile'].includes(m.key));

  return (
    <>
      <Top title={`Hello, ${user?.name?.split(' ')[0] || 'there'}`} sub={`${user?.roleName || 'Admin'}${activeBranch ? ` · ${activeBranch.name}` : ''}`} right={<Link to="/m/notifications" className="m-back" aria-label="Notifications" style={{ position: 'relative' }}><Bell size={17} />{unread > 0 && <span className="badge badge-red" style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, padding: '0 5px' }}>{unread > 9 ? '9+' : unread}</span>}</Link>} />
      <div className="m-body">
        <StaleNote stale={!!data?.stale} />
        <Link to="/m/scan" className="m-card row" style={{ gap: 14, color: 'inherit', textDecoration: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderColor: 'transparent' }}>
          <div className="kpi-icon" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', width: 48, height: 48 }}><ScanLine size={24} /></div>
          <div style={{ color: '#fff' }}>
            <b style={{ fontSize: 16 }}>Scan an asset</b>
            <div style={{ fontSize: 12.5, opacity: 0.85 }}>Point the camera at a QR label to view, update or move it</div>
          </div>
        </Link>

        <div className="m-tiles" style={{ marginTop: 14 }}>
          {[
            { label: 'Assets', value: loading && !data ? '…' : stats.total, to: '/m/history', tone: 'indigo' },
            { label: 'Active', value: stats.active, to: '/m/history', tone: 'green' },
            { label: 'In repair / maintenance', value: stats.repair, to: '/m/maintenance', tone: 'amber' },
            { label: 'Missing / damaged', value: stats.issues, to: '/m/history', tone: 'red' },
          ].map((k) => (
            <Link key={k.label} to={k.to} className="m-tile">
              <span className={`kpi-icon tone-${k.tone}`} style={{ width: 34, height: 34 }}><Package size={16} /></span>
              <div><div style={{ fontSize: 24, fontWeight: 750 }}>{k.value}</div><div className="xs muted">{k.label}</div></div>
            </Link>
          ))}
        </div>
        <div className="xs muted center" style={{ marginTop: 8 }}>Purchase value {money(stats.value)}{activeBranch ? ` · ${activeBranch.name}` : ' · all branches'}</div>

        <div className="m-section-title">Today</div>
        <div className="m-card">
          <div className="m-row"><span>Assets assigned to me</span><span>{employee ? stats.mine : 'Link your employee in Profile'}</span></div>
          <div className="m-row"><span>Open maintenance tasks</span><span>{openJobs}</span></div>
          <div className="m-row"><span>Unread notifications</span><span>{unread}</span></div>
          <div className="m-row"><span>Waiting to sync</span><span>{outbox.length}</span></div>
        </div>

        <div className="m-section-title">Menu</div>
        <div className="m-actions">
          {items.map((m) => (
            <Link key={m.key} to={m.to} className="m-action" style={{ textDecoration: 'none' }}>{m.icon}<span style={{ textAlign: 'center' }}>{m.label}</span></Link>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- sync queue ----------

function MQueue() {
  const outbox = useOutbox();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true);
    const r = await flushQueue();
    setBusy(false);
    if (r.synced) toast.success(`${r.synced} item${r.synced === 1 ? '' : 's'} synced`);
    else if (r.failed) toast.error('Some items were rejected by the server. Check the message on each.');
    else toast.error(navigator.onLine ? 'Nothing to sync' : 'Still offline');
  };

  return (
    <>
      <Top title="Sync queue" sub={`${outbox.length} waiting`} back />
      <div className="m-body">
        {outbox.length === 0 ? <Empty icon={<CloudUpload size={24} />} title="Everything is synced" message="Changes made while offline wait here until you are back online." /> : (
          <>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={sync}><RefreshCw size={16} /> Sync now</button>
            <div style={{ marginTop: 12 }}>
              {outbox.map((q) => (
                <div key={q.id} className="m-card">
                  <div className="row-between"><b className="ellipsis">{q.label}</b><button className="link-btn" onClick={() => setDiscard(q.id)}><Trash2 size={14} /> Discard</button></div>
                  <div className="xs muted mono">{q.method} {q.path}</div>
                  <div className="xs muted">Saved {ago(q.createdAt)}</div>
                  {q.error && <div className="xs" style={{ color: 'var(--red)', marginTop: 4 }}>Rejected: {q.error}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Confirm open={!!discard} danger title="Discard this change?" message="It has not reached the server yet and will be lost." confirmText="Discard" onClose={() => setDiscard(null)} onConfirm={() => (discard && removeQueued(discard), setDiscard(null))} />
    </>
  );
}

// ---------- profile & settings ----------

function MProfile() {
  const { user, logout, can } = useAuth();
  const { employees } = useData();
  const { homeBranchId, branchName, locked } = useBranch();
  const { employee, choose } = useMyEmployee();
  const settings = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await loadAssets();
      toast.success(r.stale ? 'Offline: kept the saved copy' : `${r.assets.length} assets saved for offline use`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Top title="Profile & settings" back />
      <div className="m-body">
        <div className="m-card">
          <div className="row" style={{ gap: 14 }}>
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{(user?.name || '?').slice(0, 1).toUpperCase()}</div>
            <div><b>{user?.name}</b><div className="small muted">{user?.email || user?.username}</div></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div className="m-row"><span>Username</span><span>{user?.username}</span></div>
            <div className="m-row"><span>Role</span><span>{user?.roleName || 'Administrator'}</span></div>
            <div className="m-row"><span>Branch</span><span>{homeBranchId ? branchName(homeBranchId) : locked ? '—' : 'All branches'}</span></div>
            <div className="m-row"><span>Linked employee</span><span>{employee ? `${employee.name}${employee.empCode ? ` (${employee.empCode})` : ''}` : 'Not linked'}</span></div>
          </div>
        </div>

        <div className="m-section-title">Linked employee</div>
        <div className="m-card">
          <Field label="My employee record" hint="Assets assigned to this employee show under My Assigned Assets. It is matched by email, code or name automatically.">
            <select className="select" value={employee?._id || ''} onChange={(e) => choose(e.target.value || null)}>
              <option value="">Detect automatically</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.name}{e.empCode ? ` · ${e.empCode}` : ''}</option>)}
            </select>
          </Field>
        </div>

        <div className="m-section-title">Settings</div>
        <div className="m-card">
          <label className="checkbox" style={{ display: 'flex', padding: '6px 0' }}><input type="checkbox" checked={settings.gps} onChange={(e) => setSettings({ gps: e.target.checked })} /> <span><b className="small">Capture GPS location</b><div className="xs muted">Added to handovers, inspections and incidents when a fix is available.</div></span></label>
          <label className="checkbox" style={{ display: 'flex', padding: '6px 0' }}><input type="checkbox" checked={settings.autoSync} onChange={(e) => setSettings({ autoSync: e.target.checked })} /> <span><b className="small">Sync automatically</b><div className="xs muted">Send queued changes as soon as the connection returns.</div></span></label>
        </div>

        <div className="m-section-title">Data on this device</div>
        <div className="stack">
          <button className="btn btn-block" disabled={busy} onClick={refresh}><RefreshCw size={16} /> Refresh offline asset list</button>
          <button className="btn btn-block" onClick={() => navigate('/m/queue')}><CloudUpload size={16} /> View sync queue</button>
          <button className="btn btn-danger btn-block" onClick={() => setClear(true)}><Trash2 size={16} /> Clear device data</button>
          <LocalNote>Maintenance tasks, incident reports and inspection photos are stored on this device because the AssetAPI has no endpoints for them yet.</LocalNote>
        </div>

        <div className="m-section-title">Account</div>
        <div className="stack">
          {can('assets') && <Link to="/assets" className="btn btn-block"><Monitor size={16} /> Open the web portal</Link>}
          <button className="btn btn-block" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
        <div className="xs muted center mt">AssetPro mobile · installable from your browser menu (Add to Home Screen)</div>
      </div>
      <Confirm open={clear} danger title="Clear device data?" message="Removes saved tasks, incidents, inspection logs, cached lists and any changes still waiting to sync." confirmText="Clear" onClose={() => setClear(false)} onConfirm={() => (clearDeviceData(), setClear(false), toast.success('Device data cleared'))} />
    </>
  );
}

// ---------- shell ----------

function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { unread } = useNotices();
  const online = useOnline();
  const outbox = useOutbox();
  const settings = useSettings();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const menu = menuFor(user?.role);
  const taskTo = menu.find((m) => m.key === 'maintenance') ? '/m/maintenance' : menu.find((m) => m.key === 'inspection') ? '/m/inspection' : '/m/notifications';

  useEffect(() => {
    if (online && settings.autoSync && outbox.length) flushQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, settings.autoSync]);

  const syncNow = async () => {
    setSyncing(true);
    await flushQueue();
    setSyncing(false);
  };

  const tab = (to: string, label: string, icon: ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>{icon}{label}</NavLink>
  );

  return (
    <div className="m-app">
      {!online && <div className="offline-bar"><CloudOff size={14} /> You are offline. Changes are saved and will sync later.</div>}
      {outbox.length > 0 && (
        <div className="queue-bar">
          <span>{outbox.length} change{outbox.length === 1 ? '' : 's'} waiting to sync</span>
          <span className="row" style={{ gap: 12 }}>
            <button className="link-btn" style={{ color: '#a5b4fc' }} onClick={() => navigate('/m/queue')}>View</button>
            <button className="link-btn" style={{ color: '#a5b4fc' }} disabled={!online || syncing} onClick={syncNow}>{syncing ? 'Syncing…' : 'Sync now'}</button>
          </span>
        </div>
      )}
      {children}
      <nav className="m-nav">
        {tab('/m', 'Home', <Home size={20} />, true)}
        {tab('/m/mine', 'My assets', <Package size={20} />)}
        <NavLink to="/m/scan" aria-label="Scan asset" style={{ alignItems: 'center' }}><span className="scan-fab"><ScanLine size={24} /></span></NavLink>
        {tab(taskTo, 'Tasks', taskTo === '/m/notifications' ? <Bell size={20} /> : <Wrench size={20} />)}
        <a role="button" onClick={() => setMore(true)} style={{ cursor: 'pointer', position: 'relative' }}>
          <Grid2x2 size={20} />More
          {unread > 0 && <span style={{ position: 'absolute', top: 4, right: '28%', width: 8, height: 8, borderRadius: 4, background: 'var(--red)' }} />}
        </a>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="stack" style={{ gap: 4 }}>
          {menu.map((m) => (
            <Link key={m.key} to={m.to} onClick={() => setMore(false)} className="row" style={{ gap: 14, padding: '12px 4px', color: 'inherit', textDecoration: 'none', borderBottom: '1px solid #eef1f6' }}>
              {m.icon}<span style={{ flex: 1, fontWeight: 600 }}>{m.label}</span>
              {m.key === 'notifications' && unread > 0 && <span className="badge badge-red">{unread}</span>}
            </Link>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default function MobileApp() {
  return (
    <NotificationsProvider>
      <Shell>
        <Routes>
          <Route index element={<MHome />} />
          <Route path="scan" element={<MScan />} />
          <Route path="asset-new" element={<MAssetForm />} />
          <Route path="asset/:id" element={<MAsset />} />
          <Route path="asset/:id/edit" element={<MAssetForm />} />
          <Route path="mine" element={<MMine />} />
          <Route path="maintenance" element={<Guard item="maintenance"><MMaintenance /></Guard>} />
          <Route path="maintenance/new" element={<Guard item="maintenance"><MJobNew /></Guard>} />
          <Route path="maintenance/:id" element={<Guard item="maintenance"><MJob /></Guard>} />
          <Route path="inspection" element={<Guard item="inspection"><MInspection /></Guard>} />
          <Route path="inspection/:id" element={<Guard item="inspection"><MAudit /></Guard>} />
          <Route path="transfer" element={<Guard item="transfer"><MTransfer /></Guard>} />
          <Route path="incident" element={<MIncident />} />
          <Route path="notifications" element={<MNotifications />} />
          <Route path="history" element={<MHistory />} />
          <Route path="profile" element={<MProfile />} />
          <Route path="queue" element={<MQueue />} />
          <Route path="*" element={<Navigate to="/m" replace />} />
        </Routes>
      </Shell>
    </NotificationsProvider>
  );
}
