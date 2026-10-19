import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound, Monitor, Pencil, Plus, ShieldCheck, Smartphone, Trash2, UserX } from 'lucide-react';
import { ApiUser, departmentApi, USER_ROLES, userApi, userDisplayName } from '../../api/assetApi';
import { useFetch } from '../../lib/hooks';
import { ago } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useData } from '../../context/DataContext';
import { branchOf } from '../../lib/branch';
import { useToast } from '../../context/ToastContext';
import { Avatar, Badge, Confirm, DataTable, Empty, ErrorState, Field, Kpi, Loading, Modal, PageHeader, SearchInput, StatusBadge, Switch, Tabs } from '../../components/ui';

type Row = ApiUser & { _id: string };
type LoginTab = 'web' | 'mobile';

const MOBILE_ROLES = ['Technician', 'Auditor', 'Employee'];
const WEB_ROLES = USER_ROLES.filter((r) => !MOBILE_ROLES.includes(r));
const isMobileRole = (role?: string | null) => MOBILE_ROLES.some((r) => r.toLowerCase() === (role || '').trim().toLowerCase());

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
  const [params, setParams] = useSearchParams();
  const tab = ((params.get('tab') as LoginTab) || 'web') as LoginTab;
  const { can, user: me } = useAuth();
  const { reload: reloadLookups, departments, locations } = useData();
  const { branches, isSuperAdmin, activeBranchId, deptInScope, scopeIds } = useBranch();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const { data: users, loading, error, reload } = useFetch(() => userApi.list(), []);

  const rows: Row[] = useMemo(() => (users || []).map((u) => ({ ...u, _id: String(u.userId) })), [users]);
  const tabRoles = useMemo(() => {
    const base = tab === 'mobile' ? MOBILE_ROLES : WEB_ROLES;
    const fromData = rows.map((u) => u.role).filter((r): r is string => Boolean(r) && (tab === 'mobile' ? isMobileRole(r) : !isMobileRole(r)));
    return ([...new Set([...base, ...fromData])] as string[]).filter((r) => isSuperAdmin || r.toLowerCase() !== 'super admin');
  }, [tab, rows, isSuperAdmin]);

  const branchOfUser = (u: Pick<ApiUser, 'departmentId'>) => {
    const d = departments.find((x) => x.departmentId === u.departmentId);
    return d?.locationId ? branchOf(d.locationId, locations) : null;
  };

  const scoped = useMemo(() => (scopeIds ? rows.filter((u) => deptInScope(u.departmentId)) : rows), [rows, scopeIds, deptInScope]);
  const webUsers = useMemo(() => scoped.filter((u) => !isMobileRole(u.role)), [scoped]);
  const mobileUsers = useMemo(() => scoped.filter((u) => isMobileRole(u.role)), [scoped]);
  const tabUsers = tab === 'mobile' ? mobileUsers : webUsers;

  const list = useMemo(() => {
    let l = tabUsers;
    if (role) l = l.filter((u) => (u.role || '') === role);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((u) => [u.fullName, u.username, u.email, u.phone].some((x) => x?.toLowerCase().includes(s)));
    }
    return l;
  }, [tabUsers, role, q]);

  const switchTab = (next: string) => {
    setParams({ tab: next });
    setQ('');
    setRole('');
    setEdit(null);
  };

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

  const openEdit = (u: Row) =>
    setEdit({
      userId: u.userId, username: u.username || '', fullName: u.fullName || '', email: u.email || '', phone: u.phone || '', role: u.role || '', isActive: u.isActive, password: '',
      branchId: branchOfUser(u)?._id || '', departmentId: u.departmentId,
    });
  const blankUser = (): Draft => ({
    username: '', fullName: '', email: '', phone: '', role: tab === 'mobile' ? 'Employee' : '', isActive: true, password: '',
    branchId: activeBranchId || '', departmentId: null,
  });

  if (error && !users) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Admins & Users"
        subtitle={tab === 'mobile' ? 'Mobile app logins for technicians, auditors and employees.' : isSuperAdmin ? 'Web / admin logins. Each belongs to one branch.' : 'Web / admin logins for your branch.'}
        actions={
          can('users', 'create') && (
            <button className="btn btn-primary" onClick={() => setEdit(blankUser())}>
              <Plus size={16} /> Add {tab === 'mobile' ? 'mobile user' : 'user'}
            </button>
          )
        }
      />
      <div className="grid grid-kpi mb">
        <Kpi label="Web / Admin" value={webUsers.length} icon={<Monitor size={19} />} />
        <Kpi label="Mobile" value={mobileUsers.length} icon={<Smartphone size={19} />} toneName="indigo" />
        <Kpi label="Active" value={tabUsers.filter((u) => u.isActive).length} icon={<ShieldCheck size={19} />} toneName="green" />
        <Kpi label="Disabled" value={tabUsers.filter((u) => !u.isActive).length} icon={<UserX size={19} />} toneName="slate" />
      </div>
      <div className="card">
        <Tabs
          active={tab}
          onChange={switchTab}
          tabs={[
            { key: 'web', label: 'Web / Admin login', count: webUsers.length, icon: <Monitor size={15} /> },
            { key: 'mobile', label: 'Mobile login', count: mobileUsers.length, icon: <Smartphone size={15} /> },
          ]}
        />
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder={`Search ${tab === 'mobile' ? 'mobile' : 'web'} users…`} />
          <select className="select" style={{ width: 200 }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {tabRoles.map((r) => (
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
            empty={<Empty title={tab === 'mobile' ? 'No mobile users yet' : 'No web users yet'} action={can('users', 'create') && <button className="btn btn-sm btn-primary" onClick={() => setEdit(blankUser())}><Plus size={14} /> Add {tab === 'mobile' ? 'mobile user' : 'user'}</button>} />}
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
      {edit && <UserModal user={edit} roles={tabRoles} loginKind={tab} onClose={() => setEdit(null)} onSave={save} />}
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

function UserModal({ user, roles, loginKind, onClose, onSave }: { user: Draft; roles: string[]; loginKind: LoginTab; onClose: () => void; onSave: (u: Draft) => Promise<void> }) {
  const [f, setF] = useState<Draft>(user);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((p) => ({ ...p, [k]: v }));
  const isNew = !user.userId;
  const valid = f.username.trim() && (!isNew || f.password);

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
      title={isNew ? `Add ${loginKind === 'mobile' ? 'mobile' : 'web'} user` : `Edit ${user.fullName || user.username}`}
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
        <Field label="Role" hint={loginKind === 'mobile' ? 'Mobile users land in the mobile app after sign-in' : 'Web / admin users use the desktop app'}>
          <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r}>{r}</option>
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
