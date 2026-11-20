import { centreOf, centredAnchor, coveredCells, type WarehouseGeometry } from './grid';
import { canPlace, type PlacementRejection } from './occupancy';
import type { CatalogEntry, Cell, Placement, Plan, Rotation } from './types';

/**
 * Turning and mirroring a selection as one arrangement: the objects move as
 * well as turn.
 *
 * Pivot: rotate about the bounding box's top-left, then shift by (d, -d) with
 * `d = floor((W-1)/2) - floor((H-1)/2)`. That re-centres the result and cancels
 * over four turns, so a group comes back where it started. A lone object turns
 * on its middle cell, matching `rotatedAboutCentre`.
 */

/** A placement's footprint, or null when the catalogue does not know it. */
const footprintOf = (
  placement: Placement,
  catalogue: Map<string, CatalogEntry>,
): { w: number; h: number } | null => catalogue.get(placement.objectId)?.footprint ?? null;

/** The cells the whole selection covers, as a bounding box. */
function boundingBox(
  placements: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
): { x: number; y: number; w: number; h: number } | null {
  const cells: Cell[] = [];
  for (const placement of placements) {
    const entry = catalogue.get(placement.objectId);
    if (!entry) return null;
    cells.push(...coveredCells(placement, entry));
  }
  if (cells.length === 0) return null;

  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
}

/** One quarter turn clockwise on screen. */
export function turnedOnce(
  placements: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
): Placement[] | null {
  const box = boundingBox(placements, catalogue);
  if (!box) return null;

  // Re-centring shift (see the module note), applied to every object.
  const shift = Math.floor((box.w - 1) / 2) - Math.floor((box.h - 1) / 2);

  const turned: Placement[] = [];
  for (const placement of placements) {
    const footprint = footprintOf(placement, catalogue);
    if (!footprint) return null;

    const centre = centreOf(placement, footprint);
    const ox = centre.x - box.x;
    const oy = centre.y - box.y;
    // Clockwise with y pointing down: the box's top-left maps to its top-right.
    const rotation = ((placement.rotation + 90) % 360) as Rotation;
    const moved: Cell = {
      x: box.x + (box.h - 1 - oy) + shift,
      y: box.y + ox - shift,
    };
    turned.push({ ...placement, rotation, cell: centredAnchor(moved, footprint, rotation) });
  }
  return turned;
}

/**
 * A group turned a quarter turn, `1` clockwise on screen and `-1`
 * counter-clockwise, with no plan or bounds check. Counter-clockwise is three
 * clockwise turns. Shared by placed selections, aimed pastes and aimed drags.
 */
export function turnedGroup(
  placements: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
  direction: 1 | -1,
): Placement[] | null {
  let turned: readonly Placement[] = placements;
  for (let i = 0; i < (direction === 1 ? 1 : 3); i++) {
    const next = turnedOnce(turned, catalogue);
    if (!next) return null;
    turned = next;
  }
  return [...turned];
}

/**
 * The placements a transform produced, or why it was refused, so callers can
 * tell the player which reason applied.
 */
export type TransformResult =
  | { ok: true; placements: Placement[] }
  | { ok: false; reason: PlacementRejection['reason'] };

/**
 * Checks transformed placements against the plan with the selection lifted
 * out, so the group may land on cells it is vacating. All or nothing.
 * Public because an aimed drag can mix a move, a turn and a flip.
 */
export function settledSelection(
  plan: Plan,
  ids: readonly string[],
  candidates: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
  geometry: WarehouseGeometry,
): TransformResult {
  const settled = plan.placements.filter((p) => !ids.includes(p.id));
  const accepted: Placement[] = [];
  for (const candidate of candidates) {
    const working: Plan = { ...plan, placements: [...settled, ...accepted] };
    // Only the first refusal is reported: the rest were never attempted.
    const rejection = canPlace(working, candidate, catalogue, geometry);
    if (rejection) return { ok: false, reason: rejection.reason };
    accepted.push(candidate);
  }
  return { ok: true, placements: accepted };
}

/** The selection turned a quarter turn, `1` clockwise on screen and `-1`
 * counter-clockwise, with the reason when it will not fit. */
export function rotatedSelection(
  plan: Plan,
  ids: readonly string[],
  direction: 1 | -1,
  catalogue: Map<string, CatalogEntry>,
  geometry: WarehouseGeometry,
): TransformResult {
  const chosen = plan.placements.filter((p) => ids.includes(p.id));
  if (chosen.length === 0) return { ok: false, reason: 'unknown-object' };

  const turned = turnedGroup(chosen, catalogue, direction);
  if (!turned) return { ok: false, reason: 'unknown-object' };
  return settledSelection(plan, ids, turned, catalogue, geometry);
}

/**
 * The selection flipped left-to-right about its own middle, or the reason it
 * will not fit.
 *
 * The rotation flips too. Drawing composes rotate-then-mirror, so
 *
 *     H ∘ R(θ) = R(−θ) ∘ H
 *
 * Toggling `mirrored` alone is only right at 0 and 180. The box keeps its shape,
 * so no re-centring is needed and the flip is its own inverse.
 */
export function mirroredSelection(
  plan: Plan,
  ids: readonly string[],
  catalogue: Map<string, CatalogEntry>,
  geometry: WarehouseGeometry,
  /** Which way to flip; left-to-right by default. */
  axis: FlipAxis = 'horizontal',
): TransformResult {
  const chosen = plan.placements.filter((p) => ids.includes(p.id));
  if (chosen.length === 0) return { ok: false, reason: 'unknown-object' };

  const flipped = flippedAbout(chosen, catalogue, axis);
  if (!flipped) return { ok: false, reason: 'unknown-object' };
  return settledSelection(plan, ids, flipped, catalogue, geometry);
}

/** Which way a flip runs: `horizontal` swaps left and right, `vertical` swaps
 * top and bottom. */
export type FlipAxis = 'horizontal' | 'vertical';

/** One entry point for both flips. */
export function flippedAbout(
  chosen: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
  axis: FlipAxis,
): Placement[] | null {
  return axis === 'vertical'
    ? flippedVertically(chosen, catalogue)
    : flippedOnce(chosen, catalogue);
}

/**
 * A group flipped top-to-bottom about its own middle: `flippedOnce` followed by
 * a half turn, since H then R(180) sends (x, y) to (x, −y). This keeps a single
 * piece of mirror arithmetic. The two turns' re-centring shifts cancel exactly.
 */
export function flippedVertically(
  chosen: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
): Placement[] | null {
  const flipped = flippedOnce(chosen, catalogue);
  if (!flipped) return null;
  const half = turnedGroup(flipped, catalogue, 1);
  if (!half) return null;
  return turnedGroup(half, catalogue, 1);
}

/**
 * A group flipped left-to-right about its own middle, with no plan or bounds
 * check, so a pending paste can be flipped too. Keep this the only
 * implementation: the rotation negation below is easy to get wrong.
 */
export function flippedOnce(
  chosen: readonly Placement[],
  catalogue: Map<string, CatalogEntry>,
): Placement[] | null {
  const box = boundingBox(chosen, catalogue);
  if (!box) return null;

  const flipped: Placement[] = [];
  for (const placement of chosen) {
    const footprint = footprintOf(placement, catalogue);
    if (!footprint) return null;

    const centre = centreOf(placement, footprint);
    const mirrored = !(placement.mirrored ?? false);
    // −θ, modulo a full turn: mirrors what is on screen, not the artwork.
    const rotation = ((360 - placement.rotation) % 360) as Rotation;
    const moved: Cell = { x: box.x + (box.w - 1 - (centre.x - box.x)), y: centre.y };
    flipped.push({
      ...placement,
      mirrored,
      rotation,
      // Anchored with the new rotation: at 90 and 270 the footprint swaps sides.
      cell: centredAnchor(moved, footprint, rotation),
    });
  }
  return flipped;
}
