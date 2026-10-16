import { ApiAsset, assetApi } from '../api/assetApi';
import { ApiError } from '../api/client';

const CACHE_KEY = 'assetpro.assets';

/**
 * Printed QR labels hold a portal URL (…/scan/AST-000123); barcodes and RFID readers give the bare value.
 * Both end up as the plain code.
 */
export function extractCode(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    const q = url.searchParams.get('code') || url.searchParams.get('asset');
    if (q) return q.trim();
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last).trim();
  } catch {
    /* not a URL */
  }
  return text;
}

export function matchAsset(assets: ApiAsset[], raw: string): ApiAsset | null {
  const code = extractCode(raw).toLowerCase();
  if (!code) return null;
  const eq = (v?: string | null) => (v || '').trim().toLowerCase() === code;
  return (
    assets.find((a) => eq(a.assetCode)) ||
    assets.find((a) => eq(a.qrCode)) ||
    assets.find((a) => eq(a.rfidTag)) ||
    assets.find((a) => eq(a.serialNumber)) ||
    assets.find((a) => String(a.assetId) === code) ||
    null
  );
}

export function cachedAssets(): ApiAsset[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Loads the register and keeps a copy on the device so scans still resolve with no signal. */
export async function loadAssets(): Promise<{ assets: ApiAsset[]; stale: boolean }> {
  try {
    const assets = await assetApi.list();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(assets));
    } catch {
      /* storage full: skip caching */
    }
    return { assets, stale: false };
  } catch (err) {
    const hit = cachedAssets();
    if (err instanceof ApiError && err.offline && hit.length) return { assets: hit, stale: true };
    throw err;
  }
}

export async function findAsset(raw: string): Promise<ApiAsset | null> {
  const cached = matchAsset(cachedAssets(), raw);
  if (cached && !navigator.onLine) return cached;
  try {
    const { assets } = await loadAssets();
    return matchAsset(assets, raw);
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
