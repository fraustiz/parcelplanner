import { describe, it, expect } from 'vitest';
import { getCatalogue } from './catalogue';
import { COLOUR_NAMES, isObjectColour, OBJECT_COLOURS, repaintableColourOf } from './colours';
import { t } from '@/i18n';
import shapes from './generated/shapes.json';

const entry = (id: string) => getCatalogue().get(id)!;

describe('OBJECT_COLOURS', () => {
  it('offers the eight palette colours, in order', () => {
    // Frozen: shared links store a colour by index, so reordering repaints shared layouts.
    expect(OBJECT_COLOURS).toEqual([
      '#ae302e', '#cb551b', '#cbc11b', '#75bb59',
      '#044abe', '#bf0083', '#d0d0d1', '#121110',
    ]);
  });

  it('offers both of the artwork’s own colours as choices', () => {
    // The conveyor blue and rack red: each gives the original back on its own family.
    // Lower case here, upper case in the artwork (see the case test in renderer.test.ts).
    expect(OBJECT_COLOURS).toContain('#044abe');
    expect(OBJECT_COLOURS).toContain('#ae302e');
    expect(repaintableColourOf(entry('BP_ConveyorBelt_Straight_Tier1'))!.toLowerCase())
      .toBe('#044abe');
    expect(repaintableColourOf(entry('BP_StorageRack_Medium'))!.toLowerCase())
      .toBe('#ae302e');
  });

  it('lists each colour once', () => {
    expect(new Set(OBJECT_COLOURS).size).toBe(OBJECT_COLOURS.length);
  });
});

describe('repaintableColourOf', () => {
  it('repaints the blue flanks of a conveyor', () => {
    expect(repaintableColourOf(entry('BP_ConveyorBelt_Straight_Tier1'))).toBe('#044ABE');
  });

  it('repaints a router too, which is a conveyor in everything but name', () => {
    expect(repaintableColourOf(entry('BP_ConveyorBelt_Splitter'))).toBe('#044ABE');
  });

  it('lets a reserved zone be painted', () => {
    // Zones are plain rectangles, coloured to tell areas apart.
    expect(repaintableColourOf(entry('zone-3x2'))).not.toBeNull();
  });

  it('repaints the red of a storage rack, not the blue', () => {
    expect(repaintableColourOf(entry('BP_StorageRack_Medium'))).toBe('#AE302E');
  });

  it('refuses to repaint a scanner', () => {
    // A scanner's blue identifies the machine, so scanners are not paintable.
    for (const id of ['BP_ConveyorBelt_Scanner2_Tier1', 'BP_ConveyorBelt_CriteriaScanner_Weight']) {
      expect(repaintableColourOf(entry(id))).toBeNull();
    }
  });

  it('names a colour that is really in the artwork', () => {
    // Substituting a colour the SVGs do not contain would silently do nothing.
    const used = new Set<string>();
    for (const group of Object.values(shapes.shapes)) {
      for (const shape of group as { fill?: string; stroke?: string }[]) {
        for (const c of [shape.fill, shape.stroke]) if (c) used.add(c.toUpperCase());
      }
    }
    for (const id of ['BP_ConveyorBelt_Straight_Tier1', 'BP_StorageRack_Medium']) {
      expect(used).toContain(repaintableColourOf(entry(id))!.toUpperCase());
    }
  });
});

describe('isObjectColour', () => {
  it('accepts one this app offers', () => {
    expect(isObjectColour('#75bb59')).toBe(true);
  });

  it('accepts it whatever case it arrives in', () => {
    // Colours come back from shared links and from localStorage.
    expect(isObjectColour('#75BB59')).toBe(true);
  });

  it('refuses the colours that were dropped', () => {
    // Removed colours must not be accepted.
    expect(isObjectColour('#00a2ba')).toBe(false);
    expect(isObjectColour('#7fc717')).toBe(false);
  });

  it('refuses anything else', () => {
    expect(isObjectColour('#ffffff')).toBe(false);
    expect(isObjectColour('red')).toBe(false);
    expect(isObjectColour('')).toBe(false);
  });
});

describe('COLOUR_NAMES', () => {
  it('names every swatch in both languages, never by its code', () => {
    for (const colour of OBJECT_COLOURS) {
      const key = COLOUR_NAMES[colour];
      expect(key, colour).toBeDefined();
      for (const locale of ['en', 'fr'] as const) {
        expect(t(locale, key!)).not.toMatch(/#/);
      }
    }
  });
});
