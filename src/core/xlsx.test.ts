import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { cellKey, columnNumber, readWorkbook } from './xlsx';

describe('columnNumber', () => {
  it('reads Excel\'s bijective base-26 names', () => {
    expect(columnNumber('A')).toBe(1);
    expect(columnNumber('G')).toBe(7);
    expect(columnNumber('Z')).toBe(26);
    expect(columnNumber('AA')).toBe(27);
    expect(columnNumber('BD')).toBe(56);
  });
});

/**
 * Read against the real template, committed as the fixture: the risk is what
 * Excel actually emits (data descriptors, split string runs, cached formula
 * values), which a hand-made archive would not show.
 */
const TEMPLATE = 'assets/fixtures/floor-plan-template.xlsx';
/** A filled workbook, kept out of the repo as player data: point
 * PARCELPLANNER_FILLED_XLSX at one to run these. */
const FILLED = process.env.PARCELPLANNER_FILLED_XLSX ?? '';
const load = async (path: string) => {
  const bytes = readFileSync(path);
  return readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

describe.skipIf(!existsSync(TEMPLATE))('the official template', () => {
  it('finds the three sheets, in tab order', async () => {
    const book = await load(TEMPLATE);
    expect(book.sheets.map((s) => s.name)).toEqual([
      'First Warehouse', 'Regional Warehouse Ground', 'Regional Warehouse Mezzanine',
    ]);
  });

  it('reads shared strings, not their indices', async () => {
    // A cell with t="s" holds an index into the string table; unresolved, it
    // yields plausible-looking digits.
    const book = await load(TEMPLATE);
    const values = [...book.sheets[0].cells.values()];
    expect(values).toContain('Subtotal');
    expect(values.some((v) => /^\d+$/.test(v))).toBe(true); // prices are numbers
  });

  it('places the door legend where the app has its doors', async () => {
    // Ties the reader to an outside fact: the east export doors sit at column
    // 58, rows 14, 24 and 34, i.e. x 49 / y 7, 17, 27 (x = col - 7, y = row - 7).
    const first = (await load(TEMPLATE)).sheets[0].cells;
    expect(first.get(cellKey(58, 14))).toBe('🚚');
    expect(first.get(cellKey(58, 24))).toBe('🚂');
    expect(first.get(cellKey(59, 34))).toBe('🚢');
  });
});

describe.skipIf(!(FILLED !== '' && existsSync(FILLED)))('a workbook someone has typed into', () => {
  it('reads the cells they filled in', async () => {
    const first = (await load(FILLED)).sheets[0].cells;
    expect(first.get(cellKey(29, 9))).toBe('→');
    expect(first.get(cellKey(30, 9))).toBe('↘');
    expect(first.get(cellKey(28, 11))).toBe('↗');
    expect(first.get(cellKey(35, 40))).toBe('CT');
  });

  it('leaves cells that were never touched absent, not empty-string', async () => {
    const first = (await load(FILLED)).sheets[0].cells;
    expect(first.has(cellKey(29, 10))).toBe(false);
  });
});

describe('cells that carry no value', () => {
  it('does not let a styled-but-empty cell swallow the value after it', async () => {
    // A styled empty cell is written `<c r="BL5" s="27"/>`. A pattern that
    // requires `</c>` starts on it and takes the next cell's `<v>`, losing
    // `t="s"`: here it put "9" at column 64 of row 5 instead of the version
    // string four columns further along.
    const first = (await load(TEMPLATE)).sheets[0].cells;
    expect(first.get(cellKey(69, 5))).toBe('2.0.0.0');
    expect(first.has(cellKey(64, 5))).toBe(false);
  });
});

describe('fill colours', () => {
  /**
   * The template marks its doors by colour with no text, and doors are the
   * only fixed landmark that pins the grid's origin (see `checkTemplate`).
   */
  it('reads the colour of a cell that has no value', async () => {
    // The delivery door by the first warehouse's x=2 wall: a 3x3 ring at
    // columns 8-10, rows 27-29, whose corners carry only a fill.
    const first = (await load(TEMPLATE)).sheets[0];
    expect(first.cells.has(cellKey(8, 27))).toBe(false);
    expect(first.fills.get(cellKey(8, 27))).toBe('FFFFC000');
    expect(first.fills.get(cellKey(10, 29))).toBe('FFFFC000');
  });

  it('reports no fill for a styled cell whose style has none', async () => {
    // A door block is nine cells with one gap: the cell touching the door holds
    // the arrow. It is styled (border, font) but paints nothing, and the
    // guard-rail counts only the eight painted cells.
    const first = (await load(TEMPLATE)).sheets[0];
    expect(first.cells.get(cellKey(9, 27))).toBe('↑');
    expect(first.fills.has(cellKey(9, 27))).toBe(false);
  });

  it('tells the three door colours apart', async () => {
    const first = (await load(TEMPLATE)).sheets[0];
    expect(first.fills.get(cellKey(8, 4))).toBe('FFC00000'); // reject bin
    expect(first.fills.get(cellKey(23, 4))).toBe('FF00B050'); // cargo export
    expect(first.fills.get(cellKey(8, 27))).toBe('FFFFC000'); // delivery
  });
});

describe.skipIf(!(FILLED !== '' && existsSync(FILLED)))('fill colours in a workbook someone typed into', () => {
  const DOOR_COLOURS = new Set(['FFC00000', 'FFFFC000', 'FF00B050']);
  const doorCells = (fills: ReadonlyMap<string, string>) =>
    new Map([...fills].filter(([, rgb]) => DOOR_COLOURS.has(rgb)));

  it('keeps every door the blank template marks', async () => {
    // Measured on a real filled sheet: the blank template styles 1950 cells,
    // the filled one keeps 181 but all 129 door cells (plus 7 of its own). So
    // the guard-rail may only ask whether expected doors are present, never
    // whether the coloured set matches.
    const blank = doorCells((await load(TEMPLATE)).sheets[0].fills);
    const filled = doorCells((await load(FILLED)).sheets[0].fills);
    expect(blank.size).toBe(129);
    expect([...blank].filter(([key, rgb]) => filled.get(key) !== rgb)).toEqual([]);
  });
});

describe('rejecting what is not a workbook', () => {
  it('says so for bytes that are not a zip', async () => {
    await expect(readWorkbook(new TextEncoder().encode('hello there').buffer))
      .rejects.toThrow(/zip/i);
  });
});
