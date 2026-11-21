import type { ResolvedPort } from './graph';
import { SIDE_STEP } from './grid';
import type { CargoChoice, DiverterSides, Placement } from './types';

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
 */
export const COUNTRY_DIVERTER = 'BP_ConveyorBelt_CountryDiverter2';
export const CARGO_DIVERTER = 'BP_ConveyorBelt_Diverter';

/** Every setting a cargo screen can hold besides "any", in the order offered. */
export const CARGO_CHOICES: readonly CargoChoice[] = ['Road', 'Rail', 'Air', 'Maritime', 'Other'];

export const isCargoChoice = (value: unknown): value is CargoChoice =>
  typeof value === 'string' && (CARGO_CHOICES as readonly string[]).includes(value);

/** Which way a diverter's exit leads, seen in the direction parcels travel. */
export type Way = 'left' | 'forward' | 'right';

/**
 * Where an exit of a diverter sits, as its screens see it: the cell it leaves
 * from, counted from the entry, and its way in the direction parcels travel.
 * `entry` is the diverter's in port, `out` the exit's out port.
 */
export function exitWay(entry: ResolvedPort | undefined, out: ResolvedPort): { cell: number; way: Way } {
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
