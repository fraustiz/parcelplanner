/**
 * Turning the game's official floor-plan spreadsheet into a Plan.
 *
 * Pure and free of data imports like the rest of src/core: every table arrives
 * as a parameter (real values in src/data/template.ts, catalogue.ts,
 * warehouses.ts and doors.ts).
 *
 * `checkTemplate` decides whether the workbook can be read at all: a refused
 * import beats one shifted by a cell, which looks normal. `planFromWorkbook`
 * reads it and reports everything it could not.
 *
 * A cell holds one code: the object, and for five families its direction.
 * Other rotations, tiers, colours and owned tiers come back as defaults;
 * `ImportReport.rotationUnknown` counts them, and the UI must show
 * `import.caution`.
 */

import { centredAnchor, isBuildable, rotatedFootprint, type WarehouseGeometry } from './grid';
import type { CatalogEntry, Cell, Door, Plan, Placement, Rotation, WarehouseId } from './types';
import { cellKey, type Workbook } from './xlsx';

/**
 * The template's grid origin: cell G7 is x=0, y=0 in Excel's 1-based columns
 * and rows, on all three sheets. Checked against the 33 fixed doors and the
 * template's own `COUNTIF` ranges (`$G$7:$BD$26` plus `$AA$27:$BD$46`).
 * Not inverted: sheet rows grow with `y`.
 */
const ORIGIN = 7;

const cellOf = (col: number, row: number): Cell => ({ x: col - ORIGIN, y: row - ORIGIN });

/**
 * What one code in a cell means. The real table is `TemplateCode` in
 * src/data/template.ts.
 */
export interface ImportCode {
  objectId: string;
  /** The turn the glyph states, or null when the template has a single glyph
   * for this object. */
  rotation: Rotation | null;
}

/** Which warehouse and floor a named tab of the workbook draws. */
export interface ImportSheet {
  name: string;
  warehouse: WarehouseId;
  floor: number;
}

export interface ImportTables {
  codes: ReadonlyMap<string, ImportCode>;
  /** Words the template writes on the grid itself, reported as ignored rather
   * than as unknown codes. */
  labels: ReadonlySet<string>;
  /**
   * Cells the pristine template writes inside the buildable area, keyed
   * `sheet:x,y` (see TEMPLATE_SIGNAGE). Matched by cell, not value: the door
   * bay label `RS` is also the small storage rack's code.
   */
  signage: ReadonlySet<string>;
  sheets: readonly ImportSheet[];
  catalogue: ReadonlyMap<string, CatalogEntry>;
  geometry: WarehouseGeometry;
}

/** A cell the importer had something to say about. */
export interface ImportNote {
  sheet: string;
  cell: Cell;
  value: string;
}

export interface ImportReport {
  /** Placements that made it into the plan. */
  placed: number;
  /** How those split between the buildings, in `tables.sheets` order, skipping
   * empty ones, so a sheet landing empty is visible. */
  byWarehouse: { warehouse: WarehouseId; placed: number }[];
  /** Codes that are not in the table. */
  unknown: ImportNote[];
  /** Understood codes that fit nowhere, such as an object longer than the
   * space left at the building's edge. */
  dropped: ImportNote[];
  /** Cells deliberately not read (numbers, emoji, template labels). Counted,
   * not listed. */
  ignored: number;
  /** Placements whose rotation the sheet did not state, set to a default. This
   * is the figure `import.caution` is about. */
  rotationUnknown: number;
}

export interface ImportResult {
  /**
   * One plan holding every sheet: placements carry their own `warehouse`, and
   * `Plan.warehouse` opens on whichever building has something on it.
   */
  plan: Plan;
  report: ImportReport;
}

/**
 * True for a cell that is decoration rather than a placement: price-table
 * numbers and the emoji cargo legend, both of which can sit inside the grid.
 *
 * Only ask this of a value that is not a known code: six template arrows
 * (↔ ↕ ↖ ↗ ↘ ↙) are Extended_Pictographic and would be thrown away, silently
 * dropping every corner and smart splitter.
 */
function isDecoration(value: string, labels: ReadonlySet<string>): boolean {
  if (labels.has(value)) return true;
  if (/^-?\d+([.,]\d+)?$/.test(value)) return true;
  return /\p{Extended_Pictographic}/u.test(value);
}

/**
 * Where an object goes, given the cell its code was typed in.
 *
 * The code sits at the object's middle, as with `centredAnchor`. When the
 * sheet states no rotation and the object is longer than one cell, upright is
 * tried before lying down; either way it counts in `rotationUnknown`.
 */
function fit(
  centre: Cell,
  entry: CatalogEntry,
  stated: Rotation | null,
  warehouse: WarehouseId,
  floor: number,
  geometry: WarehouseGeometry,
): { cell: Cell; rotation: Rotation } | null {
  const candidates: Rotation[] = stated !== null ? [stated] : [0, 90];
  for (const rotation of candidates) {
    const cell = centredAnchor(centre, entry.footprint, rotation);
    const { w, h } = rotatedFootprint(entry.footprint, rotation);
    let fits = true;
    for (let dy = 0; dy < h && fits; dy++) {
      for (let dx = 0; dx < w && fits; dx++) {
        fits = isBuildable(warehouse, floor, { x: cell.x + dx, y: cell.y + dy }, geometry);
      }
    }
    if (fits) return { cell, rotation };
  }
  return null;
}

export function planFromWorkbook(
  book: Workbook,
  tables: ImportTables,
  gameVersion = '',
): ImportResult {
  const report: ImportReport = {
    placed: 0, byWarehouse: [], unknown: [], dropped: [], ignored: 0, rotationUnknown: 0,
  };
  const byWarehouse = new Map<WarehouseId, Placement[]>();

  for (const spec of tables.sheets) {
    const sheet = book.sheets.find((s) => s.name === spec.name);
    if (sheet === undefined) continue;

    for (const [key, value] of sheet.cells) {
      const [col, row] = key.split(',').map(Number);
      const cell = cellOf(col!, row!);

      // Position first, so nothing outside the building is reported: price
      // tables and door legends there look like codes.
      if (!isBuildable(spec.warehouse, spec.floor, cell, tables.geometry)) continue;

      // Template signage can be spelled like a code (`RS` in S7 is a bay
      // label), so it is checked before the code table.
      if (tables.signage.has(`${spec.name}:${cell.x},${cell.y}`)) {
        report.ignored++;
        continue;
      }

      // A known code wins over every other reading (see `isDecoration`).
      const code = tables.codes.get(value);
      const entry = code && tables.catalogue.get(code.objectId);
      if (!code || !entry) {
        if (isDecoration(value, tables.labels)) report.ignored++;
        else report.unknown.push({ sheet: spec.name, cell, value });
        continue;
      }

      const placed = fit(cell, entry, code.rotation, spec.warehouse, spec.floor, tables.geometry);
      if (placed === null) {
        report.dropped.push({ sheet: spec.name, cell, value });
        continue;
      }

      if (code.rotation === null) report.rotationUnknown++;
      report.placed++;
      const list = byWarehouse.get(spec.warehouse) ?? [];
      list.push({
        id: crypto.randomUUID(),
        objectId: code.objectId,
        warehouse: spec.warehouse,
        floor: spec.floor,
        cell: placed.cell,
        rotation: placed.rotation,
        // A spreadsheet states neither tier nor colour: tier 1, the object's own colour.
        tier: 1,
      });
      byWarehouse.set(spec.warehouse, list);
    }
  }

  // In `tables.sheets` order, deduplicated: two sheets are the same building.
  const order: WarehouseId[] = [];
  for (const spec of tables.sheets) {
    if (!order.includes(spec.warehouse)) order.push(spec.warehouse);
  }
  for (const warehouse of order) {
    const placed = byWarehouse.get(warehouse)?.length ?? 0;
    if (placed > 0) report.byWarehouse.push({ warehouse, placed });
  }

  // Open on a building that has something on it, else the first sheet's.
  const warehouse = report.byWarehouse[0]?.warehouse ?? order[0] ?? 'main';
  const placements = order.flatMap((id) => byWarehouse.get(id) ?? []);
  // `ownedTiers` is absent, meaning all owned (see Plan): a spreadsheet does
  // not say what was bought.
  return { plan: { gameVersion, warehouse, placements }, report };
}

export type TemplateProblem =
  | { kind: 'missing-sheet'; sheet: string }
  | { kind: 'wrong-version'; found: string | null }
  | { kind: 'doors-moved'; sheet: string; matched: number; expected: number };

export interface TemplateExpectation {
  version: string;
  sheets: readonly ImportSheet[];
  doors: readonly Door[];
  /** The colours the template paints each kind of door. */
  fills: { reject: string; delivery: string; export: string };
}

/**
 * Which way a door's `side` faces, in cells, with the app's inverted compass
 * labels (`N` faces increasing y, see src/data/ports.ts). It points out of the
 * building.
 */
const OUTWARD = {
  N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 },
} as const;

/**
 * The template paints a door as a 3x3 block just outside the wall, centred two
 * cells out, leaving the cell next to the door blank for an arrow: these eight
 * cells. Centring the block on the door itself is wrong for doors facing a wall.
 */
function doorBlock(door: Door): Cell[] {
  const out = OUTWARD[door.side];
  const centre = { x: door.cell.x + 2 * out.x, y: door.cell.y + 2 * out.y };
  const skip = { x: door.cell.x + out.x, y: door.cell.y + out.y };
  const cells: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cell = { x: centre.x + dx, y: centre.y + dy };
      if (cell.x !== skip.x || cell.y !== skip.y) cells.push(cell);
    }
  }
  return cells;
}

/** Which of the three colours the template paints this door. */
function fillFor(door: Door, fills: TemplateExpectation['fills']): string {
  if (door.kind === 'delivery') return fills.delivery;
  // An export door with no cargo types is a reject bin; a country export
  // sorts, so it is painted like the sorting exports.
  if (door.kind === 'export' && (door.cargoTypes?.length ?? 0) === 0) return fills.reject;
  return fills.export;
}

/**
 * The share of a sheet's doors that must be where the game puts them. Not
 * 100%, since a community template may have a repainted block; a shifted grid
 * misses every door at once.
 */
const DOORS_REQUIRED = 0.9;

/**
 * Whether this workbook is the template this app knows how to read.
 *
 * Doors are the only landmark the player did not place, so they are what
 * proves the grid has not moved. An empty result means the sheet can be read,
 * not that the plan is right (see `import.caution`).
 */
export function checkTemplate(
  book: Workbook,
  expected: TemplateExpectation,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];

  for (const spec of expected.sheets) {
    if (!book.sheets.some((s) => s.name === spec.name)) {
      problems.push({ kind: 'missing-sheet', sheet: spec.name });
    }
  }

  // Found by the label beside it: its column differs between sheets.
  let found: string | null = null;
  for (const sheet of book.sheets) {
    for (const [key, value] of sheet.cells) {
      if (value !== 'Template Version') continue;
      const [col, row] = key.split(',').map(Number);
      for (let step = 1; step <= 12 && found === null; step++) {
        found = sheet.cells.get(cellKey(col! + step, row!)) ?? null;
      }
    }
    if (found !== null) break;
  }
  if (found !== expected.version) problems.push({ kind: 'wrong-version', found });

  for (const spec of expected.sheets) {
    const sheet = book.sheets.find((s) => s.name === spec.name);
    if (sheet === undefined) continue;
    const doors = expected.doors.filter(
      (d) => d.warehouse === spec.warehouse && d.floor === spec.floor);
    if (doors.length === 0) continue;

    const matched = doors.filter((door) => {
      const wanted = fillFor(door, expected.fills);
      // The game's own export keeps door fills but drops most other styling,
      // and players may colour cells, so only the door blocks are checked.
      return doorBlock(door).every(
        (cell) => sheet.fills.get(cellKey(cell.x + ORIGIN, cell.y + ORIGIN)) === wanted);
    }).length;

    if (matched < doors.length * DOORS_REQUIRED) {
      problems.push({ kind: 'doors-moved', sheet: spec.name, matched, expected: doors.length });
    }
  }

  return problems;
}
