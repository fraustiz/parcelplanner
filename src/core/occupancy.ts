import { bridgedCells, coveredCells, isBuildable, warehouseDimensions, type WarehouseGeometry } from './grid';
import type { CatalogEntry, Cell, Placement, Plan } from './types';

export interface PlacementRejection {
  reason: 'out-of-bounds' | 'bad-floor' | 'unknown-object' | 'overlap' | 'needs-headroom';
  cells: Cell[];
}

const key = (floor: number, cell: Cell): string => `${floor}:${cell.x}:${cell.y}`;

/**
 * The same placements, shifted by `step`, legal or not, so a dragged selection
 * can be drawn anywhere in the refusing colour. Takes a plain list because the
 * drag may also have been turned or flipped. Whether it may land is answered
 * by `settledSelection` in ./transform.ts on these same placements.
 */
export function shiftedSelection(
  placements: readonly Placement[],
  step: { dx: number; dy: number },
): Placement[] {
  return placements.map(
    (p) => ({ ...p, cell: { x: p.cell.x + step.dx, y: p.cell.y + step.dy } }),
  );
}

/**
 * How many placements hold each cell of the current warehouse.
 *
 * Counted rather than flagged so one map serves a whole-plan check: a
 * placement discounts its own count instead of needing a map without it.
 * Two levels: a cell can hold one ground and one raised occupant (see
 * `CatalogEntry.bridgedCells`); two at the same level collide.
 */
export interface Occupancy {
  onGround: Map<string, number>;
  overhead: Map<string, number>;
}

/**
 * Whether `entry` claims the air over its cells as well as the floor. Only a
 * reserved zone does, so a bridge cannot cross a zone nor a zone sit under one.
 */
const fillsBothLevels = (entry: CatalogEntry): boolean => entry.category === 'zone';

export function occupancyOf(plan: Plan, catalogue: Map<string, CatalogEntry>): Occupancy {
  const onGround = new Map<string, number>();
  const overhead = new Map<string, number>();
  for (const p of plan.placements) {
    if (p.warehouse !== plan.warehouse) continue; // other building: cannot collide
    const e = catalogue.get(p.objectId);
    if (!e) continue;
    const raised = new Set(bridgedCells(p, e).map((c) => key(p.floor, c)));
    for (const c of coveredCells(p, e)) {
      const k = key(p.floor, c);
      // A reserved zone takes both levels (see `fillsBothLevels`).
      const levels = fillsBothLevels(e) ? [onGround, overhead] : [raised.has(k) ? overhead : onGround];
      for (const level of levels) level.set(k, (level.get(k) ?? 0) + 1);
    }
  }
  return { onGround, overhead };
}

export function canPlace(
  plan: Plan,
  candidate: Placement,
  catalogue: Map<string, CatalogEntry>,
  /** Real warehouse block geometry, e.g. `WAREHOUSES` from
   * `src/data/warehouses.ts`, passed in so `src/core/` stays free of data imports. */
  geometry: WarehouseGeometry,
  /**
   * A map built once for a whole-plan sweep, in which `candidate` itself is
   * counted (see `validate`); its own occupancy is discounted below. Omit it to
   * build a map for this call without the candidate.
   */
  occupancy?: Occupancy,
): PlacementRejection | null {
  const entry = catalogue.get(candidate.objectId);
  if (!entry) return { reason: 'unknown-object', cells: [] };

  const { floors } = warehouseDimensions(plan.warehouse, geometry);

  if (candidate.floor < 0 || candidate.floor >= floors) {
    return { reason: 'bad-floor', cells: [] };
  }

  const cells = coveredCells(candidate, entry);

  // `isBuildable` rejects a cell outside every block (an L's notch) the same
  // way as one off the grid.
  const outside = cells.filter((c) => !isBuildable(plan.warehouse, candidate.floor, c, geometry));
  if (outside.length > 0) return { reason: 'out-of-bounds', cells: outside };

  // The vertical elevator stands on the ground with nothing overhead (see
  // `CatalogEntry.spansTheFloorAbove`).
  if (entry.spansTheFloorAbove) {
    if (candidate.floor !== 0) return { reason: 'needs-headroom', cells };
    const roofed = cells.filter((c) => isBuildable(plan.warehouse, candidate.floor + 1, c, geometry));
    if (roofed.length > 0) return { reason: 'needs-headroom', cells: roofed };
  }

  // Occupancy is two-level (see CatalogEntry.bridgedCells): one ground and one
  // raised occupant per cell. Doors do not occupy their cell: a conveyor must
  // stand on it to meet the door's port. With the shared map the candidate is
  // counted, so one occupant of each of its cells is itself.
  const taken = occupancy ?? occupancyOf(
    { ...plan, placements: plan.placements.filter((p) => p.id !== candidate.id) },
    catalogue,
  );
  const own = occupancy ? 1 : 0;

  const candidateOverhead = new Set(
    bridgedCells(candidate, entry).map((c) => key(candidate.floor, c)),
  );
  const clashing = cells.filter((c) => {
    const k = key(candidate.floor, c);
    const levels = fillsBothLevels(entry)
      ? [taken.onGround, taken.overhead]
      : [candidateOverhead.has(k) ? taken.overhead : taken.onGround];
    return levels.some((level) => (level.get(k) ?? 0) > own);
  });
  if (clashing.length > 0) return { reason: 'overlap', cells: clashing };

  return null;
}
