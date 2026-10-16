import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserX, Users } from 'lucide-react';
import { ApiUser, departmentApi, USER_ROLES, userApi, userDisplayName } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { ago } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { DepartmentNode, LocationNode, useData } from '../../context/DataContext';
import { branchOf } from '../../lib/branch';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge, Confirm, DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, SearchInput, StatusBadge, Switch } from '../../components/ui';

type Row = ApiUser & { _id: string };

interface Draft {
  userId?: number;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  password: string;
  branchId: string;
  departmentId: number | null;
}

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const { reload: reloadLookups, departments, locations } = useData();
  const { branches, locked, isSuperAdmin, activeBranchId, deptInScope, scopeIds } = useBranch();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const { data: users, loading, error, reload } = useFetch(() => userApi.list(), []);

  const rows: Row[] = useMemo(() => (users || []).map((u) => ({ ...u, _id: String(u.userId) })), [users]);
  // Only a super admin can create other super admins; a branch admin manages the users of their own branch.
  const roles = useMemo(() => ([...new Set([...USER_ROLES, ...rows.map((u) => u.role).filter(Boolean)])] as string[]).filter((r) => isSuperAdmin || r.toLowerCase() !== 'super admin'), [rows, isSuperAdmin]);
  const branchOfUser = (u: Pick<ApiUser, 'departmentId'>) => {
    const d = departments.find((x) => x.departmentId === u.departmentId);
    return d?.locationId ? branchOf(d.locationId, locations) : null;
  };

  const list = useMemo(() => {
    let l = scopeIds ? rows.filter((u) => deptInScope(u.departmentId)) : rows;
    if (role) l = l.filter((u) => (u.role || '') === role);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((u) => [u.fullName, u.username, u.email, u.phone].some((x) => x?.toLowerCase().includes(s)));
    }
    return l;
  }, [rows, role, q, scopeIds, deptInScope]);

  const save = async (d: Draft) => {
    try {
      const existing = d.userId ? rows.find((u) => u.userId === d.userId) : undefined;
      // The API stores no branch on a user. The branch is the location of the user's department, so a branch with
      // no department chosen gets a "General" department that holds its users.
      let departmentId = d.departmentId;
      const branch = branches.find((b) => b._id === d.branchId);
      if (branch && !departmentId) {
        const code = `GEN-${branch.code || branch.locationId}`;
        const found = departments.find((x) => x.locationId === branch.locationId && x.departmentCode === code);
        if (found) departmentId = found.departmentId;
        else {
          const created = await departmentApi.create({ departmentName: `${branch.name} - General`, departmentCode: code, locationId: branch.locationId, isActive: true });
          departmentId = created?.departmentId ?? null;
          await reloadLookups(['departments']);
        }
      }
      const body: Partial<ApiUser> = {
        ...existing,
        departmentId,
        username: d.username.trim(),
        fullName: d.fullName.trim() || null,
        email: d.email.trim() || null,
        phone: d.phone.trim() || null,
        role: d.role || null,
        isActive: d.isActive,
        passwordHash: d.password || existing?.passwordHash || null,
        createdDate: existing?.createdDate || new Date().toISOString(),
      };
      if (d.userId) await userApi.update(d.userId, body);
      else await userApi.create(body);
      toast.success('User saved');
      setEdit(null);
      reload();
      reloadLookups(['users']);
    } catch (err) {
      toast.error(err);
    }
  };

  const branchOfDept = (d: DepartmentNode) => (d.locationId ? branchOf(d.locationId, locations)?._id || null : null);
  const openEdit = (u: Row) =>
    setEdit({
      userId: u.userId, username: u.username || '', fullName: u.fullName || '', email: u.email || '', phone: u.phone || '', role: u.role || '', isActive: u.isActive, password: '',
      branchId: branchOfUser(u)?._id || '', departmentId: u.departmentId,
    });
  const blankUser = (): Draft => ({
    username: '', fullName: '', email: '', phone: '', role: '', isActive: true, password: '',
    branchId: activeBranchId || '', departmentId: null,
  });

  if (error && !users) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Admins & Users"
        subtitle={isSuperAdmin ? 'Create branch admins and branch users. Each login belongs to one branch.' : 'Create and manage logins for your branch.'}
        actions={
          can('users', 'create') && (
            <button className="btn btn-primary" onClick={() => setEdit(blankUser())}>
              <Plus size={16} /> Add user
            </button>
          )
        }
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Users" value={users?.length ?? '—'} icon={<Users size={19} />} />
        <Kpi label="Active" value={users?.filter((u) => u.isActive).length ?? '—'} icon={<ShieldCheck size={19} />} toneName="green" />
        <Kpi label="Disabled" value={users?.filter((u) => !u.isActive).length ?? '—'} icon={<UserX size={19} />} toneName="slate" />
      </div>
      <div className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Search users…" />
          <select className="select" style={{ width: 200 }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        {loading && !users ? (
          <Loading />
        ) : (
          <DataTable
            rows={list}
            pageSize={20}
            empty={<Empty title="No users" />}
            columns={[
              {
                key: 'fullName',
                label: 'User',
                sortValue: (u: Row) => userDisplayName(u),
                render: (u: Row) => (
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={userDisplayName(u)} size="sm" />
                    <div>
                      <div className="cell-main">{userDisplayName(u)}</div>
                      <div className="cell-sub mono">{u.username}</div>
                    </div>
                  </div>
                ),
              },
              { key: 'email', label: 'Email', render: (u: Row) => <span className="small">{u.email || '—'}</span> },
              { key: 'phone', label: 'Phone', render: (u: Row) => <span className="small">{u.phone || '—'}</span> },
              { key: 'branch', label: 'Branch', sortable: false, render: (u: Row) => <span className="small">{branchOfUser(u)?.name || <span className="muted">All branches</span>}</span> },
              { key: 'role', label: 'Role', render: (u: Row) => (u.role ? <Badge color="indigo">{u.role}</Badge> : <span className="small muted">—</span>) },
              { key: 'lastLogin', label: 'Last login', render: (u: Row) => <span className="small muted">{u.lastLogin ? ago(u.lastLogin) : 'Never'}</span> },
              { key: 'isActive', label: 'Status', render: (u: Row) => <StatusBadge status={u.isActive ? 'active' : 'inactive'} /> },
              {
                key: 'act',
                label: '',
                sortable: false,
                className: 'right',
                render: (u: Row) => (
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                    {can('users', 'edit') && (
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => openEdit(u)}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {can('users', 'delete') && u.userId !== me?.userId && (
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setRemove(u)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
      {edit && <UserModal user={edit} roles={roles} branches={branches} departments={departments} branchOfDept={branchOfDept} lockedBranch={locked} onClose={() => setEdit(null)} onSave={save} />}
      <Confirm
        open={Boolean(remove)}
        title="Delete user"
        message={`Delete ${remove ? userDisplayName(remove) : ''}'s login?`}
        danger
        confirmText="Delete"
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          try {
            await userApi.remove(remove.userId);
            setRemove(null);
            reload();
            reloadLookups(['users']);
          } catch (err) {
            toast.error(err);
          }
        }}
      />
    </>
  );
}

function UserModal({ user, roles, branches, departments, branchOfDept, lockedBranch, onClose, onSave }: { user: Draft; roles: string[]; branches: LocationNode[]; departments: DepartmentNode[]; branchOfDept: (d: DepartmentNode) => string | null; lockedBranch: boolean; onClose: () => void; onSave: (u: Draft) => Promise<void> }) {
  const [f, setF] = useState<Draft>(user);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((p) => ({ ...p, [k]: v }));
  const isNew = !user.userId;
  const needsBranch = isNew && f.role.toLowerCase() !== 'super admin' && branches.length > 0;
  const valid = f.username.trim() && (!isNew || f.password) && (!needsBranch || f.branchId);

  const submit = async () => {
    setBusy(true);
    await onSave(f);
    setBusy(false);
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isNew ? 'Add user' : `Edit ${user.fullName || user.username}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            Save user
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Full name">
          <input className="input" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="Username (login)" required>
          <input className="input" value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+971 50 000 0000" />
        </Field>
        <Field label={isNew ? 'Password' : 'New password'} required={isNew} hint={isNew ? undefined : 'Leave blank to keep current'}>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" type="text" value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
            <button type="button" className="btn btn-icon" title="Generate" onClick={() => set('password', `Ap${Math.random().toString(36).slice(2, 8)}!${Math.floor(Math.random() * 90 + 10)}`)}>
              <KeyRound size={15} />
            </button>
          </div>
        </Field>
        <Field label="Role" hint="Super Admin sees every branch; other roles are limited to their branch">
          <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Branch" required={needsBranch} hint={lockedBranch ? 'Fixed to your branch' : 'Empty = access to all branches (super admin)'}>
          <select className="select" value={f.branchId} disabled={lockedBranch} onChange={(e) => setF((p) => ({ ...p, branchId: e.target.value, departmentId: null }))}>
            <option value="">{branches.length ? 'All branches' : 'No branches yet (add a Site under Branches & Locations)'}</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department" hint="Optional. Defaults to the branch's General department">
          <select className="select" value={f.departmentId ?? ''} disabled={!f.branchId} onChange={(e) => set('departmentId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">General</option>
            {departments
              .filter((d) => branchOfDept(d) === f.branchId)
              .map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="full row small" style={{ gap: 8 }}>
          <Switch checked={f.isActive} onChange={(v) => set('isActive', v)} /> Account active
        </div>
      </div>
    </Modal>
  );
}
