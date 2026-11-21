import { SIDE_STEP } from '@/core/grid';
import type { Cell, Door, WarehouseId } from '@/core/types';
import { DOORS } from './doors';

/**
 * The twelve countries a parcel can be addressed to, from the game's `DT_Countries`
 * (data/raw/dt-countries.json) in table order. Invented names, so not translated.
 * The second warehouse has one export door per country (src/data/doors.ts).
 *
 * These ids are what a plan stores (`Plan.doorCountries`), whatever the player chose to
 * display. Share links carry a country as its index here: append only, never reorder.
 */
export const COUNTRIES: readonly string[] = [
  'Cristin',
  'Impland',
  'Jonathia',
  'Kongradi',
  'Ligbal',
  'Mahteen',
  'Molland',
  'Pruania',
  'Sowport',
  'Strentom',
  'Vocua',
  'Yatdanica',
];

export const isCountry = (value: unknown): value is string =>
  typeof value === 'string' && COUNTRIES.includes(value);

/**
 * The community mod that swaps the invented countries for real ones, by overriding the
 * string table `STBL_CN_ONLY_Countries` and the flag textures. Read from its archive
 * (see docs/game-data/extraction.md); the planner only shows these names, never stores them.
 */
export const REAL_COUNTRIES_MOD = { name: 'RealCountries', version: '3.1.0', author: 'Draityalan' } as const;

/**
 * The mod's name for each country, verbatim (its `CountryName_<id>` entries), so the
 * planner reads like the game screen. Not translated, like the invented names.
 */
export const REAL_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  Cristin: 'France',
  Impland: 'USA',
  Jonathia: 'China',
  Kongradi: 'Russia',
  Ligbal: 'Japan',
  Mahteen: 'Germany',
  Molland: 'UK',
  Pruania: 'Italy',
  Sowport: 'India',
  Strentom: 'Brazil',
  Vocua: 'Canada',
  Yatdanica: 'Australia',
};

/** What to show for a country id: the game's own name, or the mod's with `real`.
 * Anything that is not a country id (a cargo type, say) comes back unchanged. */
export function countryName(id: string, real: boolean): string {
  return real ? REAL_COUNTRY_NAMES[id] ?? id : id;
}

/**
 * The country's flag, 64 px wide, exported from the game's valid flag texture
 * (`<id>_Valid`) into public/flags/, or from the mod's into public/flags/real/.
 * Undefined for an id that is not a country.
 */
export function countryFlag(id: string, real: boolean): string | undefined {
  if (!isCountry(id)) return undefined;
  return real ? `/flags/real/${id}.png` : `/flags/${id}.png`;
}

/** Every flag by country id, for the renderer, which takes no src/data import. */
export function countryFlags(real: boolean): ReadonlyMap<string, string> {
  return new Map(COUNTRIES.map((id) => [id, countryFlag(id, real)!]));
}

/**
 * The second warehouse's country export doors, ground floor first, then left to right as
 * drawn (increasing x). The game deals them their countries at random, so the player says
 * which is which (`Plan.doorCountries`). A door's place here is its number in the UI.
 */
export const COUNTRY_DOORS: readonly Door[] = DOORS
  .filter((d) => d.kind === 'country-export')
  .sort((a, b) => a.floor - b.floor || a.cell.x - b.cell.x);

export const isCountryDoor = (id: unknown): id is string =>
  typeof id === 'string' && COUNTRY_DOORS.some((d) => d.id === id);

/**
 * The country door whose bay covers `cell`: the 3 x 3 cells drawn outside the wall in front
 * of it (DOOR_BAY_SPAN and DOOR_BAY_DEPTH in src/render/renderer.ts), so clicking the
 * door's flag opens its country. Country doors stand 5 cells apart, so bays never overlap.
 */
export function countryDoorAt(warehouse: WarehouseId, floor: number, cell: Cell): Door | undefined {
  return COUNTRY_DOORS.find((door) => {
    if (door.warehouse !== warehouse || door.floor !== floor) return false;
    const out = SIDE_STEP[door.side];
    const dx = cell.x - door.cell.x;
    const dy = cell.y - door.cell.y;
    const depth = dx * out.dx + dy * out.dy;
    const along = out.dx === 0 ? dx : dy;
    return depth >= 1 && depth <= 3 && Math.abs(along) <= 1;
  });
}

/**
 * The country door at `cell` for the right-click menu: its bay, as for a click, or the door's
 * own cell inside the wall, where the keyboard cursor can reach it.
 */
export function countryDoorNear(warehouse: WarehouseId, floor: number, cell: Cell): Door | undefined {
  return countryDoorAt(warehouse, floor, cell) ?? COUNTRY_DOORS.find((door) =>
    door.warehouse === warehouse && door.floor === floor && door.cell.x === cell.x && door.cell.y === cell.y);
}

/** A country door's number in the UI: its place among its floor's doors, from 1, left to right. */
export function countryDoorNumber(door: Door): number {
  return COUNTRY_DOORS.filter((d) => d.floor === door.floor).indexOf(door) + 1;
}
