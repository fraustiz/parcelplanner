import { coveredCells, type Step, type WarehouseGeometry } from './grid';
import type { CatalogEntry, Cell, Placement, Plan, WarehouseId } from './types';

/** An inclusive rectangle of cells. */
export interface CellBounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * The cells a keyboard cursor may visit on one floor: the box around that
 * floor's blocks, or null when the floor has none.
 *
 * The box rather than the blocks themselves, so the cursor can cross an L's
 * notch in a straight line instead of stopping dead at its corner.
 */
export function floorBounds(
  warehouse: WarehouseId,
  floor: number,
  geometry: WarehouseGeometry,
): CellBounds | null {
  const blocks = geometry[warehouse]?.[floor] ?? [];
  if (blocks.length === 0) return null;
  return {
    minX: Math.min(...blocks.map((b) => b.x)),
    minY: Math.min(...blocks.map((b) => b.y)),
    maxX: Math.max(...blocks.map((b) => b.x + b.w)) - 1,
    maxY: Math.max(...blocks.map((b) => b.y + b.h)) - 1,
  };
}

export function clampedCell(cell: Cell, bounds: CellBounds): Cell {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, cell.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, cell.y)),
  };
}

/** The cursor moved by `step`, stopping at the edge rather than wrapping. */
export function steppedCursor(cursor: Cell, step: Step, bounds: CellBounds): Cell {
  return clampedCell({ x: cursor.x + step.dx, y: cursor.y + step.dy }, bounds);
}

/**
 * The placement on `floor` of the plan's current warehouse covering `cell`.
 *
 * Where a bridge spans a conveyor both cover the cell, and this picks the
 * bridge, because it is drawn on top. `underneath` reaches past it to the
 * conveyor below, which is otherwise unreachable.
 */
export function placementAt(
  plan: Plan,
  floor: number,
  cell: Cell,
  catalogue: Map<string, CatalogEntry>,
  underneath = false,
): Placement | undefined {
  const covering = plan.placements.filter((p) => {
    if (p.warehouse !== plan.warehouse) return false;
    const entry = catalogue.get(p.objectId);
    if (!entry) return false;
    // The elevator is drawn solid from the level above, so it must be
    // reachable from there too.
    const present = p.floor === floor
      || (entry.spansTheFloorAbove === true && floor === p.floor + 1);
    if (!present) return false;
    return coveredCells(p, entry).some((c) => c.x === cell.x && c.y === cell.y);
  });
  if (covering.length < 2) return covering[0];
  const isBridge = (p: Placement) =>
    (catalogue.get(p.objectId)?.bridgedCells?.length ?? 0) > 0;
  return underneath
    ? covering.find((p) => !isBridge(p)) ?? covering[0]
    : covering.find(isBridge) ?? covering[0];
}

/**
 * The selection after picking `hitId` (undefined for empty ground).
 *
 * Plain: just that object, or nothing. Additive: toggles it in or out, and
 * empty ground leaves the selection alone, so a stray modifier press off to
 * the side cannot throw away a selection being built up.
 */
export function pickedSelection(
  selectedIds: readonly string[],
  hitId: string | undefined,
  additive: boolean,
): string[] {
  if (!additive) return hitId === undefined ? [] : [hitId];
  if (hitId === undefined) return [...selectedIds];
  return selectedIds.includes(hitId)
    ? selectedIds.filter((id) => id !== hitId)
    : [...selectedIds, hitId];
}
