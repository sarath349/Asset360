import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { setUnauthorizedHandler, tokenStore } from '../api/client';
import { ApiUser, authApi, userApi, userDisplayName } from '../api/assetApi';

export interface User {
  _id: string;
  userId: number;
  username: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  roleName: string;
  departmentId?: number | null;
  permissions: Record<string, string[]>;
  employee?: { _id: string; name: string; empCode: string } | null;
  vendor?: { _id: string; name: string } | null;
  scope?: { locations: { _id: string; name: string; type: string }[]; departments: { _id: string; name: string }[] };
  channels?: { email: boolean; sms: boolean; whatsapp: boolean; push: boolean };
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (module: string, action?: string) => boolean;
}

// The backend only stores a role name per user (no permission model), so access is derived from the role here.
// This controls what the portal shows; the API itself must still enforce permissions.
const MODULES = [
  'dashboard', 'assets', 'categories', 'locations', 'lifecycle', 'organization', 'transfers', 'tags', 'audits', 'contracts', 'maintenance',
  'procurement', 'disposal', 'depreciation', 'reports', 'notifications', 'users', 'roles', 'settings', 'profile', 'mobile',
];
const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'];

type Permissions = Record<string, string[]>;
const grant = (spec: Permissions): Permissions => Object.fromEntries(MODULES.map((m) => [m, spec[m] || []]));
const everything = Object.fromEntries(MODULES.map((m) => [m, ALL_ACTIONS]));
const V = ['view'];
const VX = ['view', 'export'];
const VC = ['view', 'create'];
const VCE = ['view', 'create', 'edit'];

const ROLE_PERMISSIONS: Record<string, Permissions> = {
  'super admin': grant(everything),
  admin: grant(everything),
  'asset manager': grant({ ...everything, users: [] }),
  'facility manager': grant({
    tags: V, dashboard: V, assets: [...VCE, 'export'], categories: VCE, locations: VCE, lifecycle: V, organization: V, transfers: VC, audits: VCE, contracts: VCE,
    disposal: VC, depreciation: V, reports: VX,
  }),
  'department manager': grant({ dashboard: V, assets: VX, lifecycle: V, organization: V, transfers: VC, disposal: VC, reports: VX }),
  technician: grant({ tags: V, dashboard: V, assets: V, lifecycle: V, audits: ['view', 'edit'], contracts: ['view', 'edit'] }),
  auditor: grant({ tags: V, dashboard: V, assets: VX, locations: V, lifecycle: V, audits: [...VCE, 'export'], reports: VX }),
  employee: grant({ assets: V, lifecycle: V }),
};

// A user with no role (the seeded admin account) keeps full access; unknown roles get read-only asset access.
const permissionsFor = (role?: string | null): Permissions =>
  !role ? grant(everything) : ROLE_PERMISSIONS[role.trim().toLowerCase()] || grant({ assets: V, lifecycle: V });

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

const USER_CACHE = 'assetpro.user';

function decodeToken(token: string): { userId?: number; exp?: number } {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.UserId ? Number(payload.UserId) : undefined, exp: payload.exp };
  } catch {
    return {};
  }
}

function isExpired(token: string) {
  const { exp } = decodeToken(token);
  return Boolean(exp && exp * 1000 <= Date.now());
}

function toUser(u: Pick<ApiUser, 'userId' | 'username' | 'fullName' | 'email' | 'phone' | 'role'> & { departmentId?: number | null }): User {
  return {
    _id: String(u.userId),
    userId: u.userId,
    username: u.username || '',
    name: userDisplayName(u),
    email: u.email || '',
    phone: u.phone || undefined,
    role: u.role || '',
    departmentId: u.departmentId ?? null,
    roleName: u.role || (u.username === 'admin' ? 'Admin' : 'User'),
    permissions: permissionsFor(u.role),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const token = tokenStore.get();
      return token && !isExpired(token) ? JSON.parse(localStorage.getItem(USER_CACHE) || 'null') : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(USER_CACHE);
    setUser(null);
  }, []);

  const store = (u: User) => {
    localStorage.setItem(USER_CACHE, JSON.stringify(u));
    setUser(u);
  };

  const refresh = useCallback(async () => {
    const token = tokenStore.get();
    if (!token) return;
    const { userId } = decodeToken(token);
    if (isExpired(token) || !userId) {
      logout();
      setLoading(false);
      return;
    }
    try {
      store(toUser(await userApi.get(userId)));
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 404) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [logout, refresh]);

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    if (!res?.token) throw new Error('Login failed');
    tokenStore.set(res.token);
    const profile = await userApi.get(res.userId).catch(() => null);
    const u = toUser(profile || { userId: res.userId, username: res.username, fullName: null, email: null, phone: null, role: res.role });
    store(u);
    return u;
  };

  const can = useCallback((module: string, action = 'view') => Boolean(user?.permissions?.[module]?.includes(action)), [user]);

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
