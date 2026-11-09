export const nowIso = () => new Date().toISOString();

export function num(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function monthsBetween(from, to = new Date()) {
  if (!from) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime())) return 0;
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export function calcDepreciation(rec) {
  const cost = Number(rec.purchaseValue) || 0;
  const salvage = Math.min(Math.max(0, Number(rec.residualValue) || 0), cost);
  const life = Number(rec.usefulLifeMonths) || 0;
  if (!(cost > 0) || !(life > 0)) {
    return {
      accumulatedDepreciation: 0,
      currentBookValue: cost,
      lastCalculatedDate: nowIso(),
    };
  }

  const elapsed = Math.min(life, monthsBetween(rec.depreciationStartDate));
  const declining = /declin/i.test(rec.depreciationMethod || '');
  const years = life / 12;
  const rate =
    rec.annualDepreciationRate && rec.annualDepreciationRate > 0
      ? rec.annualDepreciationRate / 100
      : years > 0
        ? 2 / years
        : 0;

  let book = cost;
  let accumulated = 0;
  if (declining) {
    for (let m = 0; m < elapsed; m++) {
      const room = Math.max(0, book - salvage);
      const dep = Math.min(book * (rate / 12), room);
      book -= dep;
      accumulated += dep;
    }
  } else {
    const monthly = (cost - salvage) / life;
    accumulated = Math.min(monthly * elapsed, cost - salvage);
    book = cost - accumulated;
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    accumulatedDepreciation: r2(accumulated),
    currentBookValue: r2(Math.max(salvage, book)),
    lastCalculatedDate: nowIso(),
  };
}

export function chartFromMap(map) {
  return [...map.entries()]
    .map(([label, value]) => ({ label: label || 'Unassigned', value }))
    .sort((a, b) => b.value - a.value);
}

export function addMonthsChart(items, dateKey) {
  const map = new Map();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, 0);
  }
  for (const item of items) {
    const raw = item[dateKey];
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (map.has(key)) map.set(key, map.get(key) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

export function inDateRange(value, fromDate, toDate) {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  if (fromDate && t < new Date(fromDate).getTime()) return false;
  if (toDate && t > new Date(toDate).getTime()) return false;
  return true;
}
