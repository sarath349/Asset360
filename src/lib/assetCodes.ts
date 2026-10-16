import { ApiAsset, assetApi } from '../api/assetApi';

// Continues the numbering of the most recently registered asset that has a value ending in a number
// (keeping its prefix and zero padding), skipping any value that is already taken.
export function nextInSequence(existing: ApiAsset[], key: 'assetCode' | 'serialNumber', fallback: string) {
  const used = new Set(existing.map((a) => (a[key] || '').trim().toLowerCase()).filter(Boolean));
  const latest = [...existing].sort((a, b) => b.assetId - a.assetId).find((a) => /\d+$/.test((a[key] || '').trim()));
  let prefix: string;
  let width: number;
  let n: number;
  if (latest) {
    const m = /^(.*?)(\d+)$/.exec((latest[key] || '').trim())!;
    prefix = m[1];
    width = m[2].length;
    n = Number(m[2]);
  } else {
    const m = /^(.*?)(\d+)$/.exec(fallback)!;
    prefix = m[1];
    width = m[2].length;
    n = Number(m[2]) - 1;
  }
  let next: string;
  do {
    n += 1;
    next = `${prefix}${String(n).padStart(width, '0')}`;
  } while (used.has(next.toLowerCase()));
  return next;
}

const loadAssets = (assets?: ApiAsset[]) => (assets ? Promise.resolve(assets) : assetApi.list().catch(() => [] as ApiAsset[]));

export async function nextAssetCode(assets?: ApiAsset[]) {
  return nextInSequence(await loadAssets(assets), 'assetCode', 'AST-000001');
}

// The first asset in an empty register starts at SN-000001 instead of being left blank.
export async function nextSerialNumber(assets?: ApiAsset[]) {
  return nextInSequence(await loadAssets(assets), 'serialNumber', 'SN-000001');
}
