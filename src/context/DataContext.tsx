import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  ApiAssetType, ApiCategory, ApiDepartment, ApiEmployee, ApiLocation, ApiSubCategory, ApiUser, assetTypeApi, categoryApi, departmentApi,
  employeeApi, locationApi, subCategoryApi, userApi, userDisplayName,
} from '../api/assetApi';
import { useAuth } from './AuthContext';

// Categories, subcategories and asset types share one tree; prefixed ids keep the three id spaces apart.
export interface CategoryNode {
  _id: string;
  id: number;
  name: string;
  level: 'category' | 'subcategory' | 'type';
  parent: string | null;
  categoryId: number;
  subCategoryId?: number;
}

export interface LookupUser extends ApiUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

// Real AssetAPI records, plus the string `_id` / `name` fields the shared pickers and tree helpers work with.
export interface LocationNode extends ApiLocation {
  _id: string;
  name: string;
  code: string;
  type: string;
  parent: string | null;
  active: boolean;
}

export interface DepartmentNode extends ApiDepartment {
  _id: string;
  name: string;
  code: string;
}

export interface EmployeeNode extends ApiEmployee {
  _id: string;
  name: string;
  empCode: string;
  active: boolean;
}

export interface Lookups {
  categories: CategoryNode[];
  locations: LocationNode[];
  departments: DepartmentNode[];
  employees: EmployeeNode[];
  users: LookupUser[];
}

type ReloadKey = keyof Lookups;

interface DataState extends Lookups {
  ready: boolean;
  reload: (keys?: ReloadKey[]) => Promise<void>;
}

export const categoryNodeId = (id: number | null | undefined) => (id ? `c${id}` : null);
export const subCategoryNodeId = (id: number | null | undefined) => (id ? `s${id}` : null);
export const assetTypeNodeId = (id: number | null | undefined) => (id ? `t${id}` : null);

function toCategoryNodes(cats: ApiCategory[], subs: ApiSubCategory[], types: ApiAssetType[]): CategoryNode[] {
  const subParent = new Map(subs.map((s) => [s.subCategoryId, s.categoryId || 0]));
  return [
    ...cats.map((c) => ({ _id: `c${c.categoryId}`, id: c.categoryId, name: c.categoryName || '(unnamed)', level: 'category' as const, parent: null, categoryId: c.categoryId })),
    ...subs.map((s) => ({
      _id: `s${s.subCategoryId}`,
      id: s.subCategoryId,
      name: s.subCategoryName || '(unnamed)',
      level: 'subcategory' as const,
      parent: categoryNodeId(s.categoryId),
      categoryId: s.categoryId || 0,
      subCategoryId: s.subCategoryId,
    })),
    ...types.map((t) => ({
      _id: `t${t.assetTypeId}`,
      id: t.assetTypeId,
      name: t.typeName || '(unnamed)',
      level: 'type' as const,
      parent: subCategoryNodeId(t.subCategoryId),
      categoryId: subParent.get(t.subCategoryId || 0) || 0,
      subCategoryId: t.subCategoryId || 0,
    })),
  ];
}

const toLookupUser = (u: ApiUser): LookupUser => ({ ...u, _id: String(u.userId), name: userDisplayName(u), email: u.email || '', role: u.role || '', active: u.isActive });

export const toLocationNode = (l: ApiLocation): LocationNode => ({
  ...l,
  _id: String(l.locationId),
  name: l.locationName || l.locationCode || `Location #${l.locationId}`,
  code: l.locationCode || '',
  type: l.locationType || '',
  parent: l.parentLocationId ? String(l.parentLocationId) : null,
  active: l.isActive,
});

const toDepartmentNode = (d: ApiDepartment): DepartmentNode => ({
  ...d,
  _id: String(d.departmentId),
  name: d.departmentName || d.departmentCode || `Department #${d.departmentId}`,
  code: d.departmentCode || '',
});

const toEmployeeNode = (e: ApiEmployee): EmployeeNode => ({
  ...e,
  _id: String(e.employeeId),
  name: e.fullName || e.employeeCode || `Employee #${e.employeeId}`,
  empCode: e.employeeCode || '',
  active: e.isActive,
});

const DataContext = createContext<DataState>(null as unknown as DataState);

const EMPTY: Lookups = { categories: [], locations: [], departments: [], employees: [], users: [] };

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lookups, setLookups] = useState<Lookups>(EMPTY);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async (keys?: ReloadKey[]) => {
    const want = (k: ReloadKey) => !keys || keys.includes(k);
    const tasks: Promise<void>[] = [];
    const set = (patch: Partial<Lookups>) => setLookups((prev) => ({ ...prev, ...patch }));
    const load = <T,>(key: keyof Lookups, fetch: () => Promise<T[]>, map: (x: T) => any) => {
      if (want(key))
        tasks.push(
          fetch()
            .then((list) => set({ [key]: (list || []).map(map) }))
            .catch(() => undefined)
        );
    };
    if (want('categories'))
      tasks.push(
        Promise.all([categoryApi.list(), subCategoryApi.list(), assetTypeApi.list().catch(() => [] as ApiAssetType[])])
          .then(([cats, subs, types]) => set({ categories: toCategoryNodes(cats, subs, types) }))
          .catch(() => undefined)
      );
    load('users', userApi.list, toLookupUser);
    load('locations', locationApi.list, toLocationNode);
    load('departments', departmentApi.list, toDepartmentNode);
    load('employees', employeeApi.list, toEmployeeNode);
    await Promise.all(tasks);
  }, []);

  const userKey = user ? user._id : null;
  useEffect(() => {
    if (!userKey) {
      setReady(false);
      return;
    }
    reload().finally(() => setReady(true));
  }, [userKey, reload]);

  return <DataContext.Provider value={{ ...lookups, ready, reload }}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

// Name lookups for numeric AssetAPI ids, with a readable fallback when a record is missing.
export function useNames() {
  const { locations, departments, employees, users } = useData();
  const find = <T extends { _id: string; name: string }>(list: T[], prefix: string) => (id?: number | null) => {
    if (!id) return '';
    return list.find((x) => x._id === String(id))?.name || `${prefix} #${id}`;
  };
  return {
    location: find(locations, 'Location'),
    department: find(departments, 'Department'),
    employee: find(employees, 'Employee'),
    user: find(users, 'User'),
  };
}
