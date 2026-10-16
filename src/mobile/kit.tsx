import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Bell, Camera, ClipboardCheck, CloudOff, History, Home, ImagePlus, Package, ScanLine, UserCog, Wrench, X } from 'lucide-react';
import { ApiAsset } from '../api/assetApi';
import { getQueue, QueuedAction, subscribeQueue } from '../api/offline';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { findAsset } from '../lib/assetLookup';
import { Empty, Modal } from '../components/ui';
import { AssetSelect } from '../components/pickers';
import { Scanner } from '../components/Scanner';

// ---------- menu & role access ----------

export interface MenuItem {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  /** Roles that get this item on top of the admin-type roles. Omitted = everyone. */
  roles?: string[];
}

export const MENU: MenuItem[] = [
  { key: 'home', to: '/m', label: 'Home Dashboard', icon: <Home size={20} /> },
  { key: 'scan', to: '/m/scan', label: 'Scan Asset', icon: <ScanLine size={20} /> },
  { key: 'mine', to: '/m/mine', label: 'My Assigned Assets', icon: <Package size={20} /> },
  { key: 'maintenance', to: '/m/maintenance', label: 'Maintenance Tasks', icon: <Wrench size={20} />, roles: ['technician'] },
  { key: 'inspection', to: '/m/inspection', label: 'Asset Inspection', icon: <ClipboardCheck size={20} />, roles: ['technician', 'auditor'] },
  { key: 'transfer', to: '/m/transfer', label: 'Transfer / Handover', icon: <ArrowLeftRight size={20} />, roles: ['department manager'] },
  { key: 'incident', to: '/m/incident', label: 'Report an Incident', icon: <AlertTriangle size={20} /> },
  { key: 'notifications', to: '/m/notifications', label: 'Notifications', icon: <Bell size={20} /> },
  { key: 'history', to: '/m/history', label: 'Asset History', icon: <History size={20} /> },
  { key: 'profile', to: '/m/profile', label: 'Profile & Settings', icon: <UserCog size={20} /> },
];

// Admin, manager-type roles and the seeded admin (no role) see every menu item.
const FULL_ACCESS = ['', 'super admin', 'admin', 'asset manager', 'facility manager'];
export const isAllowed = (item: MenuItem, role?: string | null) => !item.roles || FULL_ACCESS.includes((role || '').trim().toLowerCase()) || item.roles.includes((role || '').trim().toLowerCase());
export const menuFor = (role?: string | null) => MENU.filter((m) => isAllowed(m, role));

export function Guard({ item, children }: { item: string; children: ReactNode }) {
  const { user } = useAuth();
  const def = MENU.find((m) => m.key === item);
  if (def && !isAllowed(def, user?.role))
    return (
      <>
        <Top title={def.label} back />
        <div className="m-body">
          <Empty title="Not available for your role" message="Ask an administrator if you need access to this section." />
        </div>
      </>
    );
  return <>{children}</>;
}

// ---------- layout bits ----------

export function Top({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="m-top">
      <div className="row" style={{ gap: 12 }}>
        {back && (
          <button className="m-back" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="ellipsis">{title}</h1>
          {sub && <div className="sub ellipsis">{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function StaleNote({ stale }: { stale: boolean }) {
  if (!stale) return null;
  return (
    <div className="alert alert-warn mb" style={{ fontSize: 12.5 }}>
      <CloudOff size={15} /> Showing saved data. You are offline.
    </div>
  );
}

export function LocalNote({ children }: { children?: ReactNode }) {
  return (
    <div className="alert alert-info mb" style={{ fontSize: 12.5 }}>
      <div>{children || 'Saved on this device only. The AssetAPI has no endpoint for this yet, so it is not shared with other users or the web portal.'}</div>
    </div>
  );
}

export function useOutbox(): QueuedAction[] {
  const [q, setQ] = useState<QueuedAction[]>(getQueue());
  useEffect(() => subscribeQueue(setQ), []);
  return q;
}

// ---------- identity ----------

const EMP_KEY = 'assetpro.m.employee';

/** Links the login to an employee record (assets are assigned to employees, not users). */
export function useMyEmployee() {
  const { user } = useAuth();
  const { employees } = useData();
  const [override, setOverride] = useState<string | null>(localStorage.getItem(EMP_KEY));
  const employee = useMemo(() => {
    if (!user) return null;
    const email = user.email.trim().toLowerCase();
    const uname = user.username.trim().toLowerCase();
    const name = user.name.trim().toLowerCase();
    return (
      (override ? employees.find((e) => e._id === override) : undefined) ||
      (email ? employees.find((e) => e.email?.trim().toLowerCase() === email) : undefined) ||
      employees.find((e) => e.empCode && e.empCode.trim().toLowerCase() === uname) ||
      employees.find((e) => e.name.trim().toLowerCase() === name) ||
      null
    );
  }, [user, employees, override]);
  const choose = (id: string | null) => {
    if (id) localStorage.setItem(EMP_KEY, id);
    else localStorage.removeItem(EMP_KEY);
    setOverride(id);
  };
  return { employee, choose };
}

// ---------- photos ----------

export function readPhoto(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read the photo'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.6));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoPicker({ label, photos, onChange, max = 3 }: { label: string; photos: string[]; onChange: (p: string[]) => void; max?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const add = async (files: FileList | null) => {
    if (!files) return;
    try {
      const next = await Promise.all([...files].slice(0, max - photos.length).map((f) => readPhoto(f)));
      onChange([...photos, ...next]);
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <div>
      <div className="small bold" style={{ marginBottom: 6 }}>{label}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <img src={p} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
            <button type="button" className="m-back" style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, background: '#0f172a' }} onClick={() => onChange(photos.filter((_, j) => j !== i))} aria-label="Remove photo">
              <X size={12} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button type="button" className="btn" style={{ width: 72, height: 72, flexDirection: 'column', gap: 4, fontSize: 11 }} onClick={() => ref.current?.click()}>
            <Camera size={18} /> Add
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      <div className="xs muted" style={{ marginTop: 4 }}>
        <ImagePlus size={11} style={{ verticalAlign: -1 }} /> Photos stay on this device (no upload endpoint on the API yet).
      </div>
    </div>
  );
}

// ---------- asset picking ----------

export function ScanModal({ open, onClose, onAsset, onCode }: { open: boolean; onClose: () => void; onAsset: (a: ApiAsset) => void; onCode?: (code: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const scan = async (text: string) => {
    setBusy(true);
    try {
      const a = await findAsset(text);
      if (a) {
        onAsset(a);
        onClose();
      } else {
        onCode?.(text);
        toast.error(`No asset matches "${text}"`);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Scan asset">
      {open && <Scanner onScan={scan} paused={busy} />}
    </Modal>
  );
}

/** Pick an asset by search or by scanning its label. */
export function AssetScanSelect({ value, onChange }: { value: ApiAsset | null; onChange: (a: ApiAsset | null) => void }) {
  const [scanning, setScanning] = useState(false);
  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AssetSelect value={value ? String(value.assetId) : null} onChange={(_, a) => onChange(a || null)} />
        </div>
        <button type="button" className="btn btn-icon" onClick={() => setScanning(true)} aria-label="Scan">
          <ScanLine size={17} />
        </button>
      </div>
      <ScanModal open={scanning} onClose={() => setScanning(false)} onAsset={onChange} />
    </>
  );
}

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
