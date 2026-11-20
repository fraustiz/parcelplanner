import type { Edge } from './graph';

/**
 * One parcel walked along the flow graph, to show where a layout sends things.
 *
 * Not a sorting simulation: a scanner's verdict is a coin toss, since deciding
 * it properly would mean rebuilding the game. `choose` is injected (random in
 * the app, deterministic in tests), and every hop that consulted it is recorded
 * in `guessedAt` so those branches can be marked as arbitrary.
 */
export type ChooseNext = (options: readonly string[], at: string) => string;

export interface ParcelWalk {
  /** Every node visited, in order, starting with `start`. */
  path: string[];
  /**
   * Why it stopped. `dropped`: nothing carries the parcel on (a line ending in
   * mid-air). `looped`: it came back to somewhere it had been. `exhausted`: the
   * hop limit, so a malformed graph cannot hang the editor.
   */
  ending: 'delivered' | 'stored' | 'dropped' | 'looped' | 'exhausted';
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
}

export function parcelPath(
  edges: readonly Edge[],
  start: string,
  choose: ChooseNext,
  { exits, stores, maxHops = 2000 }: WalkOptions = {},
): ParcelWalk {
  const onward = new Map<string, string[]>();
  for (const edge of edges) {
    const list = onward.get(edge.from);
    if (list) list.push(edge.to);
    else onward.set(edge.from, [edge.to]);
  }

  const path = [start];
  const seen = new Set([start]);
  const guessedAt: string[] = [];

  for (let hop = 0; hop < maxHops; hop++) {
    const at = path[path.length - 1]!;
    // Checked before looking for a way onward: an export door has none either.
    if (exits?.has(at)) return { path, ending: 'delivered', guessedAt };
    if (stores?.has(at)) return { path, ending: 'stored', guessedAt };

    const options = onward.get(at) ?? [];
    if (options.length === 0) return { path, ending: 'dropped', guessedAt };

    // Only consulted where there is a real choice, so `guessedAt` lists true branches.
    const next = options.length === 1 ? options[0]! : (guessedAt.push(at), choose(options, at));

    if (seen.has(next)) return { path, ending: 'looped', guessedAt, loopsBackTo: path.indexOf(next) };
    seen.add(next);
    path.push(next);
  }

  return { path, ending: 'exhausted', guessedAt };
}

/**
 * Picks a branch that mostly carries on straight ahead. A sticker checker has
 * three outputs and only one means "fine, carry on"; a fair toss would send two
 * parcels in three to reject lines.
 *
 * `sideShare` is how often a parcel is refused: a viewing choice, not a
 * measurement (game data says nothing about it). `roll` is passed in so tests
 * can pin the outcome.
 */
export function mostlyStraight(
  options: readonly string[],
  straightAhead: string | undefined,
  roll: number,
  sideShare: number,
): string {
  // Nothing straight ahead: every parcel goes sideways, so pick fairly.
  if (straightAhead === undefined || !options.includes(straightAhead)) {
    return options[Math.min(options.length - 1, Math.floor(roll * options.length))]!;
  }

  const sides = options.filter((o) => o !== straightAhead);
  if (sides.length === 0 || roll >= sideShare) return straightAhead;

  // Spread refused parcels evenly across the reject lines.
  const across = roll / sideShare;
  return sides[Math.min(sides.length - 1, Math.floor(across * sides.length))]!;
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
