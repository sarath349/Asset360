let currency = 'AED';
export function setCurrency(c: string) {
  currency = c || 'AED';
}
export function getCurrency() {
  return currency;
}

export function money(n?: number | null, opts: { compact?: boolean; decimals?: number } = {}) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) {
    const f = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    return `${currency} ${f}`;
  }
  return `${currency} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 0 })}`;
}

export function num(n?: number | null) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('en-US');
}

export function date(d?: string | Date | null) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(d?: string | Date | null) {
  if (!d) return '—';
  const x = new Date(d);
  return `${x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function toInputDate(d?: string | Date | null) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

export function daysUntil(d?: string | Date | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export function ago(d?: string | Date | null) {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return date(d);
}

export function label(s?: string | null) {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

const TONES: Record<string, string> = {
  active: 'green', 'in store': 'blue', 'in repair': 'amber', 'under maintenance': 'amber', missing: 'red', damaged: 'rose', retired: 'slate', disposed: 'slate',
  pending: 'amber', approved: 'blue', completed: 'green', rejected: 'red', cancelled: 'slate',
  open: 'blue', in_progress: 'indigo', on_hold: 'amber', draft: 'slate',
  verified: 'green', wrong_location: 'amber', duplicate: 'purple', new_found: 'cyan',
  requested: 'amber', ordered: 'indigo', received: 'green',
  low: 'slate', medium: 'blue', high: 'amber', critical: 'red',
  preventive: 'cyan', corrective: 'amber', breakdown: 'red', inspection: 'purple',
  expired: 'red', expiring: 'amber', valid: 'green',
  info: 'blue', success: 'green', warning: 'amber', danger: 'red',
};

const EXTRA_TONES: Record<string, string> = {
  inprogress: 'indigo', started: 'indigo', planned: 'slate', scheduled: 'slate', new: 'blue', assigned: 'blue', returned: 'slate', transferred: 'cyan',
  found: 'green', notfound: 'red', mismatch: 'amber', wronglocation: 'amber', unknown: 'cyan', inactive: 'slate', disposed: 'slate', retired: 'slate',
};

export function tone(status?: string) {
  const s = (status || '').toLowerCase();
  return TONES[s] || TONES[s.replace(/\s+/g, '_')] || EXTRA_TONES[s.replace(/[\s_-]+/g, '')] || 'slate';
}

export const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

export const STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  'In Store': '#3b82f6',
  'In Repair': '#f59e0b',
  'Under Maintenance': '#fbbf24',
  Missing: '#ef4444',
  Damaged: '#f43f5e',
  Retired: '#94a3b8',
  Disposed: '#475569',
};

export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: Record<string, any>[]) {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      cur.push(field);
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
      field = '';
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((c) => c.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])));
}
