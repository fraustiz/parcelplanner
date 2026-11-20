import type { Cell, CatalogEntry, Placement, Rotation, Side, WarehouseId } from './types';

// Ordered by increasing compass-label rotation, which is counter-clockwise on
// screen (N faces +y, see SIDE_STEP). `rotateSide` walks it backwards on purpose.
const SIDES_CCW: readonly Side[] = ['N', 'E', 'S', 'W'];

export function rotateSide(side: Side, rotation: Rotation): Side {
  const steps = rotation / 90;
  const index = SIDES_CCW.indexOf(side);
  return SIDES_CCW[(index - steps + 4) % 4]!;
}

/**
 * A horizontal flip swaps E/W and leaves N/S alone. With the inverted compass
 * labels (see SIDE_STEP) this reads the same as with normal ones, but for the
 * opposite reason.
 */
export const MIRROR_SIDE: Record<Side, Side> = { N: 'N', S: 'S', E: 'W', W: 'E' };

/**
 * Where a declared port ends up once `mirrored` and `rotation` are applied,
 * in the rotated frame `portCell` expects.
 *
 * Mirror first, rotation second: the same order `drawShapeGroup` in
 * src/render/renderer.ts uses, so the flow graph and the artwork agree.
 * `footprint` is the unrotated catalogue footprint, since the mirror happens
 * before the rotation.
 */
export function placedPort(
  port: { side: Side; offset: number },
  rotation: Rotation,
  mirrored: boolean,
  footprint: { w: number; h: number },
): { side: Side; offset: number } {
  if (!mirrored) return { side: rotateSide(port.side, rotation), offset: port.offset };
  const flipped = MIRROR_SIDE[port.side];
  const alongX = flipped === 'N' || flipped === 'S';
  return {
    side: rotateSide(flipped, rotation),
    offset: alongX ? footprint.w - 1 - port.offset : port.offset,
  };
}

export function rotatedFootprint(
  footprint: { w: number; h: number },
  rotation: Rotation,
): { w: number; h: number } {
  const swapped = rotation === 90 || rotation === 270;
  return swapped ? { w: footprint.h, h: footprint.w } : { ...footprint };
}

/** A step from one cell to the next, as a unit vector. */
export interface Step { dx: number; dy: number }

/** Which way an object is turned: the two fields of a `Placement` that decide
 * where its ports end up. */
export interface Orientation { rotation: Rotation; mirrored: boolean }

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * How to turn `entry` so it is fed from the cell it was reached from and feeds
 * the next one: the orientation a conveyor needs along a path.
 *
 * `incoming` is the step into the cell, `outgoing` the step out. Different
 * steps mean a turn, which only a corner conveyor can satisfy.
 * Returns null when the object has no single in/out pair or cannot make the turn.
 */
export function orientationFor(
  entry: CatalogEntry,
  incoming: Step,
  outgoing: Step,
): Orientation | null {
  const ins = entry.ports.filter((p) => p.dir === 'in');
  const outs = entry.ports.filter((p) => p.dir === 'out');
  if (ins.length !== 1 || outs.length !== 1) return null;

  // The in-port must face back the way we came, hence the negation.
  return orientationFacing(entry, [
    { dir: 'in', step: { dx: -incoming.dx, dy: -incoming.dy } },
    { dir: 'out', step: outgoing },
  ]);
}

/** A port of `dir` must face `step`: the direction it accepts from (in) or
 * emits towards (out). */
export interface PortFacing { dir: 'in' | 'out'; step: Step }

/** Every direction `entry`'s ports face once turned, in the shape
 * `orientationFacing` takes. */
export function portFacings(
  entry: CatalogEntry,
  rotation: Rotation,
  mirrored: boolean,
): PortFacing[] {
  return entry.ports.map((port) => ({
    dir: port.dir,
    step: SIDE_STEP[placedPort(port, rotation, mirrored, entry.footprint).side],
  }));
}

/**
 * How to turn `replacement` where a dragged run arrives at `existing`.
 *
 * The replacement keeps every connection the existing object had and accepts
 * the new run, so a belt becomes a joiner and a joiner a three-way, and the
 * line keeps its flow direction. A run arriving along the line finds no
 * orientation (it would need two ports facing the same way) and is refused.
 */
export function joinerOrientation(
  replacement: CatalogEntry,
  existing: { entry: CatalogEntry; rotation: Rotation; mirrored: boolean },
  arrival: Step,
): Orientation | null {
  return replacementOrientation(replacement, existing, {
    dir: 'in', step: { dx: -arrival.dx, dy: -arrival.dy },
  });
}

/**
 * How to turn `replacement` where a dragged run leaves `existing`: the mirror
 * image of joining. A run leaving straight along the line is refused, since it
 * would need two out-ports facing the same way.
 */
export function splitterOrientation(
  replacement: CatalogEntry,
  existing: { entry: CatalogEntry; rotation: Rotation; mirrored: boolean },
  departure: Step,
): Orientation | null {
  return replacementOrientation(replacement, existing, { dir: 'out', step: departure });
}

/**
 * Shared rule for joining and splitting: keep every connection the existing
 * object had and add `extra`.
 */
export function replacementOrientation(
  replacement: CatalogEntry,
  existing: { entry: CatalogEntry; rotation: Rotation; mirrored: boolean },
  extra: PortFacing,
): Orientation | null {
  return orientationFacing(replacement, [
    ...portFacings(existing.entry, existing.rotation, existing.mirrored),
    extra,
  ]);
}

/** The single direction `entry` emits along once turned, or null when it has
 * no out-port or more than one. */
export function emitDirection(
  entry: CatalogEntry,
  rotation: Rotation,
  mirrored: boolean,
): Step | null {
  const outs = entry.ports.filter((p) => p.dir === 'out');
  if (outs.length !== 1) return null;
  return SIDE_STEP[placedPort(outs[0]!, rotation, mirrored, entry.footprint).side];
}

/**
 * The orientation that makes `entry` face every direction asked of it, or null
 * when none of the eight does.
 *
 * Brute-forces all eight orientations through `placedPort` instead of deriving
 * them: with inverted compass labels and mirror-then-rotate ordering, derived
 * tables are easy to get wrong. Each requirement must be met by a distinct
 * port, and unmirrored orientations are tried first.
 */
export function orientationFacing(
  entry: CatalogEntry,
  required: readonly PortFacing[],
): Orientation | null {
  for (const mirrored of [false, true]) {
    for (const rotation of ROTATIONS) {
      const spent = new Set<number>();
      const met = required.every((want) => {
        const found = entry.ports.findIndex((port, i) => {
          if (spent.has(i) || port.dir !== want.dir) return false;
          const faces = SIDE_STEP[placedPort(port, rotation, mirrored, entry.footprint).side];
          return faces.dx === want.step.dx && faces.dy === want.step.dy;
        });
        if (found === -1) return false;
        spent.add(found);
        return true;
      });
      if (met) return { rotation, mirrored };
    }
  }
  return null;
}

/**
 * Every cell on the straight line from `from` to `to`, both ends included.
 * Fills the gaps left by sampled pointer moves. Integer Bresenham, so no cell
 * repeats and no diagonal pair is skipped.
 */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  let { x, y } = from;
  const cells: Cell[] = [];
  for (;;) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) return cells;
    const doubled = 2 * error;
    if (doubled > -dy) { error -= dy; x += stepX; }
    if (doubled < dx) { error += dx; y += stepY; }
  }
}

/**
 * The row number shown for the cell at `y`. Every readout goes through it.
 *
 * Counts from the bottom (internal y grows southward, a floor plan reads from
 * the bottom-left) and starts at 1; 0 is the ruler's origin corner.
 */
export function displayRow(y: number, dims: { h: number }): number {
  return dims.h - y;
}

/** The column number shown for the cell at `x`, 1-based like displayRow. */
export function displayColumn(x: number): number {
  return x + 1;
}

/**
 * Maps an offset in an object's unrotated footprint to its offset in the
 * placed footprint: mirror then rotation, as in `placedPort` and
 * `drawShapeGroup`. A positive rotation turns clockwise on screen.
 */
export function placedOffset(
  offset: Cell,
  footprint: { w: number; h: number },
  rotation: Rotation,
  mirrored: boolean,
): Cell {
  const { w, h } = footprint;
  const x = mirrored ? w - 1 - offset.x : offset.x;
  const y = offset.y;
  switch (rotation) {
    case 0: return { x, y };
    case 90: return { x: h - 1 - y, y: x };
    case 180: return { x: w - 1 - x, y: h - 1 - y };
    case 270: return { x: y, y: w - 1 - x };
  }
}

/**
 * The world cells this placement passes over rather than stands on (see
 * `CatalogEntry.bridgedCells`). Empty for all but the bridge conveyor.
 */
export function bridgedCells(placement: Placement, entry: CatalogEntry): Cell[] {
  return (entry.bridgedCells ?? []).map((offset) => {
    const local = placedOffset(offset, entry.footprint, placement.rotation, placement.mirrored ?? false);
    return { x: placement.cell.x + local.x, y: placement.cell.y + local.y };
  });
}

/**
 * The anchor cell (top-left of the rotated footprint) that puts the object's
 * middle under `cursor`. Even-sized footprints round toward the anchor corner.
 */
export function centredAnchor(
  cursor: Cell,
  footprint: { w: number; h: number },
  rotation: Rotation,
): Cell {
  const { w, h } = rotatedFootprint(footprint, rotation);
  return {
    x: cursor.x - Math.floor((w - 1) / 2),
    y: cursor.y - Math.floor((h - 1) / 2),
  };
}

/**
 * The middle cell of a placement's footprint, the inverse of `centredAnchor`.
 * Keeping the two inverse is what brings an object back to its start after
 * four quarter turns.
 */
export function centreOf(placement: Placement, footprint: { w: number; h: number }): Cell {
  const { w, h } = rotatedFootprint(footprint, placement.rotation);
  return {
    x: placement.cell.x + Math.floor((w - 1) / 2),
    y: placement.cell.y + Math.floor((h - 1) / 2),
  };
}

/**
 * Turns a placement to `rotation` about its middle cell instead of its anchor,
 * so a long object turns in place rather than jumping.
 */
export function rotatedAboutCentre(
  placement: Placement,
  footprint: { w: number; h: number },
  rotation: Rotation,
): Placement {
  return {
    ...placement,
    rotation,
    cell: centredAnchor(centreOf(placement, footprint), footprint, rotation),
  };
}

/**
 * Cells the placement occupies, in row-major order from its anchor cell
 * (x+ = east, y+ = south).
 */
export function coveredCells(placement: Placement, entry: CatalogEntry): Cell[] {
  const { w, h } = rotatedFootprint(entry.footprint, placement.rotation);
  const cells: Cell[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({ x: placement.cell.x + dx, y: placement.cell.y + dy });
    }
  }
  return cells;
}

/**
 * A buildable rectangle on one floor of a warehouse, in cell coordinates.
 * Declared here rather than imported from `src/data/warehouses.ts` so
 * `src/core/` stays free of data imports; structural typing keeps them compatible.
 */
export interface GridBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One warehouse's buildable geometry: `floors[floor]` lists that floor's
 * blocks. A warehouse can be non-rectangular, hence rectangles per floor.
 */
export type WarehouseFloors = readonly (readonly GridBlock[])[];

/** Per-warehouse geometry; real values come from `WAREHOUSES` in
 * `src/data/warehouses.ts`. Partial: a building left out has no floor to build on. */
export type WarehouseGeometry = Readonly<Partial<Record<WarehouseId, WarehouseFloors>>>;

/**
 * True when `cell` falls inside any block of `warehouse`'s `floor`: the real
 * buildable-area test, unlike the bounding box of `warehouseDimensions`.
 * An out-of-range `floor` is unbuildable, not an error.
 */
export function isBuildable(
  warehouse: WarehouseId,
  floor: number,
  cell: Cell,
  geometry: WarehouseGeometry,
): boolean {
  const blocks = geometry[warehouse]?.[floor];
  if (!blocks) return false;
  return blocks.some(
    (b) => cell.x >= b.x && cell.x < b.x + b.w && cell.y >= b.y && cell.y < b.y + b.h,
  );
}

/**
 * Bounding box of every block across every floor of `warehouse`, plus its
 * floor count. Not the buildable area (L shapes, narrower upper floors): it is
 * for rendering and camera extent. Use `isBuildable` for a single cell.
 */
export function warehouseDimensions(
  warehouse: WarehouseId,
  geometry: WarehouseGeometry,
): { w: number; h: number; floors: number } {
  const floors = geometry[warehouse] ?? [];
  if (!floors.some((blocks) => blocks.length > 0)) return { w: 0, h: 0, floors: floors.length };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const blocks of floors) {
    for (const b of blocks) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
  }
  return { w: maxX - minX, h: maxY - minY, floors: floors.length };
}

// x+ = east, y+ = south. Side labels are inverted: `N` faces y + 1 (down on
// screen) and `S` faces y - 1; do not "fix" this (see src/data/ports.ts).
// Shared by graph.ts and renderer.ts so they agree on which way a port faces.
export const SIDE_STEP: Record<Side, { dx: number; dy: number }> = {
  N: { dx: 0, dy: 1 },
  S: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

/**
 * Resolves a port's cell from its `offset` and `side`, both in the rotated
 * footprint's frame (the port table in src/data/ports.ts is authored at
 * rotation 0). Shared by graph.ts and renderer.ts.
 */
export function portCell(anchor: Cell, side: Side, offset: number, w: number, h: number): Cell {
  switch (side) {
    case 'N':
      return { x: anchor.x + Math.min(offset, w - 1), y: anchor.y + h - 1 };
    case 'S':
      return { x: anchor.x + Math.min(offset, w - 1), y: anchor.y };
    case 'E':
      return { x: anchor.x + w - 1, y: anchor.y + Math.min(offset, h - 1) };
    case 'W':
      return { x: anchor.x, y: anchor.y + Math.min(offset, h - 1) };
  }
}
