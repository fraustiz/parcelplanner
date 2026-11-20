import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DOORS } from '@/data/doors';
import { getCatalogue } from '@/data/catalogue';
import { WAREHOUSES } from '@/data/warehouses';
import {
  DOOR_FILLS, TEMPLATE_CODES, TEMPLATE_LABELS, TEMPLATE_SHEETS, TEMPLATE_SIGNAGE,
  TEMPLATE_VERSION,
} from '@/data/template';
import { checkTemplate, planFromWorkbook } from './import-plan';
import { cellKey, readWorkbook, type Workbook } from './xlsx';

const TEMPLATE = 'assets/fixtures/floor-plan-template.xlsx';
/** A filled workbook kept out of the repo: point PARCELPLANNER_FILLED_XLSX at
 * one to run these. The assertions expect 30 objects across 27 codes on the
 * first sheet and one on each of the other two. */
const FILLED = process.env.PARCELPLANNER_FILLED_XLSX ?? '';

const load = async (path: string) => {
  const bytes = readFileSync(path);
  return readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

const TABLES = {
  codes: TEMPLATE_CODES,
  labels: TEMPLATE_LABELS,
  signage: TEMPLATE_SIGNAGE,
  sheets: TEMPLATE_SHEETS,
  catalogue: getCatalogue(),
  geometry: WAREHOUSES,
};

const EXPECTED = {
  version: TEMPLATE_VERSION,
  sheets: TEMPLATE_SHEETS,
  doors: DOORS,
  fills: DOOR_FILLS,
};

/** A workbook with no zip behind it, for the cell-classification rules. Sheet
 * names match the template's so the sheet mapping applies. */
function sheetOf(cells: Record<string, string>, name = 'First Warehouse'): Workbook {
  return {
    sheets: [{
      name,
      cells: new Map(Object.entries(cells)),
      fills: new Map(),
    }],
  };
}
/** `x,y` in app coordinates -> the `col,row` key the reader uses. */
const at = (x: number, y: number) => cellKey(x + 7, y + 7);

describe.skipIf(!(FILLED !== '' && existsSync(FILLED)))('a workbook a player filled in', () => {
  it('keeps both buildings in the one plan, and opens on the busy one', async () => {
    const { plan, report } = planFromWorkbook(await load(FILLED), TABLES);
    expect(plan.warehouse).toBe('main');
    expect(report.byWarehouse).toEqual([
      { warehouse: 'main', placed: 30 },
      { warehouse: 'second', placed: 2 },
    ]);
  });

  it('reads the 30 objects that were placed, and nothing else', async () => {
    // Exactly the workbook's own count: the `RS` bay label in S7 must not read
    // as a storage rack (see TEMPLATE_SIGNAGE).
    const { plan } = planFromWorkbook(await load(FILLED), TABLES);
    expect(plan.placements.filter((p) => p.warehouse === 'main')).toHaveLength(30);
  });

  it('reports nothing it could not read', async () => {
    const { report } = planFromWorkbook(await load(FILLED), TABLES);
    expect(report.unknown).toEqual([]);
    expect(report.dropped).toEqual([]);
  });

  it('puts each object on the cell its code was typed in', async () => {
    const { plan } = planFromWorkbook(await load(FILLED), TABLES);
    const found = new Map(plan.placements.map((p) => [`${p.cell.x},${p.cell.y}`, p]));

    // A corner at x=21, y=2, typed "↗": a quarter turn clockwise.
    expect(found.get('21,2')?.objectId).toBe('BP_ConveyorBelt_Corner_Tier1');
    expect(found.get('21,2')?.rotation).toBe(90);
    // A one-cell object with no rotation in its code.
    expect(found.get('35,4')?.objectId).toBe('BP_ConveyorBelt_Loader');
    // The seven scanners typed in a row along y=33.
    expect([22, 23, 24, 25, 26, 27, 28].map((x) => found.get(`${x},33`)?.objectId)).toEqual([
      'BP_ConveyorBelt_Scanner2_Tier1',
      'BP_ConveyorBelt_CriteriaScanner_Country',
      'BP_ConveyorBelt_CriteriaScanner_CargoType',
      'BP_ConveyorBelt_CriteriaScanner_Weight',
      'BP_ConveyorBelt_CriteriaScanner_SerialNumber',
      'BP_ConveyorBelt_CriteriaScanner_Stamp',
      'BP_ConveyorBelt_CriteriaScanner_ContentsProhibited',
    ]);
  });

  it('anchors a three-cell object by the middle cell its code sits in', async () => {
    // The template's pre-placed rack shows the convention: its code is in one
    // cell (x=12, y=0) and three cells (x=11..13) are painted around it, the
    // same rule as `centredAnchor`. The "⇚" at x=28, y=10 is a Speedway turned
    // 270, lying along x with its anchor one cell west of the code.
    const { plan } = planFromWorkbook(await load(FILLED), TABLES);
    const speedway = plan.placements.find((p) => p.objectId === 'BP_ConveyorBelt_Speedway');
    expect(speedway?.rotation).toBe(270);
    expect(speedway?.cell).toEqual({ x: 27, y: 10 });
  });

  it('sends each sheet to its own warehouse and floor', async () => {
    const { plan } = planFromWorkbook(await load(FILLED), TABLES);
    const second = plan.placements.filter((p) => p.warehouse === 'second');
    expect(second.map((p) => [p.floor, p.objectId])).toEqual([
      [0, 'BP_ConveyorBelt_CountryDiverter2'],
      [1, 'BP_ConveyorBelt_CountryDiverter2'],
    ]);
  });

  it('says how much of the result it had to guess', async () => {
    // Only arrows state a rotation (corners, straights, joiners, the
    // speedway); this count is what the on-screen caution is about.
    const { report } = planFromWorkbook(await load(FILLED), TABLES);
    expect(report.rotationUnknown).toBeGreaterThan(0);
    expect(report.rotationUnknown).toBeLessThan(report.placed);
    expect(report.placed).toBe(32);
  });
});

describe('what is not an object', () => {
  it('ignores the labels the template writes on the grid', () => {
    // "Stairs" sits inside the Regional warehouse's buildable area on both
    // its sheets and must not count as an unknown code.
    const { plan, report } = planFromWorkbook(
      sheetOf({ [at(3, 3)]: 'Stairs', [at(4, 4)]: 'Outside' }), TABLES);
    expect(plan.placements).toEqual([]);
    expect(report.unknown).toEqual([]);
    expect(report.ignored).toBe(2);
  });

  it('ignores a number', () => {
    const { report } = planFromWorkbook(
      sheetOf({ [at(3, 3)]: '500', [at(4, 4)]: '1250.0', [at(5, 5)]: '0' }), TABLES);
    expect(report.unknown).toEqual([]);
    expect(report.ignored).toBe(3);
  });

  it('ignores a cargo-type emoji, which is legend and never a placement', () => {
    const { report } = planFromWorkbook(
      sheetOf({ [at(3, 3)]: '📦', [at(4, 4)]: '🚚', [at(5, 5)]: '🗑️' }), TABLES);
    expect(report.unknown).toEqual([]);
    expect(report.ignored).toBe(3);
  });

  it('reports a code it does not know, rather than dropping it quietly', () => {
    const { report } = planFromWorkbook(sheetOf({ [at(3, 3)]: 'ZZ' }), TABLES);
    expect(report.unknown).toEqual([
      { sheet: 'First Warehouse', cell: { x: 3, y: 3 }, value: 'ZZ' },
    ]);
  });

  it('skips a sheet the template does not name', () => {
    const { plan, report } = planFromWorkbook(sheetOf({ [at(3, 3)]: '↑' }, 'Notes'), TABLES);
    expect(plan.placements).toEqual([]);
    expect(report.unknown).toEqual([]);
  });
});

describe('cells outside the warehouse', () => {
  it('leaves the price table alone', () => {
    // The template's price panel, right of the grid, is full of codes; reading
    // it would import the legend as a layout.
    const { plan, report } = planFromWorkbook(sheetOf({ [cellKey(71, 8)]: '←' }), TABLES);
    expect(plan.placements).toEqual([]);
    expect(report.ignored).toBe(0);
    expect(report.unknown).toEqual([]);
  });

  it('leaves the notch in the first warehouse\'s L alone', () => {
    // x=2, y=20 is inside the grid panel but outside the building: the
    // template's delivery-door arrow, a valid straight-conveyor code. The
    // template's own COUNTIF skips it too.
    const { plan } = planFromWorkbook(sheetOf({ [at(2, 20)]: '↑' }), TABLES);
    expect(plan.placements).toEqual([]);
  });

  it('reports a three-cell object that would hang out of the building', () => {
    // A 1x3 rack at the inside corner of the L's notch fits neither way, so it
    // is reported rather than moved.
    const { plan, report } = planFromWorkbook(sheetOf({ [at(20, 39)]: 'RS' }), TABLES);
    expect(plan.placements).toEqual([]);
    expect(report.dropped).toEqual([
      { sheet: 'First Warehouse', cell: { x: 20, y: 39 }, value: 'RS' },
    ]);
  });

  it('lies a three-cell object down when standing it up will not fit', () => {
    // On the bottom row an upright rack would start below the building, so the
    // importer takes the turn that fits and still counts it as a guess. Not
    // x=12, where the template's bay label sits.
    const { plan, report } = planFromWorkbook(sheetOf({ [at(30, 0)]: 'RS' }), TABLES);
    expect(plan.placements[0]!.rotation).toBe(90);
    expect(plan.placements[0]!.cell).toEqual({ x: 29, y: 0 });
    expect(report.rotationUnknown).toBe(1);
  });
});

describe.skipIf(!existsSync(TEMPLATE))('checking the sheet before trusting it', () => {
  it('passes the blank template', async () => {
    expect(checkTemplate(await load(TEMPLATE), EXPECTED)).toEqual([]);
  });

  it.skipIf(!(FILLED !== '' && existsSync(FILLED)))('passes a workbook someone filled in', async () => {
    // The game's own export drops most styling (1950 coloured cells down to
    // 181); the check must not rely on any of it.
    expect(checkTemplate(await load(FILLED), EXPECTED)).toEqual([]);
  });

  it('refuses a sheet whose grid has been shifted by a column', async () => {
    // An inserted column moves every placement one cell east and the plan still
    // looks normal; the doors catch it.
    const book = await load(TEMPLATE);
    const shifted: Workbook = {
      sheets: book.sheets.map((sheet) => ({
        ...sheet,
        fills: new Map([...sheet.fills].map(([key, rgb]) => {
          const [col, row] = key.split(',').map(Number);
          return [cellKey(col! + 1, row!), rgb] as const;
        })),
      })),
    };
    const problems = checkTemplate(shifted, EXPECTED);
    expect(problems.some((p) => p.kind === 'doors-moved')).toBe(true);
  });

  it('refuses a sheet whose doors have been painted over', async () => {
    const book = await load(TEMPLATE);
    const blanked: Workbook = {
      sheets: book.sheets.map((sheet) => ({ ...sheet, fills: new Map() })),
    };
    expect(checkTemplate(blanked, EXPECTED).filter((p) => p.kind === 'doors-moved')).toHaveLength(3);
  });

  it('refuses a template of another version', async () => {
    const book = await load(TEMPLATE);
    expect(checkTemplate(book, { ...EXPECTED, version: '3.0.0.0' })).toEqual([
      { kind: 'wrong-version', found: '2.0.0.0' },
    ]);
  });

  it('refuses a workbook missing one of the three sheets', async () => {
    const book = await load(TEMPLATE);
    const problems = checkTemplate({ sheets: book.sheets.slice(0, 2) }, EXPECTED);
    expect(problems).toContainEqual({
      kind: 'missing-sheet', sheet: 'Regional Warehouse Mezzanine',
    });
  });

  it('refuses something that is not the template at all', () => {
    const problems = checkTemplate(sheetOf({ [at(0, 0)]: 'hello' }, 'Sheet1'), EXPECTED);
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('an untouched template', () => {
  it('imports as an empty plan, placing nothing at all', async () => {
    // A pristine template describes no layout, so importing it gives nothing;
    // its `RS` signage in S7 must not become a rack.
    const { plan, report } = planFromWorkbook(await load(TEMPLATE), TABLES);

    expect(plan.placements).toHaveLength(0);
    expect(report.placed).toBe(0);
    expect(report.unknown).toEqual([]);
    expect(report.dropped).toEqual([]);
  });
});
