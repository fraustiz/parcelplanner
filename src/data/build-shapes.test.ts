import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Imports the .mjs scripts directly, so this tests the exact code scripts/build-shapes.mjs runs.
// See scripts/shape-parser.mjs for why the parsing logic lives under scripts/.
import { parseSvg as parseSvgUntyped, validateMapping, DIVISOR } from '../../scripts/shape-parser.mjs';
import { idOf as idOfUntyped, keyOf as keyOfUntyped, SVG_TO_CATALOGUE_ID as MAPPING_UNTYPED } from '../../scripts/svg-shape-map.mjs';
import { getCatalogue } from './catalogue';
import type { Shape } from '@/core/types';

// The .mjs exports are inferred too loosely (parseSvg's return) and too strictly (the mapping
// has no string index signature), so they are re-typed once here instead of cast at each call.
const parseSvg = parseSvgUntyped as (svgText: string, filename: string) => Shape[];
// A mapping value is a catalogue id or `{ id, variant }` (racks fr/en, elevator bas/haut).
// `idOf`/`keyOf` collapse the difference.
type MappingEntry = string | { id: string; variant: string };
const SVG_TO_CATALOGUE_ID: Record<string, MappingEntry> = MAPPING_UNTYPED;
const idOf = idOfUntyped as (entry: MappingEntry) => string;
const keyOf = keyOfUntyped as (entry: MappingEntry) => string;

const here = dirname(fileURLToPath(import.meta.url));
const shapesDir = join(here, '..', '..', 'assets', 'shapes');
const svgFilenames = readdirSync(shapesDir).filter((f) => f.endsWith('.svg'));

describe('build-shapes: mapping validation', () => {
  it('accepts the real mapping against the real assets/shapes/ files and catalogue', () => {
    const catalogueIds = new Set(getCatalogue().keys());
    expect(() => validateMapping(SVG_TO_CATALOGUE_ID, svgFilenames, catalogueIds, idOf, keyOf)).not.toThrow();
  });

  it('fails loudly when an SVG maps to an id absent from the catalogue', () => {
    const broken = { ...SVG_TO_CATALOGUE_ID, 'Convoyeur Simple.svg': 'BP_DoesNotExist' };
    const catalogueIds = new Set(getCatalogue().keys());
    expect(() => validateMapping(broken, svgFilenames, catalogueIds, idOf, keyOf)).toThrow(/BP_DoesNotExist/);
  });

  it('fails loudly when a mapped filename has no corresponding SVG on disk', () => {
    const broken = { ...SVG_TO_CATALOGUE_ID, 'Nonexistent File.svg': 'BP_ConveyorBelt_Straight_Tier1' };
    const catalogueIds = new Set(getCatalogue().keys());
    expect(() => validateMapping(broken, svgFilenames, catalogueIds, idOf, keyOf)).toThrow(/Nonexistent File\.svg/);
  });

  it('fails loudly when an actual SVG file has no mapping entry', () => {
    const catalogueIds = new Set(getCatalogue().keys());
    const filenamesPlusOne = [...svgFilenames, 'Some New Conveyor.svg'];
    expect(() => validateMapping(SVG_TO_CATALOGUE_ID, filenamesPlusOne, catalogueIds, idOf, keyOf)).toThrow(/Some New Conveyor\.svg/);
  });

  it('accepts two SVGs sharing an id when they are different variants', () => {
    // Variants must not trip the duplicate check, which keys on id and variant.
    const catalogueIds = new Set(getCatalogue().keys());
    const sharing = Object.entries(SVG_TO_CATALOGUE_ID)
      .filter(([, e]) => typeof e !== 'string');
    expect(sharing.length).toBeGreaterThan(0);
    expect(() => validateMapping(SVG_TO_CATALOGUE_ID, svgFilenames, catalogueIds, idOf, keyOf)).not.toThrow();
  });

  it('fails loudly when two SVGs map to the same catalogue id AND variant', () => {
    const broken = { ...SVG_TO_CATALOGUE_ID, 'Convoyeur Simple.svg': SVG_TO_CATALOGUE_ID['Convoyeur en Virage.svg']! };
    const catalogueIds = new Set(getCatalogue().keys());
    expect(() => validateMapping(broken, svgFilenames, catalogueIds, idOf, keyOf)).toThrow(/map to/);
  });
});

describe('build-shapes: parseSvg on the real files', () => {
  it('emits shapes for every mapped file, none empty', () => {
    expect(svgFilenames).toHaveLength(33);
    for (const filename of svgFilenames) {
      const id = SVG_TO_CATALOGUE_ID[filename];
      expect(id, `"${filename}" has no mapping entry`).toBeDefined();
      const svgText = readFileSync(join(shapesDir, filename), 'utf8');
      const shapes = parseSvg(svgText, filename);
      expect(shapes.length, `"${filename}" produced no shapes`).toBeGreaterThan(0);
    }
  });

  it('normalises the two 1x3 (viewBox 12x36) objects to 3 cells tall', () => {
    // Each 1x3 file's viewBox is 36 raw units (3 cells) tall. 'Convoyeur Pont.svg' also draws its
    // body with <rect>s (others use <path>), so its emitted rects are checked to span y 0..3.
    for (const filename of ['Convoyeur Pont.svg', 'Convoyeur de Déviation en fonction du Type de Pays.svg']) {
      const svgText = readFileSync(join(shapesDir, filename), 'utf8');
      const viewBoxMatch = svgText.match(/viewBox="0 0 12 (\d+)"/);
      expect(Number(viewBoxMatch?.[1]) / DIVISOR, filename).toBe(3);
    }

    const svgText = readFileSync(join(shapesDir, 'Convoyeur Pont.svg'), 'utf8');
    const rects = parseSvg(svgText, 'Convoyeur Pont.svg')
      .filter((s): s is Extract<typeof s, { kind: 'rect' }> => s.kind === 'rect');
    expect(Math.min(...rects.map((r) => r.y))).toBe(0);
    expect(Math.max(...rects.map((r) => r.y + r.h))).toBeCloseTo(3, 5);
  });

  it('normalises one-cell (viewBox 12x12) objects to 1 cell tall', () => {
    // Same check for one-cell objects: a 12-unit viewBox, and 'Convoyeur Simple.svg' has body <rect>s.
    for (const filename of ['Convoyeur Simple.svg', 'Convoyeur en Virage.svg']) {
      const svgText = readFileSync(join(shapesDir, filename), 'utf8');
      const viewBoxMatch = svgText.match(/viewBox="0 0 12 (\d+)"/);
      expect(Number(viewBoxMatch?.[1]) / DIVISOR, filename).toBe(1);
    }

    const svgText = readFileSync(join(shapesDir, 'Convoyeur Simple.svg'), 'utf8');
    const rects = parseSvg(svgText, 'Convoyeur Simple.svg')
      .filter((s): s is Extract<typeof s, { kind: 'rect' }> => s.kind === 'rect');
    expect(Math.max(...rects.map((r) => r.y + r.h))).toBeCloseTo(1, 5);
  });

  it('rotates a transformed <rect> (e.g. Convoyeur de Déchargement.svg) into a correct axis-aligned rect rather than dropping it', () => {
    const filename = 'Convoyeur de Déchargement.svg';
    const svgText = readFileSync(join(shapesDir, filename), 'utf8');
    const shapes = parseSvg(svgText, filename);
    const rects = shapes.filter((s): s is Extract<typeof s, { kind: 'rect' }> => s.kind === 'rect');
    // Source: <rect x="10" y="11" width="8" height="11" transform="rotate(180 10 11)" fill="#D9D9D9"/>
    // Rotating 180 degrees about (10,11) maps (18,22) to (2,0): box x:2 y:0 w:8 h:11, divided by 12.
    const rotated = rects.find((r) => r.fill === '#D9D9D9');
    expect(rotated?.x).toBeCloseTo(2 / 12, 5);
    expect(rotated?.y).toBeCloseTo(0, 5);
    expect(rotated?.w).toBeCloseTo(8 / 12, 5);
    expect(rotated?.h).toBeCloseTo(11 / 12, 5);
  });

  it('drops (with a warning, not silently) the embedded raster-icon rect in the scanner/diverter files', () => {
    const filename = 'Convoyeur Scanner (Poids).svg';
    const svgText = readFileSync(join(shapesDir, filename), 'utf8');
    const shapes = parseSvg(svgText, filename);
    expect(shapes.some((s) => s.kind === 'rect' && s.fill.startsWith('url('))).toBe(false);
  });

  it('renders every source SVG faithfully: the blue side-rail border and the black direction arrow are preserved, not filtered', () => {
    // SVGs render as authored: the border fill #044ABE and the black arrow stroke must
    // come through on every file that has them (see scripts/shape-parser.mjs).
    let filesWithBorder = 0;
    let filesWithArrow = 0;
    for (const filename of svgFilenames) {
      const svgText = readFileSync(join(shapesDir, filename), 'utf8');
      const shapes = parseSvg(svgText, filename);
      const hasBorderInSource = svgText.includes('fill="#044ABE"');
      const hasArrowInSource = svgText.includes('stroke="black"');
      if (hasBorderInSource) {
        filesWithBorder++;
        expect(shapes.some((s) => 'fill' in s && s.fill === '#044ABE'), filename).toBe(true);
      }
      if (hasArrowInSource) {
        filesWithArrow++;
        expect(shapes.some((s) => 'stroke' in s && s.stroke === 'black'), filename).toBe(true);
      }
    }
    // Guards against passing vacuously if the sources stop containing these colours.
    expect(filesWithBorder).toBeGreaterThan(0);
    expect(filesWithArrow).toBeGreaterThan(0);
  });

  it('records the divisor as 12', () => {
    expect(DIVISOR).toBe(12);
  });

  it('throws on an unrecognised colour rather than silently drawing the wrong thing', () => {
    const svg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="12" height="12" fill="hotpink"/></svg>';
    expect(() => parseSvg(svg, 'fixture.svg')).toThrow(/unrecognised colour/);
  });

  it('throws on an unsupported element rather than silently dropping it', () => {
    const svg = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="3" fill="#000000"/></svg>';
    expect(() => parseSvg(svg, 'fixture.svg')).toThrow(/circle/);
  });
});
