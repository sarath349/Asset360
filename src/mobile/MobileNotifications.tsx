import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarClock, CheckCheck, ClipboardCheck, RefreshCw, ShieldAlert, Undo2, Wrench } from 'lucide-react';
import { ApiAssignment, assignmentApi, auditApi, contractApi, dashboardApi, disposalApi } from '../api/assetApi';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { loadAssets } from '../lib/assetLookup';
import { ago, daysUntil } from '../lib/format';
import { Empty, Loading } from '../components/ui';
import { isCompleted } from '../pages/audits/AuditsPage';
import { disposalStage } from '../pages/disposal/DisposalPage';
import { Top, useMyEmployee } from './kit';
import { useJobs } from './deviceStore';

type Tone = 'amber' | 'red' | 'blue' | 'cyan' | 'purple';
export interface Notice {
  id: string;
  title: string;
  detail: string;
  /** Sort key: most urgent first. */
  urgency: number;
  tone: Tone;
  icon: 'warranty' | 'amc' | 'maintenance' | 'overdue' | 'approval' | 'return' | 'inspection';
  to?: string;
}

const READ = 'assetpro.m.read';
const readSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ) || '[]'));
  } catch {
    return new Set();
  }
};

interface State {
  notices: Notice[];
  unread: number;
  loading: boolean;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  markAll: () => void;
  refresh: () => void;
}
const Ctx = createContext<State>({ notices: [], unread: 0, loading: false, isRead: () => true, markRead: () => undefined, markAll: () => undefined, refresh: () => undefined });
export const useNotices = () => useContext(Ctx);

const settled = <T,>(p: Promise<T>) => p.then((v) => v).catch(() => null as T | null);

/**
 * The API has no notification feed, so alerts are derived from live data: warranty and AMC expiries, contract alerts,
 * audits that are due or overdue, loans past their return date, disposals awaiting approval and maintenance jobs.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth();
  const { inScope } = useBranch();
  const { employee } = useMyEmployee();
  const jobs = useJobs();
  const [base, setBase] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<Set<string>>(readSet());

  const load = useCallback(async () => {
    setLoading(true);
    const out: Notice[] = [];
    const [assets, audits, contracts, pending, assignments, dash] = await Promise.all([
      settled(loadAssets().then((r) => r.assets)),
      settled(auditApi.campaigns()),
      settled(contractApi.expiryAlerts()),
      can('disposal', 'approve') ? settled(disposalApi.pending()) : Promise.resolve(null),
      settled(assignmentApi.list()),
      can('dashboard') ? settled(dashboardApi.get()) : Promise.resolve(null),
    ]);
    const assetById = new Map((assets || []).map((a) => [a.assetId, a]));

    for (const a of assets || []) {
      if (!inScope(a.locationId)) continue;
      for (const [kind, d] of [['warranty', a.warrantyEndDate], ['amc', a.amcEndDate]] as const) {
        const n = daysUntil(d);
        if (n === null || n > 30 || n < -14) continue;
        const label = kind === 'amc' ? 'AMC' : 'Warranty';
        out.push({
          id: `${kind}-${a.assetId}-${(d || '').slice(0, 10)}`,
          title: n < 0 ? `${label} expired: ${a.assetName || a.assetCode}` : `${label} expires in ${n} day${n === 1 ? '' : 's'}`,
          detail: `${a.assetName || '(unnamed)'} · ${a.assetCode}`,
          urgency: n < 0 ? 60 : 100 - n,
          tone: n < 0 ? 'red' : n <= 7 ? 'red' : 'amber',
          icon: kind,
          to: `/m/asset/${a.assetId}`,
        });
      }
    }

    for (const c of (contracts || []) as any[]) {
      const end = c.endDate || c.expiryDate || c.expiry;
      const n = daysUntil(end);
      out.push({
        id: `contract-${c.contractId ?? c.contractNumber ?? Math.random()}`,
        title: `Contract ${c.contractNumber || `#${c.contractId}`} ${n !== null && n < 0 ? 'has expired' : 'is expiring'}`,
        detail: [c.vendorName, c.contractType, end && String(end).slice(0, 10)].filter(Boolean).join(' · '),
        urgency: n !== null && n < 0 ? 65 : 85 - Math.max(0, n ?? 30),
        tone: 'cyan',
        icon: 'amc',
      });
    }

    for (const a of audits || []) {
      if (isCompleted(a.status) || !inScope(a.siteId)) continue;
      const mine = a.assignedTo === user?.userId;
      if (!mine && !can('audits', 'create')) continue;
      const n = daysUntil(a.endDate);
      if (n !== null && n < 0)
        out.push({ id: `audit-overdue-${a.auditId}`, title: `Inspection overdue: ${a.auditName}`, detail: `Was due ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ago`, urgency: 95, tone: 'red', icon: 'overdue', to: `/m/inspection/${a.auditId}` });
      else if (mine && n !== null && n <= 5)
        out.push({ id: `audit-due-${a.auditId}`, title: `Inspection due ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}`, detail: a.auditName, urgency: 90 - n, tone: 'amber', icon: 'inspection', to: `/m/inspection/${a.auditId}` });
    }

    for (const d of pending || []) {
      if (disposalStage(d) !== 'pending' || !inScope(assetById.get(d.assetId)?.locationId)) continue;
      out.push({ id: `disposal-${d.disposalId}`, title: 'Disposal awaiting your approval', detail: `${d.disposalRequestNumber} · ${d.retirementReason}`, urgency: 70, tone: 'purple', icon: 'approval' });
    }

    // Loans past their expected return date that have not been returned since.
    const all = (assignments || []) as ApiAssignment[];
    const manager = can('transfers', 'create');
    for (const t of all) {
      if (!t.isTemporary || !t.expectedReturnDate) continue;
      if (/return|close|complete/i.test(`${t.status || ''} ${t.transactionType || ''}`)) continue;
      const n = daysUntil(t.expectedReturnDate);
      if (n === null || n > 3) continue;
      const mine = employee && t.toEmployeeId === employee.employeeId;
      if (!mine && !manager) continue;
      const returned = all.some((r) => r.assetId === t.assetId && /return/i.test(r.transactionType || '') && String(r.transactionDate) > String(t.transactionDate));
      if (returned || !inScope(assetById.get(t.assetId)?.locationId)) continue;
      out.push({
        id: `return-${t.assignmentHistoryId}`,
        title: n < 0 ? `Asset return overdue by ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}` : `Asset due back ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}`,
        detail: assetById.get(t.assetId)?.assetName || `Asset #${t.assetId}`,
        urgency: n < 0 ? 92 : 80,
        tone: n < 0 ? 'red' : 'blue',
        icon: 'return',
        to: `/m/asset/${t.assetId}`,
      });
    }

    const s = dash?.summary;
    if (s?.overdueMaintenance) out.push({ id: `dash-overdue-${s.overdueMaintenance}`, title: `${s.overdueMaintenance} maintenance item${s.overdueMaintenance === 1 ? '' : 's'} overdue`, detail: 'Preventive maintenance past its due date', urgency: 88, tone: 'red', icon: 'maintenance' });
    else if (s?.maintenanceDue) out.push({ id: `dash-due-${s.maintenanceDue}`, title: `${s.maintenanceDue} maintenance item${s.maintenanceDue === 1 ? '' : 's'} due`, detail: 'Preventive maintenance coming up', urgency: 75, tone: 'amber', icon: 'maintenance' });

    setBase(out);
    setLoading(false);
  }, [user, can, inScope, employee]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    window.addEventListener('online', load);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', load);
    };
  }, [load]);

  // Maintenance jobs live on this device, so they are layered on top without another fetch.
  const notices = useMemo(() => {
    const local: Notice[] = [];
    for (const j of jobs) {
      if (j.kind === 'incident' || !j.dueDate || ['Completed', 'Cancelled'].includes(j.status)) continue;
      const n = daysUntil(j.dueDate);
      if (n === null || n > 3) continue;
      local.push({ id: `job-${j.id}-${j.dueDate}`, title: n < 0 ? `Task overdue: ${j.title}` : `Task due ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}`, detail: j.assetName || j.type, urgency: n < 0 ? 96 : 82, tone: n < 0 ? 'red' : 'amber', icon: 'maintenance', to: `/m/maintenance/${j.id}` });
    }
    return [...base, ...local].sort((a, b) => b.urgency - a.urgency);
  }, [base, jobs]);

  const persist = (s: Set<string>) => {
    setRead(new Set(s));
    try {
      localStorage.setItem(READ, JSON.stringify([...s].slice(-400)));
    } catch {
      /* ignore */
    }
  };
  const value: State = {
    notices,
    unread: notices.filter((n) => !read.has(n.id)).length,
    loading,
    isRead: (id) => read.has(id),
    markRead: (id) => persist(new Set(read).add(id)),
    markAll: () => persist(new Set([...read, ...notices.map((n) => n.id)])),
    refresh: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ICONS = {
  warranty: <ShieldAlert size={18} />,
  amc: <CalendarClock size={18} />,
  maintenance: <Wrench size={18} />,
  overdue: <AlertTriangle size={18} />,
  approval: <CheckCheck size={18} />,
  return: <Undo2 size={18} />,
  inspection: <ClipboardCheck size={18} />,
};

export function MNotifications() {
  const { notices, loading, isRead, markRead, markAll, refresh, unread } = useNotices();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const list = onlyUnread ? notices.filter((n) => !isRead(n.id)) : notices;

  return (
    <>
      <Top title="Notifications" sub={unread ? `${unread} unread` : 'All caught up'} back right={<button className="m-back" onClick={refresh} aria-label="Refresh"><RefreshCw size={16} /></button>} />
      <div className="m-body">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <label className="checkbox small"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Unread only</label>
          {unread > 0 && <button className="btn btn-sm" onClick={markAll}><CheckCheck size={14} /> Mark all read</button>}
        </div>
        {loading && notices.length === 0 ? <Loading /> : list.length === 0 ? (
          <Empty icon={<Bell size={24} />} title="Nothing to report" message="Maintenance due dates, warranty and AMC expiries, overdue tasks, pending approvals and return reminders show up here." />
        ) : (
          list.map((n) => {
            const body = (
              <div className="m-card row" style={{ gap: 12, opacity: isRead(n.id) ? 0.65 : 1, alignItems: 'flex-start' }} onClick={() => markRead(n.id)}>
                <div className={`kpi-icon tone-${n.tone}`} style={{ width: 38, height: 38 }}>{ICONS[n.icon]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bold small">{n.title}</div>
                  <div className="xs muted ellipsis">{n.detail}</div>
                </div>
                {!isRead(n.id) && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--primary)', marginTop: 6 }} />}
              </div>
            );
            return n.to ? <Link key={n.id} to={n.to} style={{ color: 'inherit', textDecoration: 'none', display: 'block', marginBottom: 12 }}>{body}</Link> : <div key={n.id} style={{ marginBottom: 12 }}>{body}</div>;
          })
        )}
        <div className="xs muted center mt">Refreshed {ago(new Date())}. Alerts are built from live data, so they update as records change.</div>
      </div>
    </>
  );
}
