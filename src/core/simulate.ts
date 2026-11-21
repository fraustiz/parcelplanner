import { OPPOSITE, type Edge, type ResolvedPort } from './graph';
import { cellsBetween, SIDE_STEP } from './grid';
import type { Cell } from './types';

/**
 * One parcel walked along the flow graph, to show where a layout sends things.
 *
 * `choose` is injected: in the app it reads the parcel's labels where a
 * scanner decides (src/core/parcel-labels.ts) and tosses a coin elsewhere; in
 * tests it is deterministic. Every hop that consulted it is recorded in
 * `guessedAt`.
 */
export type ChooseNext = (options: readonly string[], at: string) => string;

export interface ParcelWalk {
  /** Every node visited, in order, starting with `start`. */
  path: string[];
  /**
   * Why it stopped. `dropped`: nothing carries the parcel on (a line ending in
   * mid-air). `looped`: it came back to somewhere it had been. `exhausted`: the
   * hop limit, so a malformed graph cannot hang the editor. `pending`: it
   * reached a node `stopAt` names, whose way on is only decided on arrival.
   */
  ending: 'delivered' | 'stored' | 'dropped' | 'looped' | 'exhausted' | 'pending';
  /** Nodes where more than one way out existed and one was picked. */
  guessedAt: string[];
  /**
   * For a `looped` walk: the step in `path` the route rejoins. A loop is not a
   * failure (the parcel goes round again), and this lets the caller keep it going.
   */
  loopsBackTo?: number;
}

export interface WalkOptions {
  /**
   * Nodes a parcel leaves the layout through (export doors), so a walk ending
   * there is not mistaken for a dead end.
   */
  exits?: ReadonlySet<string>;
  /**
   * Nodes where a parcel stops because it belongs there (storage racks, which
   * have an in port and no out port).
   */
  stores?: ReadonlySet<string>;
  /** Hop limit, so a malformed graph cannot hang the editor. */
  maxHops?: number;
  /**
   * Nodes the walk stops at, other than where it starts: a smart splitter
   * picks its way on when the parcel gets there, from which belt has room.
   */
  stopAt?: (node: string) => boolean;
  /** Told of every node the walk enters, in order, `start` included: a
   * sticker applier changes the parcel before the next choice is made. */
  onVisit?: (node: string) => void;
  /** Nodes `choose` is asked about even with one way on: a scanner may send a
   * parcel to its other side, where nothing is wired. */
  alwaysAsk?: (node: string) => boolean;
}

/** Where each node leads, built once from the edges so that many walks over
 * the same layout do not each rebuild it. */
export type Onward = ReadonlyMap<string, readonly string[]>;

export function onwardOf(edges: readonly Edge[]): Onward {
  const onward = new Map<string, string[]>();
  for (const edge of edges) {
    const list = onward.get(edge.from);
    if (list) list.push(edge.to);
    else onward.set(edge.from, [edge.to]);
  }
  return onward;
}

export function parcelPath(
  edges: readonly Edge[] | Onward,
  start: string,
  choose: ChooseNext,
  { exits, stores, maxHops = 2000, stopAt, onVisit, alwaysAsk }: WalkOptions = {},
): ParcelWalk {
  const onward: Onward = edges instanceof Map ? (edges as Onward) : onwardOf(edges as readonly Edge[]);

  const path = [start];
  const seen = new Set([start]);
  const guessedAt: string[] = [];
  onVisit?.(start);

  for (let hop = 0; hop < maxHops; hop++) {
    const at = path[path.length - 1]!;
    // Checked before looking for a way onward: an export door has none either.
    if (exits?.has(at)) return { path, ending: 'delivered', guessedAt };
    if (stores?.has(at)) return { path, ending: 'stored', guessedAt };
    if (path.length > 1 && stopAt?.(at)) return { path, ending: 'pending', guessedAt };

    const options = onward.get(at) ?? [];
    if (options.length === 0) return { path, ending: 'dropped', guessedAt };

    // Only consulted where there is a real choice, so `guessedAt` lists true branches.
    const next = options.length === 1 && !alwaysAsk?.(at)
      ? options[0]!
      : (guessedAt.push(at), choose(options, at));

    if (seen.has(next)) return { path, ending: 'looped', guessedAt, loopsBackTo: path.indexOf(next) };
    seen.add(next);
    path.push(next);
    onVisit?.(next);
  }

  return { path, ending: 'exhausted', guessedAt };
}

/**
 * The objects fed directly by the given doors, where parcels enter. A door
 * that feeds nothing, or feeds another door, is left out.
 */
export function entryPoints(
  edges: readonly Edge[],
  doorIds: ReadonlySet<string>,
): Set<string> {
  const entries = new Set<string>();
  for (const edge of edges) {
    if (!doorIds.has(edge.from)) continue;
    if (doorIds.has(edge.to)) continue;
    entries.add(edge.to);
  }
  return entries;
}

/**
 * The doors that actually hand parcels to something. The storage planner
 * counts these rather than every delivery door of the warehouse.
 */
export function feedingDoors(
  edges: readonly Edge[],
  doorIds: ReadonlySet<string>,
): Set<string> {
  const running = new Set<string>();
  for (const edge of edges) {
    if (!doorIds.has(edge.from)) continue;
    if (doorIds.has(edge.to)) continue; // a door reaching a door feeds nothing
    running.add(edge.from);
  }
  return running;
}

/**
 * One cell of a parcel's route, as it is drawn and as it is queued.
 *
 * `slot` is what a parcel occupies: two parcels block each other only when
 * they want the same slot. It is the object plus the cell, so the belt running
 * under a bridge and the bridge above it never block each other, while two
 * arms meeting in one joiner still do.
 */
export interface RouteStep extends Cell {
  floor: number;
  slot: string;
  /** The object (or door) this cell belongs to. */
  node: string;
}

export interface Route {
  steps: RouteStep[];
  /** For each node of the walk, the index in `steps` where it begins. */
  startOf: number[];
}

/**
 * Turns a walk from node to node into every cell the parcel crosses.
 *
 * A node is entered on the cell of the port it is fed through and left from
 * the cell of the port that feeds the next one, so an object three cells long
 * (bridge, speedway, elevator, country diverter) is crossed cell by cell
 * instead of jumped over. Each cell keeps the floor of the object it belongs
 * to, so a parcel climbing an elevator arrives on the floor above.
 *
 * The walk starts on the delivery door that feeds its first node, outside the
 * wall, so the parcel is seen coming in; a walk into an export door ends on
 * the door, so it is seen going out. `onward` is the node a looping walk goes
 * back to, so its last object is left by the right port.
 */
/** Every port of each node, built once so that many routes over the same
 * layout do not each rebuild it. */
export type PortIndex = ReadonlyMap<string, readonly ResolvedPort[]>;

export function portIndexOf(ports: readonly ResolvedPort[]): PortIndex {
  const byNode = new Map<string, ResolvedPort[]>();
  for (const port of ports) {
    const list = byNode.get(port.placementId);
    if (list) list.push(port);
    else byNode.set(port.placementId, [port]);
  }
  return byNode;
}

const doorsByIndex = new WeakMap<PortIndex, string[]>();

/** The doors with an out port in an index, worked out once per index. */
function feedingDoorsOf(byNode: PortIndex): string[] {
  let doors = doorsByIndex.get(byNode);
  if (doors === undefined) {
    doors = [...byNode]
      .filter(([node, list]) => node.startsWith('door:') && list.some((port) => port.dir === 'out'))
      .map(([node]) => node);
    doorsByIndex.set(byNode, doors);
  }
  return doors;
}

export function routeSteps(
  path: readonly string[],
  ports: readonly ResolvedPort[] | PortIndex,
  onward?: string,
): Route {
  const byNode: PortIndex = ports instanceof Map ? (ports as PortIndex) : portIndexOf(ports as readonly ResolvedPort[]);

  /** The out port of `from` that feeds an in port of `to`, and that in port. */
  const link = (from: string, to: string): { out: ResolvedPort; into: ResolvedPort } | undefined => {
    for (const out of byNode.get(from) ?? []) {
      if (out.dir !== 'out') continue;
      const step = SIDE_STEP[out.side];
      const x = out.cell.x + step.dx;
      const y = out.cell.y + step.dy;
      const into = (byNode.get(to) ?? []).find((port) => port.dir === 'in'
        && port.targetFloor === out.targetFloor
        && port.side === OPPOSITE[out.side]
        && port.cell.x === x && port.cell.y === y);
      if (into) return { out, into };
    }
    return undefined;
  };

  const steps: RouteStep[] = [];
  const startOf: number[] = [];
  const push = (node: string, from: Cell, to: Cell, floor: number) => {
    for (const cell of cellsBetween(from, to)) {
      steps.push({ x: cell.x, y: cell.y, floor, node, slot: `${node}|${floor}:${cell.x},${cell.y}` });
    }
  };

  // The door feeding the first node, if there is one.
  const first = path[0];
  let entry: ResolvedPort | undefined;
  if (first !== undefined) {
    for (const node of feedingDoorsOf(byNode)) {
      const found = link(node, first);
      if (!found) continue;
      push(node, found.out.cell, found.out.cell, found.out.floor);
      entry = found.into;
      break;
    }
  }

  for (let i = 0; i < path.length; i++) {
    const node = path[i]!;
    const own = byNode.get(node) ?? [];
    const next = i + 1 < path.length ? path[i + 1] : onward;
    const found = next === undefined ? undefined : link(node, next);
    // Where it leaves: towards the next node, or for a dead end the one out
    // port, so the parcel runs to the end of the object before it falls.
    const exit = found?.out ?? own.find((port) => port.dir === 'out');
    const enter = entry ?? own.find((port) => port.dir === 'in') ?? exit;
    startOf.push(steps.length);
    if (enter === undefined) continue;
    push(node, enter.cell, exit?.cell ?? enter.cell, enter.floor);
    entry = found?.into;
  }

  return { steps, startOf };
}

/** Which node an in port belongs to, by floor, cell and side, built once per
 * layout so that `outLinks` need not search every port. */
export type InboundIndex = ReadonlyMap<string, string>;

const inboundKey = (floor: number, x: number, y: number, side: string): string =>
  `${floor}:${x},${y}:${side}`;

export function inboundIndexOf(ports: PortIndex): InboundIndex {
  const index = new Map<string, string>();
  for (const [node, list] of ports) {
    for (const port of list) {
      if (port.dir === 'in') index.set(inboundKey(port.targetFloor, port.cell.x, port.cell.y, port.side), node);
    }
  }
  return index;
}

/**
 * Where each out port of `node` leads, in the node's own port order: the
 * order a splitter takes its turns in, and the numbering `sortingPort` uses
 * (src/core/parcel-labels.ts). A port that feeds nothing is left out.
 */
export function outLinks(node: string, ports: PortIndex, inbound: InboundIndex): { port: number; to: string }[] {
  const links: { port: number; to: string }[] = [];
  (ports.get(node) ?? []).forEach((out, port) => {
    if (out.dir !== 'out') return;
    const step = SIDE_STEP[out.side];
    const to = inbound.get(inboundKey(out.targetFloor, out.cell.x + step.dx, out.cell.y + step.dy, OPPOSITE[out.side]));
    if (to !== undefined && to !== node) links.push({ port, to });
  });
  return links;
}

/**
 * The objects that take parcels out of a store (an unloader against a rack):
 * an in port that nothing feeds, facing a cell of a store. Each comes with the
 * store it empties.
 *
 * `ownerAt` names the placement covering a cell of a floor, if any.
 */
export function storePullers(
  ports: readonly ResolvedPort[],
  edges: readonly Edge[],
  ownerAt: (floor: number, cell: Cell) => string | undefined,
  isStore: (id: string) => boolean,
): { puller: string; store: string }[] {
  const fed = new Set(edges.map((edge) => edge.to));
  const found: { puller: string; store: string }[] = [];
  for (const port of ports) {
    if (port.dir !== 'in' || fed.has(port.placementId) || isStore(port.placementId)) continue;
    const step = SIDE_STEP[port.side];
    const store = ownerAt(port.targetFloor, { x: port.cell.x + step.dx, y: port.cell.y + step.dy });
    if (store === undefined || !isStore(store)) continue;
    found.push({ puller: port.placementId, store });
  }
  return found;
}
