import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { branchOf, isBranchType, subtreeIds } from '../lib/branch';
import { useAuth } from './AuthContext';
import { LocationNode, useData } from './DataContext';

const KEY = 'assetpro.branch';

interface BranchState {
  /** Selectable branches (locations of type Site). */
  branches: LocationNode[];
  /** The branch the signed-in user belongs to (via their department), if any. */
  homeBranchId: string | null;
  isSuperAdmin: boolean;
  /** True when the user is an admin/user of one branch and cannot see the others. */
  locked: boolean;
  activeBranchId: string | null;
  activeBranch: LocationNode | null;
  setActiveBranchId: (id: string | null) => void;
  /** Is a location inside the active branch? Always true when no branch is selected. */
  inScope: (locationId: number | string | null | undefined) => boolean;
  /** Is a department inside the active branch? */
  deptInScope: (departmentId: number | null | undefined) => boolean;
  /** Ids of every location in the active branch, or null for "all branches". */
  scopeIds: Set<string> | null;
  branchName: (locationId: number | string | null | undefined) => string;
}

const BranchContext = createContext<BranchState>(null as unknown as BranchState);

/**
 * Branch scoping is applied in the portal only. The AssetAPI has no branch field and does not filter by branch,
 * so this controls what is shown, not what the API would return to a determined caller.
 */
export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locations, departments } = useData();
  const [chosen, setChosen] = useState<string | null>(() => localStorage.getItem(KEY) || null);

  const branches = useMemo(() => {
    const all = locations.filter((l) => isBranchType(l.type) && l.active !== false);
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [locations]);

  const role = (user?.role || '').trim().toLowerCase();
  const isSuperAdmin = !user?.role || role === 'super admin';
  const homeBranchId = useMemo(() => {
    if (!user?.departmentId) return null;
    const dept = departments.find((d) => d.departmentId === user.departmentId);
    return dept?.locationId ? branchOf(dept.locationId, locations)?._id || null : null;
  }, [user?.departmentId, departments, locations]);

  const locked = !isSuperAdmin && Boolean(homeBranchId);
  const activeBranchId = locked ? homeBranchId : chosen && branches.some((b) => b._id === chosen) ? chosen : null;

  const setActiveBranchId = useCallback(
    (id: string | null) => {
      if (locked) return;
      setChosen(id);
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    },
    [locked]
  );

  useEffect(() => {
    if (!user) setChosen(null);
  }, [user]);

  const scopeIds = useMemo(() => (activeBranchId ? subtreeIds(activeBranchId, locations) : null), [activeBranchId, locations]);
  const inScope = useCallback((id: number | string | null | undefined) => (scopeIds ? Boolean(id) && scopeIds.has(String(id)) : true), [scopeIds]);
  const deptInScope = useCallback(
    (departmentId: number | null | undefined) => {
      if (!scopeIds) return true;
      const d = departments.find((x) => x.departmentId === departmentId);
      return Boolean(d?.locationId) && scopeIds.has(String(d!.locationId));
    },
    [scopeIds, departments]
  );
  const branchName = useCallback((id: number | string | null | undefined) => branchOf(id, locations)?.name || '', [locations]);
  const activeBranch = branches.find((b) => b._id === activeBranchId) || null;

  return (
    <BranchContext.Provider value={{ branches, homeBranchId, isSuperAdmin, locked, activeBranchId, activeBranch, setActiveBranchId, inScope, deptInScope, scopeIds, branchName }}>
      {children}
    </BranchContext.Provider>
  );
}

export const useBranch = () => useContext(BranchContext);
