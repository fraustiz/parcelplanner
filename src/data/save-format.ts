import type { SaveGrid, SaveTables } from '@/core/import-save';
import { getCatalogue } from './catalogue';
import { repaintableColourOf } from './colours';
import { isCountry } from './countries';
import { WAREHOUSES } from './warehouses';
import type { CargoChoice } from '@/core/types';

/**
 * How the game's save files place objects, for `planFromSave`.
 *
 * Measured on real saves (2026-11-21): 911 objects of one warehouse and 3215
 * over both, where 93 to 97 % of the outputs land on an input facing them.
 * See the ParcelPlanner note of the vault for the method.
 */

/**
 * The three `BP_GridManager`s by their `E_GridManagerID`, and where cell (0,0)
 * of each sits in world units (100 to a cell, values at cell centres).
 *
 * The second warehouse is stored turned 180 degrees from the world (see
 * `second` in src/data/warehouses.ts). Confirmed here too: with the turn,
 * every one of its 20 doors has a belt on its cell; without, half of them.
 */
export const SAVE_GRIDS: Readonly<Record<string, SaveGrid>> = {
  'E_GridManagerID::NewEnumerator0': {
    warehouse: 'main', floor: 0, origin: { x: 7060, y: -3450 }, size: { w: 50, h: 40 }, turned: false,
  },
  'E_GridManagerID::NewEnumerator1': {
    warehouse: 'second', floor: 0, origin: { x: -3950, y: -2950 }, size: { w: 70, h: 60 }, turned: true,
  },
  'E_GridManagerID::NewEnumerator3': {
    warehouse: 'second', floor: 1, origin: { x: -3950, y: -2950 }, size: { w: 70, h: 60 }, turned: true,
  },
};

/**
 * Degrees added to an object's in-game yaw to get its rotation here: the
 * game's models and this app's artwork do not face the same way at 0.
 * Everything not listed is `SAVE_DEFAULT_TURN`.
 *
 * Measured: sticker appliers (17), content inspection diverter (11), the
 * large rack (305, set by its footprint: it has no output). The unloader takes
 * the default: turned 0 it also lines up, but pushes into its rack instead of
 * pulling out of it, and its belt then leads nowhere (country diverters feed
 * racks whose unloaders reach no door).
 * The medium and large racks are assumed to match it. The 3-way and T joiners
 * and the launcher were not in any save and take the default.
 */
export const SAVE_TURNS: Readonly<Record<string, number>> = {
  BP_ConveyorBelt_StickerApplier_Approve: 0,
  BP_ConveyorBelt_StickerApplier_Deny: 0,
  BP_ConveyorBelt_Splitter_2Way: 0,
  BP_StorageRack_Medium: 90,
  BP_StorageRack_Large: 90,
  BP_StorageRack_ExtraLarge: 90,
};

export const SAVE_DEFAULT_TURN = 180;

/**
 * The expansions a save lists as bought (`UnlockedTileObjectNames`), by the
 * name of their actor in the level, to their number in src/data/warehouse-tiers.ts.
 *
 * Read from the level (`ParcelSimulator.umap`, 5.7.4): each `BP_WarehouseTier`
 * sits at the middle of one edge of its 10x10 tile, turned by its yaw, and the
 * 14 of them land on the 14 tiles of `WAREHOUSE_TIERS` one to one. The three
 * `BP_WarehouseTier_Large` sit on the second warehouse's strip boundaries
 * (x = 20, 35, 55 here) and unlock after 500, 1000 and 2500 express
 * submissions, so tiers 16 to 18 in that order. `wh2` is the building itself.
 * Every save seen owned all 14 main tiers: the tile of each is not yet
 * confirmed by a save that owns only some.
 */
export const SAVE_TIERS: Readonly<Record<string, number>> = {
  BP_WarehouseTier_C_9: 1, // tile 10,0
  BP_WarehouseTier_C_10: 2, // tile 10,10
  BP_WarehouseTier_C_5: 3, // tile 20,10
  BP_WarehouseTier_C_0: 4, // tile 20,0
  BP_WarehouseTier_C_16: 5, // tile 20,20
  BP_WarehouseTier_C_17: 6, // tile 20,30
  BP_WarehouseTier_C_25: 7, // tile 30,0
  BP_WarehouseTier_C_15: 8, // tile 30,10
  BP_WarehouseTier_C_18: 9, // tile 30,20
  BP_WarehouseTier_C_19: 10, // tile 30,30
  BP_WarehouseTier_C_23: 11, // tile 40,0
  BP_WarehouseTier_C_22: 12, // tile 40,10
  BP_WarehouseTier_C_21: 13, // tile 40,20
  BP_WarehouseTier_C_20: 14, // tile 40,30
  wh2: 15,
  BP_WarehouseTier_Large_C_1: 16,
  BP_WarehouseTier_Large_C_0: 17,
  BP_WarehouseTier_Large_C_2: 18,
};

/**
 * Country export doors by the `UniqueDoorID` a save keys their country with
 * (`CountryExportDoorIdToSelectedCountry`), to the door ids of
 * src/data/doors.ts. Read from the level: each `BP_CountryExportDoor` actor's
 * id, floor (z = 0 or 500) and column match one door here. The two mezzanine
 * actors at x = 7 and 62 are the reject bins and take no country.
 */
export const SAVE_COUNTRY_DOORS: Readonly<Record<number, string>> = {
  278394: 'second-country-0-a',
  34587629: 'second-country-0-b',
  14237869: 'second-country-0-c',
  18729365: 'second-country-0-d',
  643852: 'second-country-0-e',
  923478234: 'second-country-0-f',
  41328657: 'second-country-1-b',
  132675: 'second-country-1-c',
  1276358: 'second-country-1-d',
  2147483647: 'second-country-1-e',
  981723: 'second-country-1-f',
  187236: 'second-country-1-g',
};

/**
 * A cargo diverter screen's `E_CargoType` to its setting here. From the enum's
 * display names: Air, Land, Sea, Invalid, Rail, All, None, Other. "All" is the
 * screens' default and means any type, the absence of a setting here;
 * "Invalid" is not offered to the player and is read as any too.
 */
export const SAVE_CARGO: Readonly<Record<string, CargoChoice>> = {
  'E_CargoType::NewEnumerator0': 'Air',
  'E_CargoType::NewEnumerator1': 'Road',
  'E_CargoType::NewEnumerator2': 'Maritime',
  'E_CargoType::NewEnumerator4': 'Rail',
  'E_CargoType::NewEnumerator6': 'None',
  'E_CargoType::NewEnumerator7': 'Other',
};

/**
 * The game paints a conveyor by shifting the hue of its blue
 * (`ConveyorGuidToHueShiftColour`). Each spray paint's `HueShiftAmount`, its
 * shown colour, and the nearest of OBJECT_COLOURS by hue. The game has 11
 * paints and the planner 8 colours, so some share one. `null` keeps the
 * artwork's own blue.
 */
export const SAVE_PAINTS: readonly { amount: number; game: string; colour: string | null }[] = [
  { amount: 0.01, game: '#000000', colour: '#121110' }, // black
  { amount: 0.169926, game: '#860A85', colour: '#bf0083' }, // purple
  { amount: 0.31, game: '#AE3161', colour: '#bf0083' }, // pink
  { amount: 0.36, game: '#BF2A00', colour: '#ae302e' }, // red
  { amount: 0.423, game: '#BF6000', colour: '#cb551b' }, // orange
  { amount: 0.469, game: '#B28D00', colour: '#cbc11b' }, // yellow
  { amount: 0.55, game: '#98B500', colour: '#cbc11b' }, // olive
  { amount: 0.653, game: '#6FB50A', colour: '#75bb59' }, // green
  { amount: 0.89, game: '#387EBB', colour: null }, // pale blue
  { amount: 0.99, game: '#FFC634', colour: '#cbc11b' }, // gold
  { amount: 1, game: '#002ABB', colour: null }, // blue, the default
];

/** A rack's colour, from the suffix of its class (`BP_StorageRack_Large_Pink`). Red is the artwork's own. */
export const SAVE_RACK_COLOURS: Readonly<Record<string, string | null>> = {
  Black: '#121110',
  Blue: '#044abe',
  Green: '#75bb59',
  Orange: '#cb551b',
  Pink: '#bf0083',
  Red: null,
  White: '#d0d0d1',
  Yellow: '#cbc11b',
};

/** Every table `planFromSave` needs, from this app's data. */
export function saveTables(): SaveTables {
  return {
    catalogue: getCatalogue(),
    geometry: WAREHOUSES,
    grids: SAVE_GRIDS,
    turns: SAVE_TURNS,
    defaultTurn: SAVE_DEFAULT_TURN,
    tiers: SAVE_TIERS,
    countryDoors: SAVE_COUNTRY_DOORS,
    isCountry,
    cargo: SAVE_CARGO,
    paints: SAVE_PAINTS,
    rackColours: SAVE_RACK_COLOURS,
    canPaint: (entry) => repaintableColourOf(entry) !== null,
  };
}
