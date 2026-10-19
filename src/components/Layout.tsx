import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight, BarChart3, Boxes, Building2, CalendarClock, ChevronDown, ClipboardCheck, FileSpreadsheet, FolderTree,
  GitBranch, LayoutDashboard, LogOut, MapPin, Menu, QrCode, Search, Smartphone, TrendingDown, Trash2, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useClickOutside } from '../lib/hooks';
import { Avatar } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  module: string;
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} />, module: 'dashboard' }] },
  {
    group: 'Master Data',
    items: [
      { to: '/assets', label: 'Asset Register', icon: <Boxes size={17} />, module: 'assets' },
      { to: '/locations', label: 'Branches & Locations', icon: <MapPin size={17} />, module: 'locations' },
      { to: '/organization', label: 'Departments & Employees', icon: <Building2 size={17} />, module: 'organization' },
      { to: '/categories', label: 'Category · Subcategory · Type', icon: <FolderTree size={17} />, module: 'categories' },
      { to: '/users', label: 'Admins & Users', icon: <Users size={17} />, module: 'users' },
    ],
  },
  {
    group: 'Assets',
    items: [
      { to: '/lifecycle', label: 'Lifecycle', icon: <GitBranch size={17} />, module: 'lifecycle' },
      { to: '/tags', label: 'QR / Barcode Labels', icon: <QrCode size={17} />, module: 'tags' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/transfers', label: 'Assign & Transfer', icon: <ArrowLeftRight size={17} />, module: 'transfers' },
      { to: '/audits', label: 'Physical Audit', icon: <ClipboardCheck size={17} />, module: 'audits' },
    ],
  },
  {
    group: 'Contracts & Finance',
    items: [
      { to: '/contracts', label: 'AMC & Warranty', icon: <CalendarClock size={17} />, module: 'contracts' },
      { to: '/disposal', label: 'Disposal & Retirement', icon: <Trash2 size={17} />, module: 'disposal' },
      { to: '/depreciation', label: 'Depreciation', icon: <TrendingDown size={17} />, module: 'depreciation' },
    ],
  },
  {
    group: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: <FileSpreadsheet size={17} />, module: 'reports' }],
  },
];

function BranchSwitcher() {
  const { branches, activeBranchId, setActiveBranchId, locked } = useBranch();
  if (!branches.length) return null;
  if (locked)
    return (
      <span className="chip" title="Your account is limited to this branch">
        <Building2 size={14} /> {branches.find((b) => b._id === activeBranchId)?.name || 'Branch'}
      </span>
    );
  return (
    <div className="row" style={{ gap: 6 }} title="Show data for one branch or all">
      <Building2 size={16} className="muted" />
      <select className="select" style={{ width: 170, height: 34 }} value={activeBranchId || ''} onChange={(e) => setActiveBranchId(e.target.value || null)}>
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b._id} value={b._id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  if (!user) return null;
  return (
    <div className="dropdown" ref={ref}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} />
        <div className="meta">
          <b>{user.name}</b>
          <span>{user.roleName}</span>
        </div>
        <ChevronDown size={15} className="faint" />
      </button>
      {open && (
        <div className="dropdown-menu">
          <div style={{ padding: '8px 10px 10px' }}>
            <div className="bold">{user.name}</div>
            <div className="xs muted">{user.email}</div>
          </div>
          <div className="divider" style={{ margin: '4px 0' }} />
          <a className="dropdown-item" href="/m">
            <Smartphone size={16} /> Mobile app
          </a>
          <button className="dropdown-item" onClick={logout} style={{ color: 'var(--red)' }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">
            <Boxes size={19} color="#fff" />
          </div>
          <div>
            <div className="brand-name">AssetPro</div>
            <div className="brand-sub">Enterprise Asset Management</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => can(i.module));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.group}>
                <div className="nav-group-label">{g.group}</div>
                {items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {i.icon}
                    {i.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <form
            className="topbar-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) navigate(`/assets?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={17} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets by ID, name, serial, RFID…" />
            <kbd>⌘K</kbd>
          </form>
          <div className="topbar-actions">
            <BranchSwitcher />
            {can('reports') && (
              <button className="icon-btn" onClick={() => navigate('/reports')} aria-label="Reports">
                <BarChart3 size={19} />
              </button>
            )}
            <UserMenu />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {menuOpen && <div className="overlay" style={{ zIndex: 25, padding: 0 }} onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
