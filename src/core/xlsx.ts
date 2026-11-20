/**
 * Just enough .xlsx to read the game's floor-plan template.
 *
 * An .xlsx is a ZIP of XML, and deflate-raw is already used for share links,
 * so this needs no dependency. It only reads which text and fill sit in which
 * cell; formulas use their cached value, and styles, merges and dates are
 * ignored. XML is parsed with regular expressions because DOMParser does not
 * exist outside a browser; the input comes from one known generator.
 */

/** A cell's text, keyed `"col,row"`, both 1-based as in Excel. */
export type SheetCells = ReadonlyMap<string, string>;

/**
 * A cell's solid background colour as Excel's `ARGB` string (`FFC00000`),
 * keyed the same way; only cells with one appear. The template marks doors by
 * colour alone (see `checkTemplate` in import-plan.ts).
 */
export type SheetFills = ReadonlyMap<string, string>;

export interface Workbook {
  /** Sheet contents, in the workbook's own tab order. */
  sheets: { name: string; cells: SheetCells; fills: SheetFills }[];
}

export const cellKey = (col: number, row: number): string => `${col},${row}`;

/** `AB` -> 28. Excel's bijective base-26 column names. */
export function columnNumber(name: string): number {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** One file inside the archive. */
interface Entry { name: string; body: Uint8Array }

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number): number =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The archive's entries, read from the end of central directory record: a
 * local header may carry zero sizes with the real ones in a trailing data
 * descriptor, which Excel does write.
 */
async function readZip(buffer: ArrayBuffer): Promise<Entry[]> {
  const bytes = new Uint8Array(buffer);

  // The record follows a comment of unknown length, so scan backwards for it.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 0xffff; i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive');

  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);

  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('damaged zip directory');
    const method = u16(bytes, at + 10);
    const compressed = u32(bytes, at + 20);
    const nameLen = u16(bytes, at + 28);
    const extraLen = u16(bytes, at + 30);
    const commentLen = u16(bytes, at + 32);
    const localAt = u32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));

    // The local header repeats name and extra field at its own lengths, so
    // they are read again.
    const localNameLen = u16(bytes, localAt + 26);
    const localExtraLen = u16(bytes, localAt + 28);
    const start = localAt + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(start, start + compressed);

    // 0 stored, 8 deflate. Anything else is not written by Excel; guessing
    // would corrupt silently.
    if (method === 0) entries.push({ name, body: raw });
    else if (method === 8) entries.push({ name, body: await inflateRaw(raw) });
    else throw new Error(`unsupported compression in ${name}`);

    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const unescapeXml = (value: string): string => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  // Ampersand last, so "&amp;lt;" does not turn into "<".
  .replace(/&amp;/g, '&');

/**
 * The shared string table, in index order. A string styled in parts arrives
 * as several `<r>` runs, so every `<t>` in an `<si>` is concatenated.
 */
function readSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map(([, body]) =>
    [...body.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => unescapeXml(t)).join(''));
}

/**
 * Style index -> solid background colour, resolved through `styles.xml`:
 * `s="27"` indexes `<cellXfs>`, whose `<xf fillId="9">` indexes `<fills>`.
 * Only solid fills count. `applyFill` is ignored: writers disagree on it and
 * the template's door cells omit it.
 */
function readFillColours(xml: string): (string | undefined)[] {
  const fillsXml = xml.match(/<fills\b[^>]*>(.*?)<\/fills>/s)?.[1] ?? '';
  const fills = [...fillsXml.matchAll(/<fill>(.*?)<\/fill>/gs)].map(([, body]) => {
    const pattern = body.match(/<patternFill\b([^>]*)>(.*?)<\/patternFill>/s);
    if (!pattern || !/patternType="solid"/.test(pattern[1]!)) return undefined;
    // `fgColor` is the solid colour, despite painting the background.
    return pattern[2]!.match(/<fgColor\b[^>]*\brgb="([0-9A-Fa-f]{8})"/)?.[1]?.toUpperCase();
  });

  const xfsXml = xml.match(/<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s)?.[1] ?? '';
  // Self-closing and paired forms both occur (see readSheet).
  return [...xfsXml.matchAll(/<xf\b([^>]*?)(?:\/>|>.*?<\/xf>)/gs)]
    .map(([, attrs]) => fills[Number(attrs.match(/\bfillId="(\d+)"/)?.[1] ?? 0)]);
}

function readSheet(
  xml: string,
  shared: readonly string[],
  fillOfStyle: readonly (string | undefined)[],
): { cells: SheetCells; fills: SheetFills } {
  const cells = new Map<string, string>();
  const fills = new Map<string, string>();

  // Self-closing cells must be matched: `<c r="A1" s="3"/>` is common, and a
  // pattern requiring `</c>` would run into the next cell and take its `<v>`.
  // `[^>]*?` cannot cross a `>`, so each cell matches alone.
  for (const [, attrs, body] of xml.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const at = attrs.match(/\br="([A-Z]+)(\d+)"/);
    if (!at) continue;
    const key = cellKey(columnNumber(at[1]!), Number(at[2]));

    // The colour is read before the value and for every cell: doors are
    // coloured cells with no value.
    const colour = fillOfStyle[Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0)];
    if (colour !== undefined) fills.set(key, colour);

    if (body === undefined) continue;

    let text: string | undefined;
    if (/\bt="inlineStr"/.test(attrs)) {
      // Text held in the cell itself rather than in the shared table.
      text = body.match(/<is>.*?<t[^>]*>(.*?)<\/t>/s)?.[1];
    } else {
      // `<v>` is the value; for a formula cell, the cached result.
      const v = body.match(/<v>(.*?)<\/v>/s)?.[1];
      if (v === undefined) continue;
      text = /\bt="s"/.test(attrs) ? shared[Number(v)] : v;
    }

    if (text === undefined) continue;
    const value = unescapeXml(text).trim();
    if (value === '') continue;
    cells.set(key, value);
  }
  return { cells, fills };
}

export async function readWorkbook(buffer: ArrayBuffer): Promise<Workbook> {
  const entries = new Map((await readZip(buffer)).map((e) => [e.name, e.body]));
  const text = (name: string): string | undefined => {
    const body = entries.get(name);
    return body === undefined ? undefined : new TextDecoder().decode(body);
  };

  const book = text('xl/workbook.xml');
  if (book === undefined) throw new Error('not a spreadsheet: no xl/workbook.xml');

  const sharedXml = text('xl/sharedStrings.xml');
  const shared = sharedXml === undefined ? [] : readSharedStrings(sharedXml);

  const stylesXml = text('xl/styles.xml');
  const fillOfStyle = stylesXml === undefined ? [] : readFillColours(stylesXml);

  // Sheet name -> file through the relationship id. Tab order follows the
  // <sheet> elements, not the file names.
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  const target = new Map<string, string>();
  for (const [, id, path] of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    target.set(id, path.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }
  // Id and Target appear in either order depending on the writer.
  for (const [, path, id] of rels.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) {
    if (!target.has(id)) target.set(id, path.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }

  const sheets: Workbook['sheets'] = [];
  for (const [, attrs] of book.matchAll(/<sheet\b([^>]*)>/g)) {
    const name = attrs.match(/\bname="([^"]*)"/)?.[1];
    const rid = attrs.match(/r:id="([^"]+)"/)?.[1];
    if (name === undefined || rid === undefined) continue;
    const file = target.get(rid);
    const xml = file === undefined ? undefined : text(`xl/${file}`);
    // A missing sheet part reads as empty rather than failing the import.
    sheets.push({
      name: unescapeXml(name),
      ...(xml === undefined
        ? { cells: new Map(), fills: new Map() }
        : readSheet(xml, shared, fillOfStyle)),
    });
  }
  return { sheets };
}
