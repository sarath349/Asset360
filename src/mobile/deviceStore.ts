import { useEffect, useState } from 'react';
import { ApiMaintenanceJob, maintenanceApi } from '../api/assetApi';
import { clearQueue, mutate } from '../api/offline';
import { clearAssetCache } from '../lib/assetLookup';

/**
 * Inspection photos stay device-local (no API yet). Maintenance jobs sync to /api/maintenance
 * with a localStorage cache for offline use.
 */

export type JobKind = 'maintenance' | 'fault' | 'incident';
export type JobStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';

export interface SparePart {
  name: string;
  qty: number;
  cost?: number;
}

export interface Job {
  id: string;
  jobId?: number | null;
  kind: JobKind;
  /** Preventive maintenance, Fault, Breakdown, Repair request, or the incident category. */
  type: string;
  assetId: number | null;
  assetCode: string;
  assetName: string;
  locationId?: number | null;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: JobStatus;
  createdAt: string;
  createdBy: number | null;
  createdByName: string;
  dueDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  laborHours?: number | null;
  spareParts?: SparePart[];
  notes?: string;
  beforePhotos?: string[];
  afterPhotos?: string[];
  photos?: string[];
  gps?: string;
  /** Asset status before the job started, restored on completion. */
  prevAssetStatus?: string | null;
}

export interface InspectionEntry {
  id: string;
  auditId: number;
  auditName: string;
  assetId: number | null;
  assetCode: string;
  assetName: string;
  condition: string;
  checklist: { label: string; ok: boolean }[];
  remarks: string;
  photos: string[];
  gps?: string;
  at: string;
  inspector: string;
  /** Id of the offline-queue entry while the scan has not reached the server yet. */
  queueId?: string;
}

const JOBS = 'assetpro.m.jobs';
const INSPECTIONS = 'assetpro.m.inspections';
const EVENT = 'assetpro.m.changed';

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage is full (usually photos): drop photos from the oldest records and retry once.
    const slim = (list as any[]).map((x, i) => (i < list.length - 5 ? { ...x, photos: [], beforePhotos: [], afterPhotos: [] } : x));
    localStorage.setItem(key, JSON.stringify(slim));
  }
  window.dispatchEvent(new Event(EVENT));
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function useStore<T>(key: string) {
  const [list, setList] = useState<T[]>(() => read<T>(key));
  useEffect(() => {
    const h = () => setList(read<T>(key));
    window.addEventListener(EVENT, h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener('storage', h);
    };
  }, [key]);
  return list;
}

export const fromApiJob = (j: ApiMaintenanceJob): Job => ({
  id: j.clientId || String(j.jobId),
  jobId: j.jobId,
  kind: j.kind,
  type: j.type,
  assetId: j.assetId,
  assetCode: j.assetCode || '',
  assetName: j.assetName || '',
  locationId: j.locationId,
  title: j.title || '',
  description: j.description || '',
  priority: (j.priority as Job['priority']) || 'Medium',
  status: (j.status as JobStatus) || 'Open',
  createdAt: j.createdDate,
  createdBy: j.createdBy,
  createdByName: j.createdByName || '',
  dueDate: j.dueDate,
  startedAt: j.startedAt,
  completedAt: j.completedAt,
  laborHours: j.laborHours,
  spareParts: j.spareParts || [],
  notes: j.notes || '',
  beforePhotos: j.beforePhotos || [],
  afterPhotos: j.afterPhotos || [],
  photos: j.photos || [],
  gps: j.gps || undefined,
  prevAssetStatus: j.prevAssetStatus,
});

export const toApiJob = (j: Job): Partial<ApiMaintenanceJob> => ({
  clientId: j.id,
  kind: j.kind,
  type: j.type,
  assetId: j.assetId,
  assetCode: j.assetCode || null,
  assetName: j.assetName || null,
  locationId: j.locationId ?? null,
  title: j.title,
  description: j.description,
  priority: j.priority,
  status: j.status,
  createdBy: j.createdBy,
  createdByName: j.createdByName,
  dueDate: j.dueDate ?? null,
  startedAt: j.startedAt ?? null,
  completedAt: j.completedAt ?? null,
  laborHours: j.laborHours ?? null,
  spareParts: j.spareParts || [],
  notes: j.notes || null,
  // Skip large data-URL photos on the server payload to avoid huge JSON; keep them locally.
  beforePhotos: [],
  afterPhotos: [],
  photos: [],
  gps: j.gps || null,
  prevAssetStatus: j.prevAssetStatus ?? null,
  createdDate: j.createdAt,
});

export const useJobs = () => useStore<Job>(JOBS);
export const useInspections = () => useStore<InspectionEntry>(INSPECTIONS);

export const getJob = (id: string) => read<Job>(JOBS).find((j) => j.id === id || String(j.jobId) === id) || null;

/** Cache-only write (used after API success or while offline). */
export const saveJobLocal = (job: Job) => {
  const all = read<Job>(JOBS);
  const i = all.findIndex((j) => j.id === job.id || (job.jobId && j.jobId === job.jobId));
  if (i >= 0) all[i] = job;
  else all.unshift(job);
  write(JOBS, all);
};

export const removeJobLocal = (id: string) => write(JOBS, read<Job>(JOBS).filter((j) => j.id !== id && String(j.jobId) !== id));

/** Refresh jobs from the server into the local cache. Falls back to cache when offline. */
export async function refreshJobs(): Promise<Job[]> {
  try {
    if (navigator.onLine) {
      const rows = await maintenanceApi.list();
      const mapped = rows.map(fromApiJob);
      // Preserve local-only photo fields / pending client drafts that are not on the server yet.
      const local = read<Job>(JOBS);
      const byClient = new Map(local.map((j) => [j.id, j]));
      const merged = mapped.map((j) => {
        const prev = byClient.get(j.id) || (j.jobId ? local.find((x) => x.jobId === j.jobId) : null);
        return prev
          ? {
              ...j,
              beforePhotos: prev.beforePhotos?.length ? prev.beforePhotos : j.beforePhotos,
              afterPhotos: prev.afterPhotos?.length ? prev.afterPhotos : j.afterPhotos,
              photos: prev.photos?.length ? prev.photos : j.photos,
            }
          : j;
      });
      const pendingLocal = local.filter((j) => !j.jobId && !mapped.some((m) => m.id === j.id));
      write(JOBS, [...pendingLocal, ...merged]);
      return [...pendingLocal, ...merged];
    }
  } catch {
    // keep cache
  }
  return read<Job>(JOBS);
}

/** Create or update a job on the server (queues when offline). */
export async function saveJob(job: Job): Promise<{ job: Job; queued: boolean }> {
  saveJobLocal(job);
  if (job.jobId) {
    const r = await mutate<ApiMaintenanceJob>('PUT', `/maintenance/${job.jobId}`, { ...toApiJob(job), jobId: job.jobId }, `Update job: ${job.title}`);
    if (r.data) {
      const next = { ...fromApiJob(r.data), beforePhotos: job.beforePhotos, afterPhotos: job.afterPhotos, photos: job.photos };
      saveJobLocal(next);
      return { job: next, queued: false };
    }
    return { job, queued: true };
  }
  const r = await mutate<ApiMaintenanceJob>('POST', '/maintenance', toApiJob(job), `Create job: ${job.title}`);
  if (r.data) {
    const next = { ...fromApiJob(r.data), beforePhotos: job.beforePhotos, afterPhotos: job.afterPhotos, photos: job.photos, id: job.id };
    saveJobLocal(next);
    removeJobLocal(job.id);
    saveJobLocal(next);
    return { job: next, queued: false };
  }
  return { job, queued: true };
}

export async function startJob(job: Job, markAsset = true): Promise<Job> {
  if (job.jobId && navigator.onLine) {
    const data = await maintenanceApi.start(job.jobId, { markAsset });
    const next = { ...fromApiJob(data), beforePhotos: job.beforePhotos, afterPhotos: job.afterPhotos, photos: job.photos };
    saveJobLocal(next);
    return next;
  }
  const next = { ...job, status: 'In Progress' as JobStatus, startedAt: new Date().toISOString() };
  await saveJob(next);
  return next;
}

export async function completeJob(job: Job, markAsset = true): Promise<Job> {
  if (job.jobId && navigator.onLine) {
    const data = await maintenanceApi.complete(job.jobId, { ...toApiJob(job), markAsset });
    const next = { ...fromApiJob(data), beforePhotos: job.beforePhotos, afterPhotos: job.afterPhotos, photos: job.photos };
    saveJobLocal(next);
    return next;
  }
  const next = { ...job, status: 'Completed' as JobStatus, completedAt: new Date().toISOString() };
  await saveJob(next);
  return next;
}

export async function cancelJob(job: Job): Promise<Job> {
  if (job.jobId && navigator.onLine) {
    const data = await maintenanceApi.cancel(job.jobId);
    const next = { ...fromApiJob(data), beforePhotos: job.beforePhotos, afterPhotos: job.afterPhotos, photos: job.photos };
    saveJobLocal(next);
    return next;
  }
  const next = { ...job, status: 'Cancelled' as JobStatus };
  await saveJob(next);
  return next;
}

export async function removeJob(id: string): Promise<void> {
  const job = getJob(id);
  removeJobLocal(id);
  if (job?.jobId && navigator.onLine) {
    try {
      await maintenanceApi.remove(job.jobId);
    } catch {
      // ignore — already removed locally
    }
  }
}

export const addInspection = (e: InspectionEntry) => write(INSPECTIONS, [e, ...read<InspectionEntry>(INSPECTIONS)].slice(0, 200));

export function clearDeviceData() {
  clearQueue();
  [JOBS, INSPECTIONS, 'assetpro.m.read', 'assetpro.m.employee'].forEach((k) => localStorage.removeItem(k));
  Object.keys(localStorage)
    .filter((k) => k.startsWith('assetpro.cache:') || k.startsWith('assetpro.m.'))
    .filter((k) => k !== SETTINGS)
    .forEach((k) => localStorage.removeItem(k));

  // Wipe offline asset list without refetching the server (that was putting everything back on screen).
  clearAssetCache();
  window.dispatchEvent(new Event(EVENT));
}

// ---- settings ----

export interface MobileSettings {
  gps: boolean;
  autoSync: boolean;
}

const SETTINGS = 'assetpro.m.settings';
export const getSettings = (): MobileSettings => ({ gps: true, autoSync: true, ...(JSON.parse(localStorage.getItem(SETTINGS) || '{}') as Partial<MobileSettings>) });
export function setSettings(patch: Partial<MobileSettings>) {
  localStorage.setItem(SETTINGS, JSON.stringify({ ...getSettings(), ...patch }));
  window.dispatchEvent(new Event(EVENT));
}
export function useSettings() {
  const [s, setS] = useState(getSettings());
  useEffect(() => {
    const h = () => setS(getSettings());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return s;
}
