import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ApiApprovalLevel, approvalLevelApi, USER_ROLES } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { date } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Confirm, DataTable, Empty, ErrorState, Field, Loading, Modal, PageHeader, Switch } from '../../components/ui';

const MODULES = [
  { value: 'disposal', label: 'Disposal' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'maintenance', label: 'Maintenance' },
];

export default function ApprovalLevelsPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => approvalLevelApi.list(), []);
  const [edit, setEdit] = useState<Partial<ApiApprovalLevel> | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data || []).map((r) => ({ ...r, _id: String(r.approvalLevelId) })), [data]);

  const save = async () => {
    if (!edit?.levelName?.trim()) return toast.error('Level name is required');
    setBusy(true);
    try {
      if (edit.approvalLevelId) await approvalLevelApi.update(edit.approvalLevelId, edit);
      else await approvalLevelApi.create({ ...edit, createdBy: user?.userId ?? null });
      setEdit(null);
      await reload();
      toast.success('Saved');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Approval levels"
        subtitle="Define approval steps by module. Disposal and receipt workflows use these levels for who can approve."
        actions={
          can('roles', 'create') && (
            <button
              className="btn btn-primary"
              onClick={() => setEdit({ levelCode: 'L1', levelName: 'Level 1', module: 'disposal', stepOrder: 1, role: 'Asset Manager', isActive: true, minAmount: null })}
            >
              <Plus size={16} /> Add level
            </button>
          )
        }
      />
      <div className="card">
        {loading && !data ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            empty={<Empty title="No approval levels" />}
            columns={[
              { key: 'levelCode', label: 'Code', render: (r: ApiApprovalLevel) => <span className="mono bold">{r.levelCode}</span> },
              { key: 'levelName', label: 'Name', render: (r: ApiApprovalLevel) => r.levelName },
              { key: 'module', label: 'Module', render: (r: ApiApprovalLevel) => MODULES.find((m) => m.value === r.module)?.label || r.module },
              { key: 'stepOrder', label: 'Step', className: 'right', render: (r: ApiApprovalLevel) => r.stepOrder },
              { key: 'role', label: 'Role', render: (r: ApiApprovalLevel) => r.role || 'Any approver' },
              { key: 'minAmount', label: 'Min amount', className: 'right', render: (r: ApiApprovalLevel) => (r.minAmount != null ? r.minAmount : '—') },
              { key: 'isActive', label: 'Active', render: (r: ApiApprovalLevel) => (r.isActive ? 'Yes' : 'No') },
              { key: 'createdDate', label: 'Created', render: (r: ApiApprovalLevel) => date(r.createdDate) },
              {
                key: 'actions',
                label: '',
                render: (r: ApiApprovalLevel) =>
                  can('roles', 'edit') && (
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => setEdit(r)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setRemoveId(r.approvalLevelId)}>Delete</button>
                    </div>
                  ),
              },
            ]}
          />
        )}
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.approvalLevelId ? 'Edit approval level' : 'New approval level'}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}
      >
        {edit && (
          <div className="stack">
            <div className="grid grid-2">
              <Field label="Code"><input className="input" value={edit.levelCode || ''} onChange={(e) => setEdit({ ...edit, levelCode: e.target.value })} /></Field>
              <Field label="Name"><input className="input" value={edit.levelName || ''} onChange={(e) => setEdit({ ...edit, levelName: e.target.value })} /></Field>
              <Field label="Module">
                <select className="select" value={edit.module || 'disposal'} onChange={(e) => setEdit({ ...edit, module: e.target.value })}>
                  {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Step order"><input type="number" min={1} className="input" value={edit.stepOrder ?? 1} onChange={(e) => setEdit({ ...edit, stepOrder: Number(e.target.value) || 1 })} /></Field>
              <Field label="Approver role">
                <select className="select" value={edit.role || ''} onChange={(e) => setEdit({ ...edit, role: e.target.value || null })}>
                  <option value="">Any role with approve permission</option>
                  {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Min amount (optional)"><input type="number" min={0} className="input" value={edit.minAmount ?? ''} onChange={(e) => setEdit({ ...edit, minAmount: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
            </div>
            <label className="checkbox"><Switch checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} /> Active</label>
          </div>
        )}
      </Modal>

      <Confirm
        open={removeId != null}
        danger
        title="Delete approval level?"
        message="Workflows that referenced this step will fall back to any user with approve permission."
        confirmText="Delete"
        onClose={() => setRemoveId(null)}
        onConfirm={async () => {
          try {
            await approvalLevelApi.remove(removeId!);
            setRemoveId(null);
            await reload();
          } catch (err) {
            toast.error(err);
          }
        }}
      />
    </>
  );
}
