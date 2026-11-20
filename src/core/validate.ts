import { canPlace, occupancyOf } from './occupancy';
import { type WarehouseGeometry } from './grid';
import type { CatalogEntry, Cell, Plan } from './types';

/**
 * Problems with where objects sit, not with whether the layout works: overlap,
 * off the grid, a missing floor, or an object gone from the game data. No
 * "valid layout" verdict is given, since that would need scanner criteria and
 * routing this app does not simulate. canPlace prevents these while editing,
 * so they come from old links or older game versions.
 */
export type IssueCode =
  | 'overlap' | 'out-of-bounds' | 'bad-floor' | 'unknown-object' | 'needs-headroom';

export interface Issue {
  code: IssueCode;
  placementIds: string[];
  cells: Cell[];
}

export function validate(
  plan: Plan,
  catalogue: Map<string, CatalogEntry>,
  /** Real warehouse block geometry, passed to `canPlace` (see `GridBlock`). */
  geometry: WarehouseGeometry,
): Issue[] {
  const issues: Issue[] = [];

  // Placements in the other warehouse never raise issues here.
  const inThisWarehouse = plan.placements.filter((p) => p.warehouse === plan.warehouse);

  // Built once for the whole plan: canPlace alone rebuilds it per call, making
  // a sweep quadratic, and this runs on every edit. It counts occupants, so a
  // placement can discount its own (see occupancyOf).
  const occupancy = occupancyOf(plan, catalogue);

  for (const p of inThisWarehouse) {
    const rejection = canPlace(plan, p, catalogue, geometry, occupancy);
    if (rejection) {
      issues.push({ code: rejection.reason, placementIds: [p.id], cells: rejection.cells });
    }
  }

  return issues;
}
