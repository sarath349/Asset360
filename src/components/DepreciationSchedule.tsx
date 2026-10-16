import { useMemo } from 'react';
import { ApiDepreciation, depreciationMethodLabel } from '../api/assetApi';
import { buildSchedule, defaultDecliningRate } from '../lib/depreciation';
import { date, money } from '../lib/format';
import { Modal } from './ui';

export function ScheduleTable({ record }: { record: Pick<ApiDepreciation, 'purchaseValue' | 'residualValue' | 'usefulLifeMonths' | 'depreciationMethod' | 'annualDepreciationRate' | 'depreciationStartDate' | 'currentBookValue'> }) {
  const declining = /declin/i.test(record.depreciationMethod);
  const rows = useMemo(
    () =>
      buildSchedule({
        cost: record.purchaseValue,
        salvage: record.residualValue,
        lifeMonths: record.usefulLifeMonths,
        method: record.depreciationMethod,
        ratePct: record.annualDepreciationRate,
      }),
    [record]
  );
  const rate = record.annualDepreciationRate && record.annualDepreciationRate > 0 ? record.annualDepreciationRate : defaultDecliningRate(record.usefulLifeMonths);
  const start = record.depreciationStartDate ? new Date(record.depreciationStartDate) : null;
  const elapsedYears = start ? Math.max(0, Math.floor((Date.now() - start.getTime()) / (365.25 * 86400000))) : 0;
  const expected = elapsedYears > 0 ? rows[Math.min(elapsedYears, rows.length) - 1] : null;

  if (!rows.length) return <div className="muted small">Enter a purchase value and useful life to see the schedule.</div>;

  return (
    <div className="stack">
      <div className="small muted">
        {declining ? (
          <>
            Declining balance at <b>{Math.round(rate * 100) / 100}%</b>: depreciation = opening book value × rate. Salvage is ignored in the calculation, but book value never goes below <b>{money(record.residualValue)}</b>.
          </>
        ) : (
          <>
            Straight line: ({money(record.purchaseValue)} − {money(record.residualValue)}) ÷ {Math.round((record.usefulLifeMonths / 12) * 100) / 100} years ={' '}
            <b>{money((record.purchaseValue - record.residualValue) / (record.usefulLifeMonths / 12))}</b> per year.
          </>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="right">Opening book value</th>
              <th className="right">Depreciation</th>
              <th className="right">Accumulated</th>
              <th className="right">Closing book value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} style={expected?.year === r.year ? { background: 'var(--primary-50)' } : undefined}>
                <td>{r.year}</td>
                <td className="right">{money(r.opening)}</td>
                <td className="right">{money(r.depreciation)}</td>
                <td className="right">{money(r.accumulated)}</td>
                <td className="right">
                  <b>{money(r.closing)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {expected && (
        <div className="alert alert-info">
          <div className="small">
            After {elapsedYears} full year{elapsedYears === 1 ? '' : 's'} (since {date(record.depreciationStartDate)}) the schedule gives a book value of <b>{money(expected.closing)}</b>. The API currently reports <b>{money(record.currentBookValue)}</b>
            {Math.abs(expected.closing - record.currentBookValue) > 1 ? ' (recalculate, or the API uses a different convention).' : ' (matches).'}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScheduleModal({ open, onClose, record, title }: { open: boolean; onClose: () => void; record: ApiDepreciation | null; title?: string }) {
  if (!record) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg" title={title || `${depreciationMethodLabel(record.depreciationMethod)} schedule`} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <ScheduleTable record={record} />
    </Modal>
  );
}
