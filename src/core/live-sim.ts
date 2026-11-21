import type { ParcelLabels } from './parcel-labels';
import { advanceOneCell } from './queueing';
import type { ParcelWalk, RouteStep } from './simulate';

/**
 * The parcel preview, in game time. Each parcel walks a route of cells; it may
 * leave a cell once it has crossed it (`due`), if the cell ahead is free. How
 * long a cell takes, where a scanner sends a parcel and how a smart splitter
 * shares its parcels out all come from the game (see `SimContext`).
 *
 * Pure: the layout is reached only through `SimContext`, so tests can drive it
 * on a handful of cells.
 */

export type Ending = ParcelWalk['ending'];

/** A route a parcel can be sent along. */
export interface Walk {
  cells: RouteStep[];
  ending: Ending;
  /** For a looping route: the cell it rejoins after the last one. */
  wrapTo?: number;
  /** The node the route ends at: a rack, a door, or a splitter still to decide. */
  endsAt?: string;
}

export interface SimParcel extends Walk {
  labels: ParcelLabels;
  /** Where it is, as an index into `cells`, and the cell it slid in from. */
  index: number;
  from: number;
  /** When it began sliding into its cell, and for how long, for drawing. */
  movedAt: number;
  moveFor: number;
  /** When it may leave its cell: the slide plus any stop there (a scan). */
  due: number;
  /** When it last moved, to tell a queue from a jam. */
  stillSince: number;
}

export interface SimState {
  /** Game seconds since play was pressed. */
  now: number;
  parcels: SimParcel[];
  delivered: number;
  /** Delivered through a door that does not take them: see SimContext.misSorted. */
  misSorted: number;
  fell: number;
  /** What each rack holds, by placement id, oldest first. */
  racks: Record<string, ParcelLabels[]>;
  /** When each source may next release a parcel or open for a truck, by source key. */
  nextRelease: Record<string, number>;
  /** Parcels still in each door from its last truck, by source key. */
  truckLeft: Record<string, number>;
  /** Each smart splitter's next way to try, as an index into its branches. */
  turn: Record<string, number>;
  /**
   * Each export door's truck, by door node: parcels in it, and until when the
   * door is shut while a full truck leaves. A door not listed is open and empty.
   */
  exports: Record<string, { load: number; shutUntil: number }>;
}

export const EMPTY_SIM: SimState = {
  now: 0, parcels: [], delivered: 0, misSorted: 0, fell: 0, racks: {}, nextRelease: {}, truckLeft: {}, turn: {}, exports: {},
};

/** Where parcels come in: a delivery door, or an unloader emptying a rack. */
export interface SimSource {
  key: string;
  /** The first cell a released parcel stands on; nothing is released while it is taken. */
  slot: string;
  /** For an unloader, the rack it takes from. */
  rack?: string;
  /**
   * For a delivery door: each truck brings `parcels`, and the door opens again
   * once its timer has run `every` seconds and the last truck's parcels are
   * all out (`BP_DeliveryManager.TryOpenDoorAndSpawnParcels`).
   */
  truck?: { parcels: number; every: number };
  /** A new parcel's route, given what it carries. */
  walk: (labels: ParcelLabels) => Walk;
}

/** One way on from a splitter or a diverter that decides when the parcel arrives. */
export interface Branch {
  /** The first cell past the splitter: free means the splitter may use it. */
  slot: string;
  /** The route from there, the splitter's own cells left out. */
  walk: (labels: ParcelLabels) => Walk;
}

export interface SimContext {
  sources: readonly SimSource[];
  /** Parcels each rack holds. */
  capacity: ReadonlyMap<string, number>;
  /** A new parcel's labels, for a delivery door. */
  draw: () => ParcelLabels;
  /**
   * The ways on from a node that decides on arrival, for this parcel: those it
   * wants, taken in turn, and those it settles for when none of them has room
   * (a cargo diverter's "any" screens). Null when the node leads nowhere.
   */
  branches: (node: string, labels: ParcelLabels) => { wanted: readonly Branch[]; fallback: readonly Branch[] } | null;
  /** Whether the door `node` should not have had this parcel: an invalid one
   * exported, a valid one rejected, the wrong cargo type or country. */
  misSorted: (node: string, labels: ParcelLabels) => boolean;
  /** How long sliding into `cell` takes, coming from `previous`. */
  slideSeconds: (cell: RouteStep, previous: RouteStep | undefined) => number;
  /** How long a parcel must stop on `cell` once there: a scanner's scan. */
  stopSeconds: (cell: RouteStep) => number;
  /** Whether a pauser at `node` is holding parcels back. */
  isClosed: (node: string) => boolean;
  /**
   * Export doors fill a truck (see EXPORT_TRUCK_PARCELS): once it holds
   * `parcels`, parcels for that door wait on the belt. With `automatic`
   * (the Automatic Exports upgrade) the truck leaves at once and the door is
   * shut for `shutSeconds`; without it the door stays full, as in the game
   * until the player presses its button. Absent: doors take everything.
   */
  exportTrucks?: { parcels: number; shutSeconds: number; automatic: boolean };
  unloadSeconds: number;
  retrySeconds: number;
  /** A ceiling on parcels alive at once, so a pathological layout cannot grow without bound. */
  maxParcels: number;
}

/** How long a parcel shows at the end of a line that leads nowhere before it falls. */
const DEAD_END_SECONDS = 2;

/**
 * How long a parcel on a loop or a dead end may stand still before it falls
 * and frees its cell. A parcel on its way to a door, a rack or a splitter
 * never falls for waiting: a queue is the layout's answer, not a jam.
 */
const STUCK_SECONDS = 24;

const slotOf = (p: SimParcel): string => p.cells[p.index]!.slot;

/** Sends `parcel` on from the splitter it waits at, if one of its ways has room. */
function decideAtSplitter(
  parcel: SimParcel,
  ctx: SimContext,
  turn: Record<string, number>,
  taken: ReadonlySet<string>,
): SimParcel | 'blocked' | 'dead' {
  const splitter = parcel.endsAt!;
  const options = ctx.branches(splitter, parcel.labels);
  if (options === null) return 'dead';
  // The ways it wants first, in turn; then the fallbacks, in turn. With none
  // free the parcel waits on the splitter and it tries again.
  let chosen: Branch | undefined;
  for (const ways of [options.wanted, options.fallback]) {
    const start = turn[splitter] ?? 0;
    for (let k = 0; k < ways.length && chosen === undefined; k++) {
      const pick = (start + k) % ways.length;
      if (taken.has(ways[pick]!.slot)) continue;
      chosen = ways[pick];
      turn[splitter] = (pick + 1) % ways.length;
    }
    if (chosen !== undefined) break;
  }
  if (chosen !== undefined) {
    const rest = chosen.walk(parcel.labels);
    const offset = parcel.cells.length;
    return {
      ...parcel,
      cells: [...parcel.cells, ...rest.cells],
      ending: rest.ending,
      endsAt: rest.endsAt,
      ...(rest.wrapTo !== undefined ? { wrapTo: offset + rest.wrapTo } : { wrapTo: undefined }),
    };
  }
  return 'blocked';
}

/** Advances the preview by `dt` game seconds. Returns a new state. */
export function stepSim(state: SimState, ctx: SimContext, dt: number): SimState {
  const before = state.now;
  const now = before + dt;
  const racks: Record<string, ParcelLabels[]> = { ...state.racks };
  const turn = { ...state.turn };
  const nextRelease = { ...state.nextRelease };
  const truckLeft = { ...state.truckLeft };
  const exports = { ...(state.exports ?? {}) };
  let { delivered, misSorted, fell } = state;
  // A door whose truck has left and reopened takes parcels again, from empty.
  for (const [door, truck] of Object.entries(exports)) {
    if (truck.shutUntil > 0 && truck.shutUntil <= now) exports[door] = { load: 0, shutUntil: 0 };
  }
  /** Whether the export door `door` takes a parcel now: open, with room in its truck. */
  const doorTakes = (door: string): boolean => {
    const trucks = ctx.exportTrucks;
    if (trucks === undefined) return true;
    const truck = exports[door] ?? { load: 0, shutUntil: 0 };
    return truck.shutUntil <= now && truck.load < trucks.parcels;
  };
  /** Puts a parcel in `door`'s truck, and sends the truck off when that fills it. */
  const loadDoor = (door: string): void => {
    const trucks = ctx.exportTrucks;
    if (trucks === undefined) return;
    const load = (exports[door]?.load ?? 0) + 1;
    exports[door] = load >= trucks.parcels && trucks.automatic
      ? { load, shutUntil: now + trucks.shutSeconds }
      : { load, shutUntil: 0 };
  };

  // Splitters decide first, on what stands where right now.
  const taken = new Set(state.parcels.map(slotOf));
  const live: SimParcel[] = [];
  for (const p of state.parcels) {
    const waiting = p.ending === 'pending' && p.index >= p.cells.length - 1 && p.due <= now;
    if (!waiting) { live.push(p); continue; }
    const decided = decideAtSplitter(p, ctx, turn, taken);
    if (decided === 'dead') live.push({ ...p, ending: 'dropped' });
    else if (decided === 'blocked') live.push({ ...p, due: now + ctx.retrySeconds });
    else {
      taken.add(decided.cells[decided.index + 1]?.slot ?? '');
      live.push(decided);
    }
  }

  // Arrivals leave first, so the cell they free is taken in this same step.
  const staying: SimParcel[] = [];
  for (const p of live) {
    const atEnd = p.index >= p.cells.length - 1 && p.wrapTo === undefined;
    if (atEnd && p.due <= now) {
      if (p.ending === 'delivered' && (p.endsAt === undefined || doorTakes(p.endsAt))) {
        delivered++;
        if (p.endsAt !== undefined) {
          loadDoor(p.endsAt);
          if (ctx.misSorted(p.endsAt, p.labels)) misSorted++;
        }
        continue;
      }
      if (p.ending === 'stored' && p.endsAt !== undefined) {
        const held = racks[p.endsAt] ?? [];
        if (held.length < (ctx.capacity.get(p.endsAt) ?? 0)) {
          racks[p.endsAt] = [...held, p.labels];
          continue;
        }
      }
      if ((p.ending === 'dropped' || p.ending === 'exhausted') && now - p.due >= DEAD_END_SECONDS) {
        fell++;
        continue;
      }
    }
    staying.push(p);
  }

  // Who may move: crossed its cell, not held by a closed pauser, not at the end.
  const ready = staying.map((p) => p.due <= now
    && !ctx.isClosed(p.cells[p.index]!.node)
    && (p.index < p.cells.length - 1 || p.wrapTo !== undefined));
  const waited = staying.map((p) => ({ ...p, heldFor: now - p.stillSince }));
  const next = advanceOneCell(waited, ready);

  const kept: SimParcel[] = [];
  staying.forEach((p, i) => {
    const index = next[i]!;
    if (index !== p.index) {
      // A parcel that was due inside this step carries on from then, so a
      // belt keeps its true pace whatever the step length.
      const from = Math.max(p.due, before);
      const cell = p.cells[index]!;
      const slide = ctx.slideSeconds(cell, p.cells[p.index]);
      kept.push({
        ...p, index, from: p.index,
        movedAt: from, moveFor: slide, due: from + slide + ctx.stopSeconds(cell), stillSince: from,
      });
      return;
    }
    const patient = p.ending === 'delivered' || p.ending === 'stored' || p.ending === 'pending'
      || ctx.isClosed(p.cells[p.index]!.node);
    if (!patient && now - p.stillSince > STUCK_SECONDS) { fell++; return; }
    kept.push(p);
  });

  // Doors and unloaders release onto a free first cell.
  const occupied = new Set(kept.map(slotOf));
  for (const source of ctx.sources) {
    if (occupied.has(source.slot)) continue;
    if (source.truck !== undefined) {
      if ((truckLeft[source.key] ?? 0) === 0) {
        if ((nextRelease[source.key] ?? 0) > now) continue;
        truckLeft[source.key] = source.truck.parcels;
        nextRelease[source.key] = now + source.truck.every;
      }
    } else if ((nextRelease[source.key] ?? 0) > now) continue;
    let labels: ParcelLabels;
    if (source.rack !== undefined) {
      const held = racks[source.rack] ?? [];
      if (held.length === 0) continue;
      labels = held[0]!;
      racks[source.rack] = held.slice(1);
      nextRelease[source.key] = now + ctx.unloadSeconds;
    } else {
      labels = ctx.draw();
    }
    const walk = source.walk(labels);
    if (walk.cells.length === 0) continue;
    if (source.truck !== undefined) truckLeft[source.key] = truckLeft[source.key]! - 1;
    const slide = ctx.slideSeconds(walk.cells[0]!, undefined);
    occupied.add(source.slot);
    kept.push({
      ...walk, labels, index: 0, from: 0,
      movedAt: now, moveFor: slide, due: now + slide + ctx.stopSeconds(walk.cells[0]!), stillSince: now,
    });
  }

  return {
    now,
    parcels: kept.length > ctx.maxParcels ? kept.slice(-ctx.maxParcels) : kept,
    delivered,
    misSorted,
    fell,
    racks,
    nextRelease,
    truckLeft,
    turn,
    exports,
  };
}
