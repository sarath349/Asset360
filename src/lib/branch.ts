import type { LocationNode } from '../context/DataContext';

// The AssetAPI has no branch concept. A branch is a Location of type "Site" (the level directly under the
// company); everything below it (buildings, floors, rooms…) belongs to that branch.
export const BRANCH_TYPES = ['site', 'branch'];
export const isBranchType = (t?: string | null) => BRANCH_TYPES.includes((t || '').toLowerCase());

/** The top-most branch-type ancestor of a location (or the location itself). */
export function branchOf(locationId: string | number | null | undefined, locations: LocationNode[]): LocationNode | null {
  if (!locationId) return null;
  const byId = new Map(locations.map((l) => [l._id, l]));
  const chain: LocationNode[] = [];
  let cur = byId.get(String(locationId));
  let guard = 0;
  while (cur && guard < 25) {
    chain.unshift(cur);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
    guard += 1;
  }
  return chain.find((l) => isBranchType(l.type)) || null;
}

/** Ids (as strings) of a location and everything beneath it. */
export function subtreeIds(rootId: string, locations: LocationNode[]): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of locations) if (l.parent && out.has(l.parent) && !out.has(l._id)) (out.add(l._id), (grew = true));
  }
  return out;
}
