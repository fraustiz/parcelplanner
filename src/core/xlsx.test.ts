import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { cellKey, columnNumber, inflateRaw, MAX_PART_BYTES, readWorkbook } from './xlsx';

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

/** deflate-raw, as Excel compresses its parts. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Part {
  name: string;
  /** Already compressed when `method` is 8. */
  data: Uint8Array;
  method: 0 | 8;
  /** A compressed size to claim instead of the real one. */
  claimedSize?: number;
}

/** A minimal zip archive. `readZip` checks no CRC, so none is written. */
function zip(parts: Part[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = encoder.encode(part.name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, part.method, true);
    local.setUint32(18, part.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, part.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, part.method, true);
    entry.setUint32(20, part.claimedSize ?? part.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + part.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, parts.length, true);
  end.setUint16(10, parts.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  chunks.push(...central, new Uint8Array(end.buffer));

  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out.buffer;
}

const stored = (name: string, text: string): Part =>
  ({ name, data: new TextEncoder().encode(text), method: 0 });

const BOOK = '<workbook><sheets><sheet name="One" sheetId="1" r:id="rId1"/></sheets></workbook>';
const RELS = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';

describe('a booby-trapped workbook', () => {
  it('reads a minimal workbook built here, so the tests below test the traps', async () => {
    const book = await readWorkbook(zip([
      stored('xl/workbook.xml', BOOK),
      stored('xl/_rels/workbook.xml.rels', RELS),
      stored('xl/worksheets/sheet1.xml', '<sheetData><row><c r="A1" t="inlineStr"><is><t>hi</t></is></c><c r="B1"><v>7</v></c></row></sheetData>'),
    ]));
    expect(book.sheets).toHaveLength(1);
    expect(book.sheets[0].cells.get(cellKey(1, 1))).toBe('hi');
    expect(book.sheets[0].cells.get(cellKey(2, 1))).toBe('7');
  });

  it('stops inflating a part once it passes the cap', async () => {
    const bomb = await deflate(new Uint8Array(4096));
    await expect(inflateRaw(bomb, 4095)).rejects.toThrow(/too large/);
    expect((await inflateRaw(bomb, 4096)).length).toBe(4096);
  });

  it('refuses a sheet that inflates past the per-part cap', async () => {
    // A few KB of deflate that would expand to more than MAX_PART_BYTES.
    const bomb = await deflate(new Uint8Array(MAX_PART_BYTES + 1));
    await expect(readWorkbook(zip([
      stored('xl/workbook.xml', BOOK),
      stored('xl/_rels/workbook.xml.rels', RELS),
      { name: 'xl/worksheets/sheet1.xml', data: bomb, method: 8 },
    ]))).rejects.toThrow(/too large/);
  });

  it('never inflates a part it does not read', async () => {
    const bomb = await deflate(new Uint8Array(MAX_PART_BYTES + 1));
    const book = await readWorkbook(zip([
      stored('xl/workbook.xml', BOOK),
      { name: 'xl/media/image1.png', data: bomb, method: 8 },
    ]));
    expect(book.sheets).toHaveLength(1);
  });

  it('refuses an entry whose size points past the end of the file', async () => {
    await expect(readWorkbook(zip([
      { ...stored('xl/workbook.xml', BOOK), claimedSize: 1_000_000 },
    ]))).rejects.toThrow(/damaged/);
  });

  it('reads one huge relationship tag without a target in linear time', async () => {
    // Was quadratic: 42 KB took 30 s.
    // Every `Id="` is a fresh start for the old pattern, which then scanned the rest of the tag.
    const rels = `<Relationships><Relationship ${'Id="x" '.repeat(30 * 1024)}/></Relationships>`;
    expect(rels.length).toBeGreaterThan(200 * 1024);
    const archive = zip([stored('xl/workbook.xml', BOOK), stored('xl/_rels/workbook.xml.rels', rels)]);
    const started = performance.now();
    const book = await readWorkbook(archive);
    expect(performance.now() - started).toBeLessThan(200);
    expect(book.sheets[0].cells.size).toBe(0);
  });

  it('reads a sheet with an unclosed cell in linear time', async () => {
    const sheet = `<sheetData><row>${'<c r="A1">'.repeat(110 * 1024)}</row></sheetData>`;
    expect(sheet.length).toBeGreaterThan(1024 * 1024);
    const archive = zip([
      stored('xl/workbook.xml', BOOK),
      stored('xl/_rels/workbook.xml.rels', RELS),
      stored('xl/worksheets/sheet1.xml', sheet),
    ]);
    const started = performance.now();
    await readWorkbook(archive);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
