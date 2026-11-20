import { canPlace } from './occupancy';
import { flippedAbout, turnedGroup, type FlipAxis } from './transform';
import type { TransformResult } from './transform';
import type { WarehouseGeometry } from './grid';
import type { CatalogEntry, Cell, Placement, Plan, WarehouseId } from './types';

/**
 * Copy and paste for a selection. What is copied is a shape: positions are
 * relative to the selection's top-left, so it pastes anywhere.
 */

/** One object of a copied shape, positioned relative to the selection's
 * top-left corner. */
export interface ClipboardEntry {
  objectId: string;
  cell: Cell;
  rotation: Placement['rotation'];
  mirrored?: boolean;
  /** The colour the player painted it, if any, kept like the rotation. */
  colour?: string;
  /** A reserved zone's name (see src/core/zone.ts), kept like the colour. */
  label?: string;
  tier: number;
}

/**
 * The selection as a reusable shape; empty when nothing is selected. Ids are
 * dropped: a pasted object is new, and a reused id would confuse selection and undo.
 */
export function copiedShape(plan: Plan, ids: readonly string[]): ClipboardEntry[] {
  const chosen = plan.placements.filter((p) => ids.includes(p.id));
  if (chosen.length === 0) return [];

  // Anchored on the selection's top-left, not the first object, so the shape
  // does not depend on the order of the ids.
  const left = Math.min(...chosen.map((p) => p.cell.x));
  const top = Math.min(...chosen.map((p) => p.cell.y));

  return chosen.map((p) => ({
    objectId: p.objectId,
    cell: { x: p.cell.x - left, y: p.cell.y - top },
    rotation: p.rotation,
    ...(p.mirrored === true ? { mirrored: true } : {}),
    ...(p.colour === undefined ? {} : { colour: p.colour }),
    ...(p.label === undefined ? {} : { label: p.label }),
    tier: p.tier,
  }));
}

/**
 * The placements a paste at `target` would add, or null when the shape does
 * not fit. All or nothing, like a move. `floor` and `warehouse` are the ones
 * being viewed, not the ones copied from.
 */
export function pastedAt(
  plan: Plan,
  shape: readonly ClipboardEntry[],
  target: Cell,
  catalogue: Map<string, CatalogEntry>,
  geometry: WarehouseGeometry,
  floor: number,
  warehouse: WarehouseId,
): TransformResult {
  if (shape.length === 0) return { ok: false, reason: 'unknown-object' };

  // Each object is checked against a plan holding the ones before it, so two
  // objects of one paste cannot take the same cell.
  const pasted: Placement[] = [];
  for (const entry of shape) {
    const candidate: Placement = {
      id: crypto.randomUUID(),
      objectId: entry.objectId,
      warehouse,
      floor,
      cell: { x: target.x + entry.cell.x, y: target.y + entry.cell.y },
      rotation: entry.rotation,
      ...(entry.mirrored === true ? { mirrored: true } : {}),
      ...(entry.colour === undefined ? {} : { colour: entry.colour }),
      ...(entry.label === undefined ? {} : { label: entry.label }),
      tier: entry.tier,
    };
    const working: Plan = { ...plan, warehouse, placements: [...plan.placements, ...pasted] };
    const rejection = canPlace(working, candidate, catalogue, geometry);
    if (rejection) return { ok: false, reason: rejection.reason };
    pasted.push(candidate);
  }
  return { ok: true, placements: pasted };
}

/**
 * The same shape, turned or flipped as one arrangement, for the silhouette of
 * a pending paste (not in a plan, so it cannot use `rotatedSelection` or
 * `mirroredSelection`). Uses the same primitives so the mirror arithmetic
 * exists once.
 */
function reanchor(placements: readonly Placement[], shape: readonly ClipboardEntry[]): ClipboardEntry[] {
  // Back to a top-left origin, as in copiedShape, so four turns give the
  // original shape.
  const left = Math.min(...placements.map((p) => p.cell.x));
  const top = Math.min(...placements.map((p) => p.cell.y));
  return placements.map((p, i) => ({
    objectId: p.objectId,
    cell: { x: p.cell.x - left, y: p.cell.y - top },
    rotation: p.rotation,
    ...(p.mirrored === true ? { mirrored: true } : {}),
    ...(p.colour === undefined ? {} : { colour: p.colour }),
    ...(p.label === undefined ? {} : { label: p.label }),
    tier: shape[i]!.tier,
  }));
}

const asPlacements = (shape: readonly ClipboardEntry[]): Placement[] =>
  shape.map((entry, i) => ({
    id: `__shape_${i}__`,
    objectId: entry.objectId,
    warehouse: 'main' as const,
    floor: 0,
    cell: entry.cell,
    rotation: entry.rotation,
    ...(entry.mirrored === true ? { mirrored: true } : {}),
    ...(entry.colour === undefined ? {} : { colour: entry.colour }),
    ...(entry.label === undefined ? {} : { label: entry.label }),
    tier: entry.tier,
  }));

export function turnedShape(
  shape: readonly ClipboardEntry[],
  catalogue: Map<string, CatalogEntry>,
  direction: 1 | -1,
): ClipboardEntry[] {
  // An object the catalogue does not know: leave the shape alone.
  const turned = turnedGroup(asPlacements(shape), catalogue, direction);
  return turned ? reanchor(turned, shape) : [...shape];
}

export function flippedShape(
  shape: readonly ClipboardEntry[],
  catalogue: Map<string, CatalogEntry>,
  axis: FlipAxis = 'horizontal',
): ClipboardEntry[] {
  const flipped = flippedAbout(asPlacements(shape), catalogue, axis);
  return flipped ? reanchor(flipped, shape) : [...shape];
}
