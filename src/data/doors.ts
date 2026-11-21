import type { Door } from '@/core/types';

/**
 * The source of truth for the game's fixed doors, read from the level data
 * (docs/game-data/extraction.md) and hand-converted once into cell/side coordinates
 * (x+ = east, y+ = south; `side` uses the inverted compass labels, see the warning at the top of
 * `src/data/ports.ts`). Do not recompute them from raw world coordinates.
 *
 * All fixed doors: 11 delivery, 10 cargo-side (6 by cargo type, 4 reject bins), 12 country exports.
 * Country exports carry no country: the game deals them at random, so the player sets them in
 * `Plan.doorCountries` (see COUNTRY_DOORS in src/data/countries.ts).
 * Every cell is buildable per `src/data/warehouses.ts`, asserted in doors.test.ts.
 */
export const DOORS: readonly Door[] = [
  // Delivery doors: fixed `out` ports where parcels enter the network.

  // main, floor 0: 5 doors on the L's two max-Y (south) walls.
  { id: 'main-delivery-0', warehouse: 'main', floor: 0, cell: { x: 2, y: 19 }, side: 'N', kind: 'delivery' },
  { id: 'main-delivery-1', warehouse: 'main', floor: 0, cell: { x: 17, y: 19 }, side: 'N', kind: 'delivery' },
  { id: 'main-delivery-2', warehouse: 'main', floor: 0, cell: { x: 27, y: 39 }, side: 'N', kind: 'delivery' },
  { id: 'main-delivery-3', warehouse: 'main', floor: 0, cell: { x: 37, y: 39 }, side: 'N', kind: 'delivery' },
  // The one door the game flags `IsUnlocked: true`, available from the start.
  { id: 'main-delivery-4', warehouse: 'main', floor: 0, cell: { x: 47, y: 39 }, side: 'N', kind: 'delivery' },

  // second, floor 0: 6 express-delivery doors, on the max-Y wall after the 180-degree rotation
  // (see warehouses.ts). Their x values match the community spreadsheet.
  { id: 'second-delivery-0', warehouse: 'second', floor: 0, cell: { x: 52, y: 59 }, side: 'N', kind: 'delivery' },
  { id: 'second-delivery-1', warehouse: 'second', floor: 0, cell: { x: 42, y: 59 }, side: 'N', kind: 'delivery' },
  { id: 'second-delivery-2', warehouse: 'second', floor: 0, cell: { x: 62, y: 59 }, side: 'N', kind: 'delivery' },
  { id: 'second-delivery-3', warehouse: 'second', floor: 0, cell: { x: 32, y: 59 }, side: 'N', kind: 'delivery' },
  { id: 'second-delivery-4', warehouse: 'second', floor: 0, cell: { x: 22, y: 59 }, side: 'N', kind: 'delivery' },
  { id: 'second-delivery-5', warehouse: 'second', floor: 0, cell: { x: 12, y: 59 }, side: 'N', kind: 'delivery' },

  // Cargo-type export doors: fixed `in` ports a chain can end at, all on main, floor 0.

  // Reject bin on the min-Y (north/top) wall: IsApproving false, accepts anything.
  { id: 'main-export-reject-0', warehouse: 'main', floor: 0, cell: { x: 2, y: 0 }, side: 'S', kind: 'export' },
  { id: 'main-export-air-0', warehouse: 'main', floor: 0, cell: { x: 17, y: 0 }, side: 'S', kind: 'export', cargoTypes: ['Air'] },
  { id: 'main-export-maritime-0', warehouse: 'main', floor: 0, cell: { x: 27, y: 0 }, side: 'S', kind: 'export', cargoTypes: ['Maritime'] },
  // Second reject bin, same wall.
  { id: 'main-export-reject-1', warehouse: 'main', floor: 0, cell: { x: 47, y: 0 }, side: 'S', kind: 'export' },
  // Min-X (west) wall: multi-cargo (Road, Rail).
  { id: 'main-export-road-rail-0', warehouse: 'main', floor: 0, cell: { x: 0, y: 17 }, side: 'W', kind: 'export', cargoTypes: ['Road', 'Rail'] },
  // Max-X (east) wall: three doors, one multi-cargo.
  { id: 'main-export-road-0', warehouse: 'main', floor: 0, cell: { x: 49, y: 7 }, side: 'E', kind: 'export', cargoTypes: ['Road'] },
  { id: 'main-export-rail-0', warehouse: 'main', floor: 0, cell: { x: 49, y: 17 }, side: 'E', kind: 'export', cargoTypes: ['Rail'] },
  { id: 'main-export-air-maritime-0', warehouse: 'main', floor: 0, cell: { x: 49, y: 27 }, side: 'E', kind: 'export', cargoTypes: ['Air', 'Maritime'] },

  // Country export doors on the second warehouse: fixed `in` ports, sorted by a country the
  // game data does not name. All 14 exits sit on the y=0 wall (raw world y = +3000, before the
  // 180-degree rotation) with `side` 'S', which faces -y (see src/data/ports.ts). Their x values
  // are symmetric about the mid-line, so the rotation leaves them unchanged.
  //
  // x = 7 and x = 62 have a door on both levels (actors at z=0 and z=500). On the mezzanine those
  // two are reject bins: the spreadsheet flags only the middle six. All six ground doors are flagged.

  // floor 0 (ground): 6 country exits.
  { id: 'second-country-0-a', warehouse: 'second', floor: 0, cell: { x: 7, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-0-b', warehouse: 'second', floor: 0, cell: { x: 12, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-0-c', warehouse: 'second', floor: 0, cell: { x: 17, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-0-d', warehouse: 'second', floor: 0, cell: { x: 52, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-0-e', warehouse: 'second', floor: 0, cell: { x: 57, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-0-f', warehouse: 'second', floor: 0, cell: { x: 62, y: 0 }, side: 'S', kind: 'country-export' },

  // floor 1 (mezzanine): 6 country exits, plus a reject bin at each end.
  { id: 'second-export-reject-0', warehouse: 'second', floor: 1, cell: { x: 7, y: 0 }, side: 'S', kind: 'export' },
  { id: 'second-country-1-b', warehouse: 'second', floor: 1, cell: { x: 22, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-1-c', warehouse: 'second', floor: 1, cell: { x: 27, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-1-d', warehouse: 'second', floor: 1, cell: { x: 32, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-1-e', warehouse: 'second', floor: 1, cell: { x: 37, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-1-f', warehouse: 'second', floor: 1, cell: { x: 42, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-country-1-g', warehouse: 'second', floor: 1, cell: { x: 47, y: 0 }, side: 'S', kind: 'country-export' },
  { id: 'second-export-reject-1', warehouse: 'second', floor: 1, cell: { x: 62, y: 0 }, side: 'S', kind: 'export' },
];
