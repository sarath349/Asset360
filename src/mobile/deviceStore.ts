import { useEffect, useState } from 'react';

/**
 * Records the AssetAPI has no endpoints for yet (maintenance jobs, incident reports, inspection photos) are kept in
 * this device's localStorage. They are NOT shared with other users or the web portal until the backend provides
 * endpoints; swap the functions below for API calls when it does.
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

export const useJobs = () => useStore<Job>(JOBS);
export const useInspections = () => useStore<InspectionEntry>(INSPECTIONS);

export const getJob = (id: string) => read<Job>(JOBS).find((j) => j.id === id) || null;
export const saveJob = (job: Job) => {
  const all = read<Job>(JOBS);
  const i = all.findIndex((j) => j.id === job.id);
  if (i >= 0) all[i] = job;
  else all.unshift(job);
  write(JOBS, all);
};
export const removeJob = (id: string) => write(JOBS, read<Job>(JOBS).filter((j) => j.id !== id));

export const addInspection = (e: InspectionEntry) => write(INSPECTIONS, [e, ...read<InspectionEntry>(INSPECTIONS)].slice(0, 200));

export function clearDeviceData() {
  [JOBS, INSPECTIONS, 'assetpro.assets', 'assetpro.queue', 'assetpro.m.read'].forEach((k) => localStorage.removeItem(k));
  Object.keys(localStorage)
    .filter((k) => k.startsWith('assetpro.cache:'))
    .forEach((k) => localStorage.removeItem(k));
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
