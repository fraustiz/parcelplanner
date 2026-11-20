import { placedPort, rotatedFootprint, portCell, SIDE_STEP } from './grid';
import type { CatalogEntry, Cell, Door, Plan, Side } from './types';

/**
 * Not called by the app at the moment. Kept and tested as the base for future
 * sorting analysis: the port table, the doors' in/out modelling and
 * `placedPort`'s mirror ordering are checked against game data. Delete it if
 * flow analysis is dropped for good. The catalogue has no throughput, so
 * nothing built on this may claim a spot copes, only how many lines meet there.
 */

export interface ResolvedPort {
  placementId: string;
  /** Cell the port sits on. */
  cell: Cell;
  floor: number;
  side: Side;
  dir: 'in' | 'out';
  /** Floor the port opens onto: floor + floorDelta. */
  targetFloor: number;
}

export interface Edge { from: string; to: string }

export interface Graph {
  edges: Edge[];
  ports: ResolvedPort[];
  /** Outputs with nothing to feed: parcels would fall on the floor. */
  danglingOutputs: ResolvedPort[];
  /**
   * `in` ports that lost a same-(floor, cell, side) collision to another `in`
   * port and were left out of matching. Only a malformed port table causes
   * this, but it must never vanish silently.
   */
  portConflicts: ResolvedPort[];
}

// x+ = east, y+ = south. Side labels are inverted: `N` faces y + 1 (down on
// screen) and `S` faces y - 1; do not "fix" this to match compass intuition
// (see src/data/ports.ts). A positive rotation steps N -> W -> S -> E.
// SIDE_STEP and portCell live in ./grid, shared with the renderer.

// Exported so validate.ts and other callers derive the same node id for a
// door as buildGraph does.
export const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function doorNodeId(door: Door): string {
  return `door:${door.id}`;
}

const inKey = (floor: number, cell: Cell, side: Side): string =>
  `${floor}:${cell.x}:${cell.y}:${side}`;

export function buildGraph(
  plan: Plan,
  catalogue: Map<string, CatalogEntry>,
  /** Fixed delivery/export doors, e.g. `DOORS` from `src/data/doors.ts`,
   * passed in so `src/core/` stays free of data imports. Doors add ports to
   * the graph but are never placements. */
  doors: readonly Door[],
): Graph {
  const ports: ResolvedPort[] = [];

  // Only the current warehouse takes part: a belt in the other building never
  // connects here, even on matching cells.
  for (const p of plan.placements) {
    if (p.warehouse !== plan.warehouse) continue;
    const entry = catalogue.get(p.objectId);
    if (!entry) continue;
    const { w, h } = rotatedFootprint(entry.footprint, p.rotation);
    for (const port of entry.ports) {
      const { side, offset } = placedPort(port, p.rotation, p.mirrored ?? false, entry.footprint);
      const cell = portCell(p.cell, side, offset, w, h);
      ports.push({
        placementId: p.id,
        cell,
        floor: p.floor,
        side,
        dir: port.dir,
        targetFloor: p.floor + (port.floorDelta ?? 0),
      });
    }
  }

  // Doors add one port each, filtered by warehouse like placements. The
  // conveyor using a door stands on the door's own cell (`canPlace` allows it),
  // and edges step from an out-port to its neighbour, so the door's port sits
  // one step outside the building (the literal `door.side` direction, never
  // buildable), facing back in. It cannot collide with a real placement's port.
  for (const door of doors) {
    if (door.warehouse !== plan.warehouse) continue;
    const outward = SIDE_STEP[door.side];
    ports.push({
      placementId: doorNodeId(door),
      cell: { x: door.cell.x + outward.dx, y: door.cell.y + outward.dy },
      floor: door.floor,
      side: OPPOSITE[door.side],
      dir: door.kind === 'delivery' ? 'out' : 'in',
      targetFloor: door.floor,
    });
  }

  // Inputs indexed by effective floor (targetFloor), so this index and the
  // out-side lookup agree for ports with a nonzero floorDelta.
  const inputs = new Map<string, ResolvedPort>();
  const portConflicts: ResolvedPort[] = [];
  for (const port of ports) {
    if (port.dir !== 'in') continue;
    const key = inKey(port.targetFloor, port.cell, port.side);
    if (inputs.has(key)) {
      portConflicts.push(port);
    } else {
      inputs.set(key, port);
    }
  }

  const edges: Edge[] = [];
  const dangling: ResolvedPort[] = [];

  for (const out of ports) {
    if (out.dir !== 'out') continue;
    const step = SIDE_STEP[out.side];
    const neighbour: Cell = { x: out.cell.x + step.dx, y: out.cell.y + step.dy };
    const match = inputs.get(inKey(out.targetFloor, neighbour, OPPOSITE[out.side]));
    if (match && match.placementId !== out.placementId) {
      edges.push({ from: out.placementId, to: match.placementId });
    } else {
      dangling.push(out);
    }
  }

  if (portConflicts.length > 0) {
    const ids = portConflicts.map((c) => c.placementId).join(', ');
    console.warn(`buildGraph: ${portConflicts.length} port conflict(s) on placement(s): ${ids}`);
  }

  return { edges, ports, danglingOutputs: dangling, portConflicts };
}
