import type { ResolvedPort } from './graph';
import { placedPort, portCell, rotatedFootprint, SIDE_STEP } from './grid';
import type { CargoChoice, CatalogEntry, Cell, DiverterSides, Placement, Side } from './types';

/**
 * The two diverters the player sets up in the game, read from their
 * Blueprints (UE 5.7.4):
 *
 * - The country diverter (`BP_ConveyorBelt_CountryDiverter2`) is three cells
 *   long, each a small diverter with a screen on either side. A parcel leaves
 *   by the side whose screen shows its country, else it carries straight on.
 * - The cargo type diverter (`BP_ConveyorBelt_Diverter`) has a screen per way
 *   out. A parcel takes, in turn, a way set to its cargo type, or one set to
 *   "other" when no screen names its type; failing those, one left on "any".
 *   A way set to "none" takes nothing: it matches no type and is no fallback.
 */
export const COUNTRY_DIVERTER = 'BP_ConveyorBelt_CountryDiverter2';
export const CARGO_DIVERTER = 'BP_ConveyorBelt_Diverter';

/**
 * Every setting a cargo screen can hold besides "any", in the order offered.
 * A link stores a setting by its place here, so append only.
 */
export const CARGO_CHOICES: readonly CargoChoice[] = ['Road', 'Rail', 'Air', 'Maritime', 'Other', 'None'];

export const isCargoChoice = (value: unknown): value is CargoChoice =>
  typeof value === 'string' && (CARGO_CHOICES as readonly string[]).includes(value);

/** Which way a diverter's exit leads, seen in the direction parcels travel. */
export type Way = 'left' | 'forward' | 'right';

/**
 * Where an exit of a diverter sits, as its screens see it: the cell it leaves
 * from, counted from the entry, and its way in the direction parcels travel.
 * `entry` is the diverter's in port, `out` the exit's out port.
 */
export function exitWay(
  entry: Pick<ResolvedPort, 'cell' | 'side'> | undefined,
  out: Pick<ResolvedPort, 'cell' | 'side'>,
): { cell: number; way: Way } {
  // Parcels travel away from the side they come in by.
  const inward = entry === undefined ? { dx: 0, dy: -1 } : SIDE_STEP[entry.side];
  const travel = { dx: -inward.dx, dy: -inward.dy };
  const step = SIDE_STEP[out.side];
  const along = entry === undefined ? 0
    : (out.cell.x - entry.cell.x) * travel.dx + (out.cell.y - entry.cell.y) * travel.dy;
  if (step.dx === travel.dx && step.dy === travel.dy) return { cell: Math.abs(along), way: 'forward' };
  // y grows down the screen, so a positive turn is to the right.
  const turn = travel.dx * step.dy - travel.dy * step.dx;
  return { cell: Math.abs(along), way: turn > 0 ? 'right' : 'left' };
}

/** Cells a country diverter is long, so how many pairs of screens it has. */
export const COUNTRY_DIVERTER_CELLS = 3;

/**
 * One screen of a diverter on the grid: the cell and side it looks out of,
 * which screen it is (`cell` counted from the entry, and its `way`), and what
 * it is set to, a country id or a cargo choice, undefined when unset.
 */
export interface DiverterScreen {
  cell: Cell;
  side: Side;
  at: { cell: number; way: Way };
  value: string | undefined;
}

/**
 * Every screen of a country or cargo diverter, set or not. Ports are placed
 * as the flow graph places them, and read through `exitWay`, so a screen
 * drawn on a side is the one the parcel preview sorts by. A country diverter
 * has no screen straight on; a cargo diverter has one on each of its ways.
 */
export function diverterScreens(placement: Placement, entry: CatalogEntry): DiverterScreen[] {
  const country = placement.objectId === COUNTRY_DIVERTER;
  if (!country && placement.objectId !== CARGO_DIVERTER) return [];
  const { w, h } = rotatedFootprint(entry.footprint, placement.rotation);
  const place = (port: { side: Side; offset: number }) => {
    const { side, offset } = placedPort(port, placement.rotation, placement.mirrored ?? false, entry.footprint);
    return { side, cell: portCell(placement.cell, side, offset, w, h) };
  };
  const inPort = entry.ports.find((port) => port.dir === 'in');
  const way = inPort === undefined ? undefined : place(inPort);
  const screens: DiverterScreen[] = [];
  for (const port of entry.ports) {
    if (port.dir !== 'out') continue;
    const out = place(port);
    const at = exitWay(way, out);
    let value: string | undefined;
    if (country) {
      if (at.way === 'forward') continue;
      value = placement.diverterCountries?.[at.cell]?.[at.way];
    } else {
      value = placement.diverterCargo?.[at.way];
    }
    screens.push({ cell: out.cell, side: out.side, at, value });
  }
  return screens;
}

/**
 * Where each screen of a country diverter that is set to a country stands on
 * the grid: the cell, the side it looks out of, and the country.
 */
export function countryScreens(
  placement: Placement,
  entry: CatalogEntry,
): { cell: Cell; side: Side; country: string }[] {
  if (placement.objectId !== COUNTRY_DIVERTER) return [];
  return diverterScreens(placement, entry).flatMap((screen) =>
    screen.value === undefined ? [] : [{ cell: screen.cell, side: screen.side, country: screen.value }]);
}

/** A screen's size in cells, along the cell's edge and across it. */
export const SCREEN_ALONG = 0.36;
export const SCREEN_ACROSS = 0.3;
/** The gap between a screen and its cell's edge, in cells. */
export const SCREEN_MARGIN = 0.04;

/**
 * The square a screen takes on its cell, against the side it looks out of, in
 * grid units. The renderer draws in it and a click inside it picks the screen.
 */
export function screenBox(cell: Cell, side: Side): { x: number; y: number; w: number; h: number } {
  const step = SIDE_STEP[side];
  const w = step.dx === 0 ? SCREEN_ALONG : SCREEN_ACROSS;
  const h = step.dx === 0 ? SCREEN_ACROSS : SCREEN_ALONG;
  const cx = cell.x + 0.5 + step.dx * (0.5 - w / 2 - SCREEN_MARGIN);
  const cy = cell.y + 0.5 + step.dy * (0.5 - h / 2 - SCREEN_MARGIN);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The screen of `screens` under `point`, a position in grid units, if any. */
export function screenAt(screens: readonly DiverterScreen[], point: { x: number; y: number }): DiverterScreen | undefined {
  return screens.find((screen) => {
    const box = screenBox(screen.cell, screen.side);
    return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  });
}

/**
 * `placement` with one screen set to `value`, or cleared when it is
 * undefined. Nothing is left behind when no screen is set any more.
 */
export function withScreen(placement: Placement, at: { cell: number; way: Way }, value: string | undefined): Placement {
  if (placement.objectId === COUNTRY_DIVERTER) {
    if (at.way === 'forward') return placement;
    const next = Array.from({ length: COUNTRY_DIVERTER_CELLS }, (_, i) => ({ ...(placement.diverterCountries?.[i] ?? {}) }));
    const screen = next[at.cell];
    if (screen === undefined) return placement;
    if (value === undefined) delete screen[at.way];
    else screen[at.way] = value;
    const { diverterCountries: _drop, ...rest } = placement;
    return next.some((s) => Object.keys(s).length > 0) ? { ...rest, diverterCountries: next } : rest;
  }
  if (placement.objectId === CARGO_DIVERTER) {
    const next = { ...(placement.diverterCargo ?? {}) };
    if (isCargoChoice(value)) next[at.way] = value;
    else delete next[at.way];
    const { diverterCargo: _drop, ...rest } = placement;
    return Object.keys(next).length > 0 ? { ...rest, diverterCargo: next } : rest;
  }
  return placement;
}

/**
 * The exits a parcel with `country` and `cargo` may take at `placement`, as
 * (cell from the entry, way) pairs, best first, plus the exits it falls back
 * to when those have no room. `exits` lists every wired exit. Returns
 * undefined for any other object.
 */
export function diverterChoice(
  placement: Placement,
  exits: readonly { cell: number; way: Way }[],
  parcel: { country: string | null; cargo: string },
): { wanted: number[]; fallback: number[] } | undefined {
  const indexes = exits.map((_, i) => i);
  if (placement.objectId === COUNTRY_DIVERTER) {
    const screens = placement.diverterCountries ?? [];
    const matching = indexes.filter((i) => {
      const { cell, way } = exits[i]!;
      if (way === 'forward' || parcel.country === null) return false;
      return screens[cell]?.[way] === parcel.country;
    });
    // No screen shows its country: it rides straight through.
    return { wanted: matching.length > 0 ? matching : indexes.filter((i) => exits[i]!.way === 'forward'), fallback: [] };
  }
  if (placement.objectId === CARGO_DIVERTER) {
    const screens = placement.diverterCargo ?? {};
    const setting = (way: Way): CargoChoice | undefined => screens[way];
    const named = new Set((['left', 'forward', 'right'] as const).map(setting));
    const matching = indexes.filter((i) => {
      const choice = setting(exits[i]!.way);
      return choice === parcel.cargo || (choice === 'Other' && !named.has(parcel.cargo as CargoChoice));
    });
    return { wanted: matching, fallback: indexes.filter((i) => setting(exits[i]!.way) === undefined) };
  }
  return undefined;
}

/**
 * The settings worth keeping on a placement read from a file or a link: known
 * countries and cargo types only, on the right object, and nothing left when
 * nothing is set. `isCountry` comes from the caller, which holds the list.
 */
export function cleanDiverterSettings(placement: Placement, isCountry: (value: unknown) => value is string): Placement {
  const { diverterCountries, diverterCargo, ...rest } = placement;
  const countries = placement.objectId === COUNTRY_DIVERTER && Array.isArray(diverterCountries)
    ? Array.from({ length: COUNTRY_DIVERTER_CELLS }, (_, i) => keepSides<string>(diverterCountries[i], isCountry))
    : [];
  const cargo = placement.objectId === CARGO_DIVERTER && typeof diverterCargo === 'object' && diverterCargo !== null
    ? keepSides<CargoChoice>(diverterCargo, isCargoChoice, ['left', 'forward', 'right'])
    : {};
  return {
    ...rest,
    ...(countries.some((side) => Object.keys(side).length > 0) ? { diverterCountries: countries } : {}),
    ...(Object.keys(cargo).length > 0 ? { diverterCargo: cargo } : {}),
  };
}

function keepSides<T>(
  value: unknown,
  keep: (v: unknown) => v is T,
  ways: readonly string[] = ['left', 'right'],
): DiverterSides<T> & { forward?: T } {
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(ways.filter((way) => keep(record[way])).map((way) => [way, record[way]])) as DiverterSides<T>;
}
