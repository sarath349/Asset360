import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, Trash2, Truck, Users } from 'lucide-react';
import { ApiDepartment, ApiEmployee, departmentApi, employeeApi } from '../../api/assetApi';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { DepartmentNode, EmployeeNode, useData, useNames } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { date, toInputDate } from '../../lib/format';
import { Avatar, Confirm, DataTable, Empty, Field, Modal, PageHeader, SearchInput, StatusBadge, Switch, Tabs } from '../../components/ui';
import { DepartmentPicker, LocationPicker } from '../../components/pickers';
import { ComingSoon } from '../../components/ComingSoon';

type Entity = 'departments' | 'employees';
type Kind = Entity | 'vendors';
const SINGULAR: Record<Entity, string> = { departments: 'department', employees: 'employee' };

const toId = (v: string | null | undefined) => (v ? Number(v) : null);
const toKey = (v: number | null | undefined) => (v ? String(v) : null);

export default function OrganizationPage() {
  const [params, setParams] = useSearchParams();
  const kind = (params.get('tab') as Kind) || 'employees';
  const tab: Entity = kind === 'departments' ? 'departments' : 'employees';
  const { departments: allDepartments, employees: allEmployees, reload } = useData();
  const { scopeIds, deptInScope, activeBranchId } = useBranch();
  const departments = useMemo(() => allDepartments.filter((d) => deptInScope(d.departmentId)), [allDepartments, deptInScope]);
  const employees = useMemo(
    () => allEmployees.filter((e) => !scopeIds || (e.locationId ? scopeIds.has(String(e.locationId)) : deptInScope(e.departmentId))),
    [allEmployees, scopeIds, deptInScope]
  );
  const names = useNames();
  const { can } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [remove, setRemove] = useState<any>(null);

  const rows = useMemo(() => {
    const list: any[] = tab === 'departments' ? departments : employees;
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter((r: any) => [r.name, r.code, r.empCode, r.email, r.phone, r.designation].some((x) => x?.toLowerCase().includes(s)));
  }, [tab, departments, employees, q]);

  // New records start in the active branch so they stay visible in the branch view.
  const blank = { isActive: true, locationId: activeBranchId ? Number(activeBranchId) : null };

  const save = async (item: any) => {
    try {
      if (tab === 'employees') {
        const body: Partial<ApiEmployee> = {
          employeeCode: item.employeeCode?.trim() || null,
          fullName: item.fullName?.trim(),
          email: item.email?.trim() || null,
          phone: item.phone?.trim() || null,
          designation: item.designation?.trim() || null,
          departmentId: item.departmentId || null,
          locationId: item.locationId || null,
          dateOfJoining: item.dateOfJoining || null,
          isActive: item.isActive !== false,
        };
        if (!body.fullName) return toast.error('Full name is required');
        if (item.employeeId) await employeeApi.update(item.employeeId, { ...body, createdDate: item.createdDate });
        else await employeeApi.create(body);
      } else {
        const body: Partial<ApiDepartment> = {
          departmentName: item.departmentName?.trim(),
          departmentCode: item.departmentCode?.trim() || null,
          locationId: item.locationId || null,
          description: item.description?.trim() || null,
          isActive: item.isActive !== false,
        };
        if (!body.departmentName) return toast.error('Department name is required');
        if (!body.departmentCode) return toast.error('Department code is required');
        if (item.departmentId) await departmentApi.update(item.departmentId, { ...body, createdDate: item.createdDate });
        else await departmentApi.create(body);
      }
      await reload([tab]);
      toast.success('Saved');
      setEdit(null);
    } catch (err) {
      toast.error(err);
    }
  };

  const columns: Record<Entity, any[]> = {
    departments: [
      { key: 'name', label: 'Department', render: (d: DepartmentNode) => <div><div className="cell-main">{d.name}</div><div className="cell-sub mono">{d.code}</div></div> },
      { key: 'location', label: 'Location', sortValue: (d: DepartmentNode) => names.location(d.locationId), render: (d: DepartmentNode) => names.location(d.locationId) || '—' },
      { key: 'description', label: 'Description', render: (d: DepartmentNode) => <span className="small muted">{d.description || '—'}</span> },
      {
        key: 'count',
        label: 'Employees',
        className: 'right',
        sortValue: (d: DepartmentNode) => employees.filter((e) => e.departmentId === d.departmentId).length,
        render: (d: DepartmentNode) => employees.filter((e) => e.departmentId === d.departmentId).length,
      },
      { key: 'isActive', label: 'Status', render: (d: DepartmentNode) => <StatusBadge status={d.isActive ? 'active' : 'inactive'} /> },
    ],
    employees: [
      {
        key: 'name',
        label: 'Employee',
        render: (e: EmployeeNode) => (
          <div className="row" style={{ gap: 10 }}>
            <Avatar name={e.name} size="sm" />
            <div>
              <div className="cell-main">{e.name}</div>
              <div className="cell-sub">{e.designation}</div>
            </div>
          </div>
        ),
      },
      { key: 'empCode', label: 'Emp. code', render: (e: EmployeeNode) => <span className="mono">{e.empCode || '—'}</span> },
      { key: 'department', label: 'Department', sortValue: (e: EmployeeNode) => names.department(e.departmentId), render: (e: EmployeeNode) => names.department(e.departmentId) || '—' },
      { key: 'location', label: 'Location', render: (e: EmployeeNode) => names.location(e.locationId) || '—' },
      { key: 'email', label: 'Contact', render: (e: EmployeeNode) => <span className="small">{e.email}<div className="cell-sub">{e.phone}</div></span> },
      { key: 'dateOfJoining', label: 'Joined', sortValue: (e: EmployeeNode) => e.dateOfJoining, render: (e: EmployeeNode) => date(e.dateOfJoining) },
      { key: 'active', label: 'Status', render: (e: EmployeeNode) => <StatusBadge status={e.active ? 'active' : 'inactive'} /> },
    ],
  };

  const openEdit = async (r: any) => {
    try {
      const fresh = tab === 'employees' ? await employeeApi.get(r.employeeId) : await departmentApi.get(r.departmentId);
      setEdit({ ...r, ...fresh });
    } catch (err) {
      toast.error(err);
      await reload([tab]);
    }
  };

  const removeRecord = async () => {
    try {
      if (tab === 'employees') await employeeApi.remove(remove.employeeId);
      else await departmentApi.remove(remove.departmentId);
      await reload([tab]);
      toast.success('Deleted');
      setRemove(null);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Departments & Employees"
        subtitle="Departments and employees (asset custodians) per branch, plus vendors."
        actions={kind !== 'vendors' && can('organization', 'create') && <button className="btn btn-primary" onClick={() => setEdit(blank)}><Plus size={16} /> Add {SINGULAR[tab]}</button>}
      />
      <div className="card">
        <Tabs
          active={kind}
          onChange={(t) => { setParams({ tab: t }); setQ(''); }}
          tabs={[
            { key: 'employees', label: 'Employees', count: employees.length, icon: <Users size={15} /> },
            { key: 'departments', label: 'Departments', count: departments.length, icon: <Building2 size={15} /> },
            { key: 'vendors', label: 'Vendors', icon: <Truck size={15} /> },
          ]}
        />
        {kind === 'vendors' ? (
          <ComingSoon />
        ) : (
        <>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder={`Search ${tab}…`} />
        </div>
        <DataTable
          rows={rows}
          pageSize={20}
          empty={
            <Empty
              title={`No ${tab} yet`}
              action={can('organization', 'create') && <button className="btn btn-sm btn-primary" onClick={() => setEdit(blank)}><Plus size={14} /> Add {SINGULAR[tab]}</button>}
            />
          }
          columns={[
            ...columns[tab],
            {
              key: 'act',
              label: '',
              sortable: false,
              className: 'right',
              render: (r: any) => (
                <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                  {can('organization', 'edit') && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openEdit(r)}><Pencil size={14} /></button>}
                  {can('organization', 'delete') && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setRemove(r)}><Trash2 size={14} /></button>}
                </div>
              ),
            },
          ]}
        />
        </>
        )}
      </div>
      {edit && <EntityModal kind={tab} item={edit} onClose={() => setEdit(null)} onSave={save} />}
      <Confirm
        open={Boolean(remove)}
        title={`Delete ${SINGULAR[tab]}`}
        message={`Delete "${remove?.name}"? Assets referencing it keep their history.`}
        danger
        confirmText="Delete"
        onClose={() => setRemove(null)}
        onConfirm={removeRecord}
      />
    </>
  );
}

function EntityModal({ kind, item, onClose, onSave }: { kind: Entity; item: any; onClose: () => void; onSave: (x: any) => void }) {
  const [f, setF] = useState<any>({ ...item, dateOfJoining: toInputDate(item.dateOfJoining) });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const isNew = !(item.employeeId || item.departmentId);
  const submit = async () => {
    setBusy(true);
    await onSave(f);
    setBusy(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isNew ? 'New' : 'Edit'} ${SINGULAR[kind]}`}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="form-grid">
        {kind === 'departments' && (
          <>
            <Field label="Department name" required><input className="input" value={f.departmentName || ''} onChange={(e) => set('departmentName', e.target.value)} autoFocus /></Field>
            <Field label="Code" required><input className="input mono" value={f.departmentCode || ''} onChange={(e) => set('departmentCode', e.target.value)} /></Field>
            <Field label="Description" className="full"><textarea className="textarea" value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
            <label className="row small" style={{ gap: 10 }}><Switch checked={f.isActive !== false} onChange={(v) => set('isActive', v)} /> Active</label>
          </>
        )}
        {kind === 'employees' && (
          <>
            <Field label="Full name" required><input className="input" value={f.fullName || ''} onChange={(e) => set('fullName', e.target.value)} autoFocus /></Field>
            <Field label="Employee code"><input className="input mono" value={f.employeeCode || ''} onChange={(e) => set('employeeCode', e.target.value)} /></Field>
            <Field label="Designation"><input className="input" value={f.designation || ''} onChange={(e) => set('designation', e.target.value)} /></Field>
            <Field label="Department"><DepartmentPicker value={toKey(f.departmentId)} onChange={(v) => set('departmentId', toId(v))} /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone / WhatsApp"><input className="input" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Work location"><LocationPicker value={toKey(f.locationId)} onChange={(v) => set('locationId', toId(v))} /></Field>
            <Field label="Date of joining"><input type="date" className="input" value={f.dateOfJoining || ''} onChange={(e) => set('dateOfJoining', e.target.value)} /></Field>
            <label className="row small" style={{ gap: 10 }}><Switch checked={f.isActive !== false} onChange={(v) => set('isActive', v)} /> Active</label>
          </>
        )}
      </div>
    </Modal>
  );
}
