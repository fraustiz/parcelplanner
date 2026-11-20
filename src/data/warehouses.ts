import type { WarehouseId } from '@/core/types';

/** A buildable rectangle in cell coordinates. A floor is one or more, since the game's floors are not rectangular. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The source of truth for warehouse geometry.
 *
 * The level has three `BP_GridManager` instances (`E_GridManagerID` in parens), each with its own
 * block sizes, not the class defaults:
 *
 *   BP_GridManager_C_1 (Primary):   FirstBlock 20x20, SecondBlock 40x30
 *   BP_GridManager_C_0 (Secondary): FirstBlock 60x70
 *   BP_GridManager_C_2 (Tertiary):  FirstBlock 30x70
 *
 * Warning: the Horizontal/Vertical field names are swapped relative to X/Y on every grid.
 * Door positions are the ground truth (see the note on `second`).
 *
 * 'main' (Primary) is L-shaped, one floor. 'second' is Secondary as the ground floor with Tertiary
 * as a mezzanine over part of it. The `WarehouseId` values are a save-format detail: renaming them
 * would need a migration of saved plans.
 */
export const WAREHOUSES: Readonly<Record<WarehouseId, readonly (readonly Block[])[]>> = {
  /**
   * 'main' (Primary): one floor, an L of a 20x20 left block and a 30 wide x 40 tall right block,
   * 50 x 40 overall. The notch is at the bottom-left with the left block top-aligned: the 5
   * delivery doors on the max-Y walls sit at y=39/19, which only fits this layout (docs/game-data/).
   */
  main: [
    [
      { x: 0, y: 0, w: 20, h: 20 }, // left block: 20 wide x 20 tall, top-aligned
      { x: 20, y: 0, w: 30, h: 40 }, // right block: 30 wide x 40 tall
    ],
  ],

  /**
   * 'second' (Secondary + Tertiary): a 70 wide x 60 tall ground floor and a 70 x 30 mezzanine.
   *
   * The field names (HorizontalSize 60/30, Vertical 70) are swapped: Horizontal is the Y extent.
   * Evidence: delivery doors sit at world y = -3010 (cell y = -0.1) and country doors at y = +3000
   * (cell y = 60), bounding a depth of 60; country doors reach x = 62.5; the community spreadsheet
   * draws 70 x 60 and a 70 x 30 mezzanine.
   *
   * Stored rotated 180 degrees from the raw conversion, (x,y) -> (69-x, 59-y), to match the game
   * and the spreadsheet: its express doors at x = 12,22,...,62 mirror the raw 7,17,...,57. Do not
   * move the doors back toward the raw conversion without rotating these blocks too.
   * The mezzanine covers y:[0,30) after the rotation (raw world: the far half).
   */
  second: [
    [{ x: 0, y: 0, w: 70, h: 60 }], // floor 0 (ground): full 70x60 footprint (symmetric under the rotation)
    [{ x: 0, y: 0, w: 70, h: 30 }], // floor 1 (upper): mezzanine, y:[0,30)
  ],

  /**
   * 'workshop': not a game building. An empty bench for laying out a module (a sorting loop, a
   * scanner bank) before copying it into a warehouse. One 60x60 floor, no doors, no stairs,
   * nothing to buy (see STARTING_BLOCKS).
   */
  workshop: [
    [{ x: 0, y: 0, w: 60, h: 60 }],
  ],
};
