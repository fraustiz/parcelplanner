import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { cellKey, readWorkbook } from '@/core/xlsx';
import { getCatalogue } from './catalogue';
import { TEMPLATE_CODES, TEMPLATE_LABELS, TEMPLATE_SHEETS, TEMPLATE_VERSION } from './template';

const TEMPLATE = 'assets/fixtures/floor-plan-template.xlsx';
const load = async (path: string) => {
  const bytes = readFileSync(path);
  return readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/**
 * The template's own price table from the fixture (name in column 63, price in column 64), so each
 * mapping's `legend` row can be cross-checked against the catalogue price.
 */
async function legendPrices(): Promise<Map<string, number>> {
  const cells = (await load(TEMPLATE)).sheets[0].cells;
  const prices = new Map<string, number>();
  for (let row = 7; row <= 46; row++) {
    const name = cells.get(cellKey(63, row));
    const price = cells.get(cellKey(64, row));
    if (name === undefined || price === undefined) continue;
    if (!/^\d+(\.\d+)?$/.test(price)) continue; // skips the "Price" headers
    prices.set(name, Number(price));
  }
  return prices;
}

/** Every code the template prints in its own legend columns. */
async function legendCodes(): Promise<Set<string>> {
  const cells = (await load(TEMPLATE)).sheets[0].cells;
  const codes = new Set<string>();
  for (let row = 7; row <= 46; row++) {
    for (let col = 71; col <= 76; col++) {
      const code = cells.get(cellKey(col, row));
      // The legend columns also carry two footnotes ("T for Type", "B for Barcode").
      if (code !== undefined && !code.includes(' ')) codes.add(code);
    }
  }
  return codes;
}

describe.skipIf(!existsSync(TEMPLATE))('the code table, against the template legend', () => {
  /**
   * Objects whose price the game changed after the community template was written. Each names its
   * source, and the assertion below checks the disagreement is exactly the one claimed.
   */
  const CHANGED_SINCE_THE_TEMPLATE = new Map([
    // Patch notes 2026-07-30: "reduced their price to $30k", was 50000.
    ['BP_ConveyorBelt_AutoPauser', { now: 30000, template: 50000 }],
  ]);

  it('prices every code as the template prices the row it names', async () => {
    const prices = await legendPrices();
    const catalogue = getCatalogue();
    const wrong: string[] = [];
    for (const [code, entry] of TEMPLATE_CODES) {
      const changed = CHANGED_SINCE_THE_TEMPLATE.get(entry.objectId);
      if (changed) {
        // Both sides must still say what the exemption claims, so a refresh or a new patch fails here.
        expect([entry.objectId, catalogue.get(entry.objectId)?.price, prices.get(entry.legend)])
          .toEqual([entry.objectId, changed.now, changed.template]);
        continue;
      }
      const listed = prices.get(entry.legend);
      const object = catalogue.get(entry.objectId);
      if (listed === undefined) { wrong.push(`${code}: no legend row named "${entry.legend}"`); continue; }
      if (object === undefined) { wrong.push(`${code}: no catalogue object ${entry.objectId}`); continue; }
      if (object.price !== listed) {
        wrong.push(`${code} -> ${entry.objectId} costs ${object.price}, but the template's "${entry.legend}" row costs ${listed}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('covers every code the template prints', async () => {
    const missing = [...await legendCodes()].filter((code) => !TEMPLATE_CODES.has(code));
    expect(missing).toEqual([]);
  });

  it('invents no code the template does not print', async () => {
    const printed = await legendCodes();
    expect([...TEMPLATE_CODES.keys()].filter((code) => !printed.has(code))).toEqual([]);
  });

  /**
   * Objects the game added after the template was published, so the sheet prints no code for them.
   * The test above forbids inventing a glyph, so these cannot arrive through an import.
   */
  const NEWER_THAN_THE_TEMPLATE = new Set([
    // The T-Joiner Conveyor, 25 September 2026 update.
    'BP_ConveyorBelt_Joiner_2WayT',
  ]);

  it('reaches every object in the catalogue the template can name', () => {
    const reached = new Set([...TEMPLATE_CODES.values()].map((e) => e.objectId));
    const unreachable = [...getCatalogue().keys()]
      .filter((id) => !reached.has(id) && !NEWER_THAN_THE_TEMPLATE.has(id));
    expect(unreachable).toEqual([]);
  });

  it('exempts only objects the template really has no code for', () => {
    // Like CHANGED_SINCE_THE_TEMPLATE: once the sheet gains a code for one, this fails.
    const reached = new Set([...TEMPLATE_CODES.values()].map((e) => e.objectId));
    for (const id of NEWER_THAN_THE_TEMPLATE) {
      expect(getCatalogue().has(id), `${id} is not in the catalogue`).toBe(true);
      expect(reached.has(id), `${id} now has a template code`).toBe(false);
    }
  });

  it('agrees with the template about its own version', async () => {
    const cells = (await load(TEMPLATE)).sheets[0].cells;
    expect(cells.get(cellKey(69, 5))).toBe(TEMPLATE_VERSION);
  });
});

describe('the storage-rack trap', () => {
  /**
   * Rack ids sit one size above their displayed names, and the template's codes follow the
   * displayed name: `RM` ("Medium", 900) is `BP_StorageRack_Large`, not `BP_StorageRack_Medium` (500).
   */
  it('maps a rack by its displayed size, not by its id', () => {
    expect(TEMPLATE_CODES.get('RS')?.objectId).toBe('BP_StorageRack_Medium');
    expect(TEMPLATE_CODES.get('RM')?.objectId).toBe('BP_StorageRack_Large');
    expect(TEMPLATE_CODES.get('RL')?.objectId).toBe('BP_StorageRack_ExtraLarge');

    const catalogue = getCatalogue();
    expect(catalogue.get(TEMPLATE_CODES.get('RS')!.objectId)?.price).toBe(500);
    expect(catalogue.get(TEMPLATE_CODES.get('RM')!.objectId)?.price).toBe(900);
    expect(catalogue.get(TEMPLATE_CODES.get('RL')!.objectId)?.price).toBe(1600);
  });
});

describe('rotation, where the sheet states one', () => {
  /**
   * Rotation 0 flows up the screen (see src/data/ports.ts), so each family's up-arrow is rotation 0
   * and the rest follow clockwise.
   */
  it('reads a straight conveyor\'s four arrows as four quarter turns', () => {
    expect(TEMPLATE_CODES.get('↑')?.rotation).toBe(0);
    expect(TEMPLATE_CODES.get('→')?.rotation).toBe(90);
    expect(TEMPLATE_CODES.get('↓')?.rotation).toBe(180);
    expect(TEMPLATE_CODES.get('←')?.rotation).toBe(270);
  });

  it('reads a corner\'s diagonal as the turn it makes', () => {
    // At rotation 0 a corner takes a parcel in from below and sends it left (`cornerLeft`),
    // drawn ↖. The rest follow clockwise.
    expect(TEMPLATE_CODES.get('↖')?.rotation).toBe(0);
    expect(TEMPLATE_CODES.get('↗')?.rotation).toBe(90);
    expect(TEMPLATE_CODES.get('↘')?.rotation).toBe(180);
    expect(TEMPLATE_CODES.get('↙')?.rotation).toBe(270);
  });

  it('leaves rotation unstated where the template prints one glyph only', () => {
    // The sheet does not carry the rotation; `import.caution` reports it.
    expect(TEMPLATE_CODES.get('L')?.rotation).toBeNull();
    expect(TEMPLATE_CODES.get('RS')?.rotation).toBeNull();
    expect(TEMPLATE_CODES.get('SA')?.rotation).toBeNull();
  });

  it('states a rotation for every glyph of a four-glyph family', () => {
    const families = ['↑→↓←', '↖↗↘↙', '⇈⇉⇊⇇', '⇑⇒⇓⇐', '⤊⇛⤋⇚'];
    for (const family of families) {
      const turns = [...family].map((code) => TEMPLATE_CODES.get(code)?.rotation);
      expect(turns).toEqual([0, 90, 180, 270]);
      // One object per family, four ways round.
      const ids = new Set([...family].map((code) => TEMPLATE_CODES.get(code)?.objectId));
      expect(ids.size).toBe(1);
    }
  });
});

describe('what the sheets mean', () => {
  it('names the three sheets in the template\'s own tab order', async () => {
    const book = await load(TEMPLATE);
    expect(TEMPLATE_SHEETS.map((s) => s.name)).toEqual(book.sheets.map((s) => s.name));
  });

  it('sends each sheet to the warehouse and floor it draws', () => {
    expect(TEMPLATE_SHEETS.map((s) => [s.warehouse, s.floor])).toEqual([
      ['main', 0], ['second', 0], ['second', 1],
    ]);
  });
});

describe('the labels the template writes on the grid itself', () => {
  it('knows them, so they are never read as objects', async () => {
    // Printed inside the grid panel: fixed structure, not placements or unknown codes.
    expect([...TEMPLATE_LABELS].sort()).toEqual(['Outside', 'Stairs']);
    const book = await load(TEMPLATE);
    const written = new Set<string>();
    for (const sheet of book.sheets) for (const value of sheet.cells.values()) written.add(value);
    for (const label of TEMPLATE_LABELS) expect(written.has(label)).toBe(true);
  });
});
