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

/**
 * Caps on what a file may inflate to. Templates circulate in the community, and
 * a few MB of deflate can expand to gigabytes and freeze the tab. The real
 * template's largest part is 156 398 bytes (xl/worksheets/sheet2.xml) and all
 * its parts together 464 413, so these leave a hundredfold margin.
 */
export const MAX_PART_BYTES = 16 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 64 * 1024 * 1024;

/** Inflates one deflate-raw part, refusing it once it passes `maxBytes`. */
export async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('xlsx part too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/**
 * The only parts `readWorkbook` reads. Everything else (drawings, themes,
 * printer settings) is skipped without inflating, so it cannot cost anything.
 */
const isNeededPart = (name: string): boolean =>
  name === 'xl/workbook.xml'
  || name === 'xl/_rels/workbook.xml.rels'
  || name === 'xl/sharedStrings.xml'
  || name === 'xl/styles.xml'
  || name.startsWith('xl/worksheets/');

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
  let inflated = 0;
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
    at += 46 + nameLen + extraLen + commentLen;
    if (!isNeededPart(name)) continue;

    // A size pointing past the file would silently read a truncated part.
    if (start + compressed > bytes.length) throw new Error(`damaged zip entry ${name}`);
    const raw = bytes.subarray(start, start + compressed);

    // 0 stored, 8 deflate. Anything else is not written by Excel; guessing
    // would corrupt silently.
    let body: Uint8Array;
    if (method === 0) body = raw;
    else if (method === 8) body = await inflateRaw(raw, MAX_PART_BYTES);
    else throw new Error(`unsupported compression in ${name}`);

    // Entries may all point at the same compressed bytes, so the whole is
    // capped as well as each part.
    inflated += body.byteLength;
    if (inflated > MAX_WORKBOOK_BYTES) throw new Error('xlsx too large');
    entries.push({ name, body });
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

/** One element: its attribute text, and its content unless it is self-closing. */
interface XmlElement { attrs: string; inner: string | undefined }

/**
 * Every `<tag …>…</tag>` and `<tag …/>` in `xml`, in order, found with
 * `indexOf` so the walk only moves forward. A lazy regex up to `</c>`
 * rescans to the end of the text for every opening tag that has no closing
 * one, which a crafted file can make quadratic; here a missing `>` or closing
 * tag ends the walk. Elements of the same name must not nest, which holds for
 * every tag this file reads.
 */
function* elements(xml: string, tag: string): Generator<XmlElement> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let from = 0;
  for (;;) {
    const start = xml.indexOf(open, from);
    if (start === -1) return;
    const afterName = start + open.length;
    // `<c` must not match `<cols>`: the name has to end here.
    if (!/[\s/>]/.test(xml.charAt(afterName))) {
      from = afterName;
      continue;
    }
    const tagEnd = xml.indexOf('>', afterName);
    if (tagEnd === -1) return;
    const attrs = xml.slice(afterName, tagEnd);
    if (attrs.endsWith('/')) {
      yield { attrs: attrs.slice(0, -1), inner: undefined };
      from = tagEnd + 1;
      continue;
    }
    const closeAt = xml.indexOf(close, tagEnd + 1);
    if (closeAt === -1) return;
    yield { attrs, inner: xml.slice(tagEnd + 1, closeAt) };
    from = closeAt + close.length;
  }
}

/** The first paired `<tag>…</tag>` in `xml`, if any. */
function firstPaired(xml: string, tag: string): XmlElement | undefined {
  for (const element of elements(xml, tag)) if (element.inner !== undefined) return element;
  return undefined;
}

/**
 * The shared string table, in index order. A string styled in parts arrives
 * as several `<r>` runs, so every `<t>` in an `<si>` is concatenated.
 */
function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const { inner } of elements(xml, 'si')) {
    if (inner === undefined) continue;
    let text = '';
    for (const t of elements(inner, 't')) text += unescapeXml(t.inner ?? '');
    strings.push(text);
  }
  return strings;
}

/**
 * Style index -> solid background colour, resolved through `styles.xml`:
 * `s="27"` indexes `<cellXfs>`, whose `<xf fillId="9">` indexes `<fills>`.
 * Only solid fills count. `applyFill` is ignored: writers disagree on it and
 * the template's door cells omit it.
 */
function readFillColours(xml: string): (string | undefined)[] {
  const fillsXml = firstPaired(xml, 'fills')?.inner ?? '';
  const fills: (string | undefined)[] = [];
  for (const { inner } of elements(fillsXml, 'fill')) {
    if (inner === undefined) continue;
    const pattern = firstPaired(inner, 'patternFill');
    if (!pattern || !/patternType="solid"/.test(pattern.attrs)) {
      fills.push(undefined);
      continue;
    }
    // `fgColor` is the solid colour, despite painting the background.
    fills.push(pattern.inner!.match(/<fgColor\b[^>]*\brgb="([0-9A-Fa-f]{8})"/)?.[1]?.toUpperCase());
  }

  const xfsXml = firstPaired(xml, 'cellXfs')?.inner ?? '';
  // Self-closing and paired forms both occur (see readSheet).
  return [...elements(xfsXml, 'xf')]
    .map(({ attrs }) => fills[Number(attrs.match(/\bfillId="(\d+)"/)?.[1] ?? 0)]);
}

function readSheet(
  xml: string,
  shared: readonly string[],
  fillOfStyle: readonly (string | undefined)[],
): { cells: SheetCells; fills: SheetFills } {
  const cells = new Map<string, string>();
  const fills = new Map<string, string>();

  // Self-closing cells must be matched: `<c r="A1" s="3"/>` is common, and
  // reading on to the next `</c>` would run into the next cell and take its `<v>`.
  for (const { attrs, inner: body } of elements(xml, 'c')) {
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
      const inline = firstPaired(body, 'is')?.inner;
      text = inline === undefined ? undefined : firstPaired(inline, 't')?.inner;
    } else {
      // `<v>` is the value; for a formula cell, the cached result.
      const v = firstPaired(body, 'v')?.inner;
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
  // Id and Target appear in either order depending on the writer, so each is
  // read on its own from the tag's attributes.
  for (const [, attrs] of rels.matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const path = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id === undefined || path === undefined || target.has(id)) continue;
    target.set(id, path.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
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
