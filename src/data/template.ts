import type { Rotation, WarehouseId } from '@/core/types';

/**
 * The source of truth for reading the game's floor-plan template, a community spreadsheet with one
 * text code per grid cell and a price table on the right.
 *
 * Transcribed from the template's own legend, not guessed from the catalogue; `template.test.ts`
 * checks every line against the committed fixture. `src/core/` never imports this file: the
 * importer takes it as a parameter, like `DOORS` and `WAREHOUSES` (see `Door` in src/core/types.ts).
 */

/** The template version this file was transcribed from. See `checkTemplate`. */
export const TEMPLATE_VERSION = '2.0.0.0';

export interface TemplateCode {
  /** Catalogue id this code places. */
  objectId: string;
  /**
   * The turn the glyph states, or null when the template prints one glyph for this object.
   * Null means unknown, not rotation 0: the importer counts it for the `import.caution` warning.
   */
  rotation: Rotation | null;
  /**
   * The template's price-table row this code sits on, in the template's English. Records the
   * mapping's provenance and lets the test cross-check prices, which catches the rack trap below.
   */
  legend: string;
}

/**
 * Rotation from a four-glyph family. Rotation 0 flows up the screen (see src/data/ports.ts), so
 * the up-glyph is 0 and the rest follow clockwise: up, right, down, left.
 * For corners, rotation 0 is `cornerLeft` (in from below, out to the left), drawn ↖.
 */
const turned = (objectId: string, legend: string, glyphs: string): [string, TemplateCode][] => {
  const rotations: Rotation[] = [0, 90, 180, 270];
  return [...glyphs].map((glyph, i) => [glyph, { objectId, rotation: rotations[i]!, legend }]);
};

/** An object the template prints one glyph for: placeable, but not orientable. */
const flat = (code: string, objectId: string, legend: string): [string, TemplateCode] =>
  [code, { objectId, rotation: null, legend }];

export const TEMPLATE_CODES: ReadonlyMap<string, TemplateCode> = new Map([
  // Conveyors
  ...turned('BP_ConveyorBelt_Straight_Tier1', 'Straight', '↑→↓←'),
  ...turned('BP_ConveyorBelt_Corner_Tier1', 'Corner', '↖↗↘↙'),
  ...turned('BP_ConveyorBelt_Joiner', 'Joiner', '⇈⇉⇊⇇'),
  ...turned('BP_ConveyorBelt_Bridger', 'Bridge', '⇑⇒⇓⇐'),
  // Triple arrows, the only family spanning two Unicode blocks: ⤊/⤋ up/down, ⇛/⇚ right/left.
  // ⇚ is the Speedway.
  ...turned('BP_ConveyorBelt_Speedway', 'Speedway', '⤊⇛⤋⇚'),

  flat('⇶', 'BP_ConveyorBelt_Joiner_3Way', 'Multi Joiner'),
  flat('L', 'BP_ConveyorBelt_Loader', 'Loader'),
  flat('U', 'BP_ConveyorBelt_Unloader', 'Unloader'),
  flat('P', 'BP_ConveyorBelt_Pauser', 'Pauser'),
  flat('AP', 'BP_ConveyorBelt_AutoPauser', 'Auto Pauser'),
  flat('DT', 'BP_ConveyorBelt_Diverter', 'Diverter (Cargo Type)'),
  flat('DC', 'BP_ConveyorBelt_Splitter_2Way', 'Diverter (Contents)'),
  flat('CD', 'BP_ConveyorBelt_CountryDiverter2', 'Diverter (Country)'),
  flat('↔', 'BP_ConveyorBelt_Splitter', 'Smart Splitter'),
  flat('Y', 'BP_ConveyorBelt_Launcher', 'Yeeter (Launcher)'),
  flat('SA', 'BP_ConveyorBelt_StickerApplier_Approve', 'Sticker (Approve)'),
  flat('SD', 'BP_ConveyorBelt_StickerApplier_Deny', 'Sticker (Deny)'),
  flat('VE', 'BP_ConveyorBelt_Elevator', 'Vertical Elevator'),

  // Racks: the codes follow the displayed name, which is one size below the id
  // (`BP_StorageRack_Medium` is "Storage Rack (Small)"). So RM, the 900-credit "Medium", is
  // `BP_StorageRack_Large`.
  flat('RS', 'BP_StorageRack_Medium', 'Small'),
  flat('RM', 'BP_StorageRack_Large', 'Medium'),
  flat('RL', 'BP_StorageRack_ExtraLarge', 'Large'),

  // Scanners. The template explains two in the cell beside them: "T for Type", "B for Barcode".
  flat('S', 'BP_ConveyorBelt_Scanner2_Tier1', 'Sticker'),
  flat('C', 'BP_ConveyorBelt_CriteriaScanner_Country', 'Country'),
  flat('T', 'BP_ConveyorBelt_CriteriaScanner_CargoType', 'Cargo Type'),
  flat('W', 'BP_ConveyorBelt_CriteriaScanner_Weight', 'Weight'),
  flat('B', 'BP_ConveyorBelt_CriteriaScanner_SerialNumber', 'Serial Number'),
  flat('SP', 'BP_ConveyorBelt_CriteriaScanner_Stamp', 'Stamp'),
  flat('CT', 'BP_ConveyorBelt_CriteriaScanner_ContentsProhibited', 'Contents'),
]);

/**
 * Words the template writes inside the grid (the staircases and the "Outside" notch of the first
 * warehouse). Fixed structure, not placements, listed so the importer does not report them as unknown.
 */
export const TEMPLATE_LABELS: ReadonlySet<string> = new Set(['Stairs', 'Outside']);

/**
 * Cells the blank template already fills inside the buildable area, keyed `sheet:x,y`: signage,
 * never placements.
 *
 * Cell S7 of the first sheet holds `RS`, a valid rack code, but it labels a door bay on the south
 * wall. The price table's "Qty 1" is a COUNTIF over the grid, so it is no evidence of a rack.
 * Listed by cell, so a real rack elsewhere with the same code is still imported.
 */
export const TEMPLATE_SIGNAGE: ReadonlySet<string> = new Set(['First Warehouse:12,0']);

/** Key for `TEMPLATE_SIGNAGE`. Sheet name, then the app's own cell. */
export const signageKey = (sheet: string, x: number, y: number): string => `${sheet}:${x},${y}`;

export interface TemplateSheet {
  /** The tab's name, exactly as the template writes it. */
  name: string;
  warehouse: WarehouseId;
  floor: number;
}

/**
 * What each tab of the template draws, in tab order.
 *
 * Cell G7 is x=0, y=0 on all three, so `x = column - 7` and `y = row - 7` (1-based, as in Excel).
 * Sheet rows increase with `y`; they are not inverted.
 *
 * The buildable area is smaller than the grid panel: the price table's COUNTIFs cover exactly the
 * blocks in `src/data/warehouses.ts` (`$G$7:$BD$26` plus `$AA$27:$BD$46` on the first sheet,
 * `$G$7:$BX$66` ground floor, `$G$7:$BX$36` mezzanine). The importer clips to `isBuildable`, so the
 * door legend printed in the L's notch is never imported as a conveyor.
 */
export const TEMPLATE_SHEETS: readonly TemplateSheet[] = [
  { name: 'First Warehouse', warehouse: 'main', floor: 0 },
  { name: 'Regional Warehouse Ground', warehouse: 'second', floor: 0 },
  { name: 'Regional Warehouse Mezzanine', warehouse: 'second', floor: 1 },
];

/**
 * The fills the template marks its doors with, as `ARGB` exactly as Excel writes them.
 *
 * Doors are marked by colour only: a 3x3 ring with a hollow centre, outside the wall. Their 33 fixed
 * positions detect a sheet shifted by an inserted row or column (see `checkTemplate` in
 * src/core/import-plan.ts).
 */
export const DOOR_FILLS = {
  /** A reject bin: an export door that accepts anything. */
  reject: 'FFC00000',
  /** Where parcels arrive. */
  delivery: 'FFFFC000',
  /** An export door that sorts, by cargo type or by country. */
  export: 'FF00B050',
} as const;
