import { ReactNode } from 'react';
import { ApiAssignment } from '../api/assetApi';
import { useNames } from '../context/DataContext';
import { date, dateTime } from '../lib/format';
import { Badge, DataTable, Empty, StatusBadge } from './ui';

export function AssignmentTable({ rows, showAsset, onRowClick, empty }: { rows: ApiAssignment[]; showAsset?: (assetId: number) => ReactNode; onRowClick?: (r: ApiAssignment) => void; empty?: ReactNode }) {
  const names = useNames();
  const party = (emp: number | null, loc: number | null, dep: number | null) => (emp ? names.employee(emp) : loc ? names.location(loc) : dep ? names.department(dep) : 'Store');
  return (
    <DataTable
      rows={rows.map((r) => ({ ...r, _id: String(r.assignmentHistoryId) }))}
      onRowClick={onRowClick}
      initialSort={{ key: 'transactionDate', dir: 'desc' }}
      empty={empty || <Empty title="No movements yet" message="Assignments, transfers and returns appear here." />}
      columns={[
        { key: 'transactionDate', label: 'Date', sortValue: (t) => t.transactionDate, render: (t) => dateTime(t.transactionDate) },
        ...(showAsset ? [{ key: 'assetId', label: 'Asset', render: (t: ApiAssignment) => showAsset(t.assetId) }] : []),
        { key: 'transactionType', label: 'Type', render: (t) => <Badge color="indigo" plain>{t.transactionType || '—'}</Badge> },
        {
          key: 'movement',
          label: 'Movement',
          sortable: false,
          render: (t) => (
            <div className="small">
              <span className="muted">{party(t.fromEmployeeId, t.fromLocationId, t.fromDepartmentId)}</span>
              <span className="faint"> → </span>
              <b>{party(t.toEmployeeId, t.toLocationId, t.toDepartmentId)}</b>
              {t.isTemporary && t.expectedReturnDate && <div className="cell-sub">Return by {date(t.expectedReturnDate)}</div>}
            </div>
          ),
        },
        { key: 'conditionAtHandover', label: 'Condition', render: (t) => t.conditionAtHandover || '—' },
        { key: 'requestedBy', label: 'By', render: (t) => names.user(t.requestedBy) || '—' },
        { key: 'status', label: 'Status', render: (t) => <StatusBadge status={t.status || undefined} /> },
      ]}
    />
  );
}
