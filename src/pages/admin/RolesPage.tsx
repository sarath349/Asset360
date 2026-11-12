import { ShieldCheck } from 'lucide-react';
import { USER_ROLES } from '../../api/assetApi';
import { PageHeader, Card } from '../../components/ui';
import { Link } from 'react-router-dom';

const MODULES: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'assets', label: 'Assets' },
  { key: 'categories', label: 'Categories' },
  { key: 'locations', label: 'Locations' },
  { key: 'transfers', label: 'Assign & Transfer' },
  { key: 'audits', label: 'Audits' },
  { key: 'contracts', label: 'AMC & Warranty' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'loans', label: 'Asset loans' },
  { key: 'procurement', label: 'Receipts' },
  { key: 'disposal', label: 'Disposal' },
  { key: 'depreciation', label: 'Depreciation' },
  { key: 'tags', label: 'Labels' },
  { key: 'reports', label: 'Reports' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles' },
];

const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;

/** Mirrors AuthContext ROLE_PERMISSIONS for an admin-readable matrix. */
const ROLE_MATRIX: Record<string, Partial<Record<string, string[]>>> = {
  'Super Admin': Object.fromEntries(MODULES.map((m) => [m.key, [...ACTIONS]])),
  Admin: Object.fromEntries(MODULES.map((m) => [m.key, [...ACTIONS]])),
  'Asset Manager': Object.fromEntries(MODULES.filter((m) => m.key !== 'users').map((m) => [m.key, [...ACTIONS]])),
  'Facility Manager': {
    dashboard: ['view'], assets: ['view', 'create', 'edit', 'export'], categories: ['view', 'create', 'edit'], locations: ['view', 'create', 'edit'],
    transfers: ['view', 'create'], audits: ['view', 'create', 'edit'], contracts: ['view', 'create', 'edit'], maintenance: ['view', 'create', 'edit'],
    insurance: ['view', 'create', 'edit'], loans: ['view', 'create', 'edit', 'approve'], procurement: ['view', 'create', 'edit', 'approve'],
    disposal: ['view', 'create', 'approve'], depreciation: ['view'], tags: ['view'], reports: ['view', 'export'], roles: ['view'],
  },
  'Department Manager': {
    dashboard: ['view'], assets: ['view', 'export'], transfers: ['view', 'create'], maintenance: ['view', 'create'],
    insurance: ['view'], loans: ['view', 'create'], disposal: ['view', 'create'], reports: ['view', 'export'],
  },
  Technician: {
    dashboard: ['view'], assets: ['view'], audits: ['view', 'edit'], contracts: ['view', 'edit'], maintenance: ['view', 'create', 'edit'], insurance: ['view'], tags: ['view'],
  },
  Auditor: {
    dashboard: ['view'], assets: ['view', 'export'], locations: ['view'], audits: ['view', 'create', 'edit', 'export'], tags: ['view'], reports: ['view', 'export'],
  },
  Employee: { assets: ['view'], loans: ['view', 'create'] },
};

function cell(role: string, module: string) {
  const acts = ROLE_MATRIX[role]?.[module] || [];
  if (!acts.length) return '—';
  if (acts.length === ACTIONS.length) return 'Full';
  return acts.map((a) => a[0]!.toUpperCase()).join('');
}

export default function RolesPage() {
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Role-wise access used by the portal and mobile app. Approval steps are configured separately."
        actions={
          <Link className="btn" to="/approval-levels">
            <ShieldCheck size={16} /> Approval levels
          </Link>
        }
      />
      <Card title="Role matrix" subtitle="V=view C=create E=edit D=delete X=export A=approve">
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Module</th>
                {USER_ROLES.map((r) => (
                  <th key={r} className="small">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}>
                  <td className="bold">{m.label}</td>
                  {USER_ROLES.map((r) => (
                    <td key={r} className="mono xs muted">
                      {cell(r, m.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
