import type { SaveGrid } from '@/core/import-save';

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
 * Measured: unloader (499 placed), sticker appliers (17), content inspection
 * diverter (11), the large rack (305, set by its footprint: it has no output).
 * The medium and large racks are assumed to match it. The 3-way and T joiners
 * and the launcher were not in any save and take the default.
 */
export const SAVE_TURNS: Readonly<Record<string, number>> = {
  BP_ConveyorBelt_Unloader: 0,
  BP_ConveyorBelt_StickerApplier_Approve: 0,
  BP_ConveyorBelt_StickerApplier_Deny: 0,
  BP_ConveyorBelt_Splitter_2Way: 0,
  BP_StorageRack_Medium: 90,
  BP_StorageRack_Large: 90,
  BP_StorageRack_ExtraLarge: 90,
};

export const SAVE_DEFAULT_TURN = 180;
