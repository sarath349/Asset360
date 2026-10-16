const TOKEN_KEY = 'assetpro.token';

// Empty in dev so requests go through the Vite proxy; set VITE_API_URL for builds served from another host.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  offline: boolean;
  constructor(message: string, status = 0, offline = false) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method || 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('You appear to be offline', 0, true);
  }
  if (res.status === 401 && token) onUnauthorized?.();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status);
  return data as T;
}

function errorMessage(data: any, status: number) {
  if (typeof data === 'string' && data.trim() && data.length < 300) return data.trim();
  if (data?.message) return data.message;
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors).flat()[0];
    if (first) return String(first);
  }
  if (data?.title) return data.title;
  return `Request failed (${status})`;
}

export const get = <T = any>(path: string, query?: Query) => api<T>(path, { query });
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export async function upload<T = any>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${API_BASE}/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tokenStore.get()}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.message || 'Upload failed', res.status);
  return data as T;
}

export async function download(path: string, filename: string, query?: Query) {
  const res = await fetch(buildUrl(path, query), { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError('Download failed', res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function fileUrl(u?: string | null) {
  if (!u) return '';
  return u.startsWith('/') ? `${API_BASE}${u}` : u;
}
