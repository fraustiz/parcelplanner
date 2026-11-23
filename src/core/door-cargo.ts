import type { CargoType } from './parcel-labels';
import type { Door, Plan } from './types';

/**
 * The export doors sorted by cargo type take, in the game's level data, a fixed set of
 * types (`Door.cargoTypes`). Mods can change them, so the player may say otherwise for a
 * door (`Plan.doorCargo`); the game's set stays the default. Reject bins, export doors with
 * no type, are never changed.
 */

/** Every cargo type, in the order offered. A link stores a set as bits in this order, so append only. */
export const CARGO_TYPES: readonly CargoType[] = ['Road', 'Rail', 'Air', 'Maritime'];

export const isCargoType = (value: unknown): value is CargoType =>
  typeof value === 'string' && (CARGO_TYPES as readonly string[]).includes(value);

/** Whether `door` is an export door sorted by cargo type, so one whose types can be set. */
export const isCargoDoor = (door: Door): boolean =>
  door.kind === 'export' && (door.cargoTypes?.length ?? 0) > 0;

/** The types `door` takes in `plan`: the player's set if there is one, else the game's. */
export function cargoOf(door: Door, plan: Pick<Plan, 'doorCargo'>): readonly string[] {
  return (isCargoDoor(door) ? plan.doorCargo?.[door.id] : undefined) ?? door.cargoTypes ?? [];
}

/**
 * `doors` as `plan` has them: each cargo door with the types the player set. The same
 * array when nothing is set, so callers can keep memoised work.
 */
export function doorsOf(doors: readonly Door[], plan: Pick<Plan, 'doorCargo'>): readonly Door[] {
  const set = plan.doorCargo;
  if (set === undefined || Object.keys(set).length === 0) return doors;
  return doors.map((door) => {
    const types = isCargoDoor(door) ? set[door.id] : undefined;
    return types === undefined ? door : { ...door, cargoTypes: types };
  });
}

/** `types` in the order of CARGO_TYPES, without repeats or unknown values. */
export const orderedCargo = (types: readonly unknown[]): CargoType[] =>
  CARGO_TYPES.filter((type) => types.includes(type));

/** Whether two type sets hold the same types, whatever their order. */
export const sameCargo = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((type) => b.includes(type));

/**
 * The door settings worth keeping from a file or a link: a known cargo door to a non-empty
 * set of known types that differs from the game's. Anything else is dropped, and the field
 * goes away when nothing is left.
 */
export function cleanDoorCargo(
  value: unknown,
  doors: readonly Door[],
): Record<string, CargoType[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const kept: [string, CargoType[]][] = [];
  for (const [id, types] of Object.entries(value)) {
    const door = doors.find((d) => d.id === id);
    if (!door || !isCargoDoor(door) || !Array.isArray(types)) continue;
    const ordered = orderedCargo(types);
    if (ordered.length === 0 || sameCargo(ordered, door.cargoTypes ?? [])) continue;
    kept.push([id, ordered]);
  }
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}
