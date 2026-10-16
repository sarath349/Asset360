import { api, ApiError } from './client';

// Offline support for the technician app: writes are queued in localStorage and replayed
// in order when connectivity returns; reads fall back to the last cached response.

const QUEUE_KEY = 'assetpro.queue';
const CACHE_PREFIX = 'assetpro.cache:';

export interface QueuedAction {
  id: string;
  method: 'POST' | 'PUT';
  path: string;
  body: unknown;
  label: string;
  createdAt: string;
  error?: string;
}

type Listener = (q: QueuedAction[]) => void;
const listeners = new Set<Listener>();

export function getQueue(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  listeners.forEach((l) => l(q));
}

export function subscribeQueue(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function removeQueued(id: string) {
  saveQueue(getQueue().filter((a) => a.id !== id));
}

export async function mutate<T = any>(method: 'POST' | 'PUT', path: string, body: unknown, label: string): Promise<{ queued: boolean; data?: T }> {
  if (navigator.onLine) {
    try {
      return { queued: false, data: await api<T>(path, { method, body }) };
    } catch (err) {
      if (!(err instanceof ApiError) || !err.offline) throw err;
    }
  }
  const action: QueuedAction = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method, path, body, label, createdAt: new Date().toISOString() };
  saveQueue([...getQueue(), action]);
  return { queued: true };
}

let flushing = false;
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (flushing || !navigator.onLine) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const action of getQueue()) {
      try {
        await api(action.path, { method: action.method, body: action.body });
        removeQueued(action.id);
        synced += 1;
      } catch (err) {
        if (err instanceof ApiError && err.offline) break;
        failed += 1;
        saveQueue(getQueue().map((a) => (a.id === action.id ? { ...a, error: (err as Error).message } : a)));
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, failed };
}

export async function cachedGet<T = any>(path: string, query?: Record<string, any>): Promise<{ data: T; stale: boolean }> {
  const key = CACHE_PREFIX + path + (query ? JSON.stringify(query) : '');
  try {
    const data = await api<T>(path, { query });
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* storage full: skip caching */
    }
    return { data, stale: false };
  } catch (err) {
    const hit = localStorage.getItem(key);
    if (err instanceof ApiError && err.offline && hit) return { data: JSON.parse(hit), stale: true };
    throw err;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    let auto = true;
    try {
      auto = JSON.parse(localStorage.getItem('assetpro.m.settings') || '{}').autoSync !== false;
    } catch {
      /* default on */
    }
    if (auto) flushQueue();
  });
}
