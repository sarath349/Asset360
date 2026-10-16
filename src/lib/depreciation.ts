export interface ScheduleRow {
  year: number;
  opening: number;
  depreciation: number;
  accumulated: number;
  closing: number;
}

export interface ScheduleInput {
  cost: number;
  salvage: number;
  lifeMonths: number;
  method: string;
  /** Annual rate in percent for declining balance. Defaults to double the straight-line rate. */
  ratePct?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const defaultDecliningRate = (lifeMonths: number) => (lifeMonths > 0 ? (2 / (lifeMonths / 12)) * 100 : 0);

/**
 * Year-by-year depreciation schedule.
 *
 * Straight line:      annual = (cost - salvage) / useful life (years)
 * Declining balance:  annual = opening book value x rate; salvage is ignored in the rate
 *                     but book value never falls below salvage.
 */
export function buildSchedule({ cost, salvage, lifeMonths, method, ratePct }: ScheduleInput): ScheduleRow[] {
  if (!(cost > 0) || !(lifeMonths > 0)) return [];
  const floor = Math.min(Math.max(0, salvage || 0), cost);
  const years = Math.ceil(lifeMonths / 12);
  const declining = /declin/i.test(method);
  const rate = (ratePct && ratePct > 0 ? ratePct : defaultDecliningRate(lifeMonths)) / 100;
  const annual = (cost - floor) / (lifeMonths / 12);

  const rows: ScheduleRow[] = [];
  let opening = cost;
  let accumulated = 0;
  for (let y = 1; y <= years; y++) {
    const fraction = Math.min(1, (lifeMonths - (y - 1) * 12) / 12);
    const room = Math.max(0, opening - floor);
    let dep = declining ? opening * rate * fraction : annual * fraction;
    dep = Math.min(dep, room);
    // On the final straight-line year take whatever is left so rounding never leaves a residue.
    if (!declining && y === years) dep = room;
    dep = r2(dep);
    accumulated = r2(accumulated + dep);
    const closing = r2(opening - dep);
    rows.push({ year: y, opening: r2(opening), depreciation: dep, accumulated, closing });
    opening = closing;
  }
  return rows;
}
