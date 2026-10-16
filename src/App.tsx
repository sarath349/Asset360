import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useData } from './context/DataContext';
import { Layout } from './components/Layout';
import { ComingSoon } from './components/ComingSoon';
import { Loading, Empty } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AssetsPage from './pages/assets/AssetsPage';
import AssetFormPage from './pages/assets/AssetFormPage';
import AssetDetailPage from './pages/assets/AssetDetailPage';
import CategoriesPage from './pages/CategoriesPage';
import LocationsPage from './pages/LocationsPage';
import TransfersPage from './pages/transfers/TransfersPage';
import AuditsPage from './pages/audits/AuditsPage';
import AuditDetailPage from './pages/audits/AuditDetailPage';
import ContractsPage from './pages/contracts/ContractsPage';
import ContractDetailPage from './pages/contracts/ContractDetailPage';
import DisposalPage from './pages/disposal/DisposalPage';
import DisposalDetailPage from './pages/disposal/DisposalDetailPage';
import DepreciationPage from './pages/DepreciationPage';
import ReportsPage from './pages/ReportsPage';
import LifecyclePage from './pages/LifecyclePage';
import OrganizationPage from './pages/admin/OrganizationPage';
import UsersPage from './pages/admin/UsersPage';
import TagsPage from './pages/TagsPage';
import ScanLandingPage from './pages/ScanLandingPage';
import MobileApp from './mobile/MobileApp';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { ready } = useData();
  const location = useLocation();
  if (!user && !loading) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!user || !ready) return <Loading />;
  return <>{children}</>;
}

function Guard({ module, action = 'view', children }: { module: string; action?: string; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(module, action)) return <Empty title="Access restricted" message={`Your role does not have "${action}" permission for this module.`} />;
  return <>{children}</>;
}

// Roles whose day-to-day work is on the floor land in the mobile app.
const FIELD_ROLES = ['technician', 'auditor', 'employee'];

function Home() {
  const { can, user } = useAuth();
  if (FIELD_ROLES.includes((user?.role || '').trim().toLowerCase())) return <Navigate to="/m" replace />;
  if (!can('dashboard')) return <Navigate to="/assets" replace />;
  return <DashboardPage />;
}

// Modules the AssetAPI does not provide endpoints for yet.
const COMING_SOON: { path: string; title: string }[] = [
  { path: 'maintenance/*', title: 'Maintenance' },
  { path: 'procurement', title: 'Requests & Purchase' },
  { path: 'notifications', title: 'Notifications & Alerts' },
  { path: 'roles', title: 'Roles & Permissions' },
  { path: 'settings', title: 'Settings' },
  { path: 'profile', title: 'My Profile' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/m/*" element={<Protected><MobileApp /></Protected>} />
      <Route path="/scan/:code" element={<Protected><ScanLandingPage /></Protected>} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Home />} />
        <Route path="assets" element={<Guard module="assets"><AssetsPage /></Guard>} />
        <Route path="assets/new" element={<Guard module="assets" action="create"><AssetFormPage /></Guard>} />
        <Route path="assets/:id" element={<Guard module="assets"><AssetDetailPage /></Guard>} />
        <Route path="assets/:id/edit" element={<Guard module="assets" action="edit"><AssetFormPage /></Guard>} />
        <Route path="lifecycle" element={<Guard module="lifecycle"><LifecyclePage /></Guard>} />
        <Route path="categories" element={<Guard module="categories"><CategoriesPage /></Guard>} />
        <Route path="locations" element={<Guard module="locations"><LocationsPage /></Guard>} />
        <Route path="transfers" element={<Guard module="transfers"><TransfersPage /></Guard>} />
        <Route path="transfers/:id" element={<Navigate to="/transfers" replace />} />
        <Route path="audits" element={<Guard module="audits"><AuditsPage /></Guard>} />
        <Route path="audits/:id" element={<Guard module="audits"><AuditDetailPage /></Guard>} />
        <Route path="contracts" element={<Guard module="contracts"><ContractsPage /></Guard>} />
        <Route path="contracts/:id" element={<Guard module="contracts"><ContractDetailPage /></Guard>} />
        <Route path="disposal" element={<Guard module="disposal"><DisposalPage /></Guard>} />
        <Route path="disposal/:id" element={<Guard module="disposal"><DisposalDetailPage /></Guard>} />
        <Route path="depreciation" element={<Guard module="depreciation"><DepreciationPage /></Guard>} />
        <Route path="tags" element={<Guard module="tags"><TagsPage /></Guard>} />
        <Route path="reports" element={<Guard module="reports"><ReportsPage /></Guard>} />
        <Route path="organization" element={<Guard module="organization"><OrganizationPage /></Guard>} />
        <Route path="users" element={<Guard module="users"><UsersPage /></Guard>} />
        {COMING_SOON.map((p) => (
          <Route key={p.path} path={p.path} element={<ComingSoon title={p.title} />} />
        ))}
        <Route path="*" element={<Empty title="Page not found" message="The page you are looking for does not exist." />} />
      </Route>
    </Routes>
  );
}
