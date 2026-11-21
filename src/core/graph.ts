import { placedPort, rotatedFootprint, portCell, SIDE_STEP } from './grid';
import type { CatalogEntry, Cell, Door, Plan, Side } from './types';

/**
 * Which object feeds which: the parcel preview, the storage planner and the
 * dead-end warning (src/core/dead-ends.ts) are built on it. The port table,
 * the doors' in/out modelling and `placedPort`'s mirror ordering are checked
 * against game data and real saves. The catalogue has no throughput, so
 * nothing built on this may claim a spot copes, only how many lines meet there,
 * and nothing may call a layout valid (see src/core/validate.ts).
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

/**
 * Rewires each reversible piece that a belt feeds through one of its `out`
 * ports, in place: every side a belt feeds becomes an `in`, every other side
 * an `out`. A splitter fed from behind and from both sides thus merges the
 * three into its one free side. A piece no belt feeds through an `out` keeps
 * its ports. Fed is judged on the ports as declared, so two rewired pieces
 * facing each other are not seen as fed.
 */
function turnReversedPieces(ports: ResolvedPort[], reversibleIds: ReadonlySet<string>): void {
  if (reversibleIds.size === 0) return;
  // Where every out port delivers: the neighbouring cell, its facing side.
  const fedAt = new Set<string>();
  for (const port of ports) {
    if (port.dir !== 'out') continue;
    const step = SIDE_STEP[port.side];
    fedAt.add(inKey(port.targetFloor, { x: port.cell.x + step.dx, y: port.cell.y + step.dy }, OPPOSITE[port.side]));
  }
  const isFed = (port: ResolvedPort): boolean => fedAt.has(inKey(port.floor, port.cell, port.side));

  const byPiece = new Map<string, ResolvedPort[]>();
  for (const port of ports) {
    if (!reversibleIds.has(port.placementId)) continue;
    const list = byPiece.get(port.placementId);
    if (list) list.push(port);
    else byPiece.set(port.placementId, [port]);
  }
  for (const [, own] of byPiece) {
    if (!own.some((port) => port.dir === 'out' && isFed(port))) continue;
    for (const port of own) port.dir = isFed(port) ? 'in' : 'out';
  }
}

export function buildGraph(
  plan: Plan,
  catalogue: Map<string, CatalogEntry>,
  /** Fixed delivery/export doors, e.g. `DOORS` from `src/data/doors.ts`,
   * passed in so `src/core/` stays free of data imports. Doors add ports to
   * the graph but are never placements. */
  doors: readonly Door[],
): Graph {
  const ports: ResolvedPort[] = [];
  const reversibleIds = new Set<string>();

  // Only the current warehouse takes part: a belt in the other building never
  // connects here, even on matching cells.
  for (const p of plan.placements) {
    if (p.warehouse !== plan.warehouse) continue;
    const entry = catalogue.get(p.objectId);
    if (!entry) continue;
    if (entry.ports.some((port) => port.reversible)) reversibleIds.add(p.id);
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

  turnReversedPieces(ports, reversibleIds);

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
