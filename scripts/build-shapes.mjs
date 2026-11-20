import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIVISOR, parseSvg, validateMapping } from './shape-parser.mjs';
import { idOf, keyOf, SVG_TO_CATALOGUE_ID } from './svg-shape-map.mjs';
import { UPRIGHT_SHAPES } from './upright-shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const shapesDir = join(here, '..', 'assets', 'shapes');
const catalogueFile = join(here, '..', 'src', 'data', 'generated', 'catalogue.json');
const outFile = join(here, '..', 'src', 'data', 'generated', 'shapes.json');

/** FModel/PowerShell exports sometimes carry a leading UTF-8 BOM; JSON.parse rejects it. */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

const svgFilenames = readdirSync(shapesDir).filter((f) => f.endsWith('.svg'));
const catalogue = readJson(catalogueFile);
const catalogueIds = new Set(catalogue.map((e) => e.id));

// Check the mapping before parsing any file (see scripts/svg-shape-map.mjs).
validateMapping(SVG_TO_CATALOGUE_ID, svgFilenames, catalogueIds, idOf, keyOf);

// Files whose embedded raster glyph is dropped (shape-parser.mjs, point 3),
// reported in one summary line rather than a warning per file.
let droppedIconCount = 0;

const shapes = {};
for (const filename of svgFilenames) {
  const key = keyOf(SVG_TO_CATALOGUE_ID[filename]);
  const svgText = readFileSync(join(shapesDir, filename), 'utf8');
  if (/<pattern\b|<image\b/.test(svgText)) droppedIconCount++;
  shapes[key] = parseSvg(svgText, filename);
}

// Bake the "do not mirror" flag into the artwork. A `d` that matches nothing
// means the symbol was redrawn, so the build fails.
for (const [id, ds] of Object.entries(UPRIGHT_SHAPES)) {
  const group = shapes[id];
  if (!group) {
    console.error(`shapes: UPRIGHT_SHAPES names '${id}', which has no artwork. Check scripts/upright-shapes.mjs against scripts/svg-shape-map.mjs.`);
    process.exit(1);
  }
  for (const d of ds) {
    const matches = group.filter((s) => s.kind === 'path' && s.d === d);
    if (matches.length === 0) {
      console.error(
        `shapes: UPRIGHT_SHAPES lists a path for '${id}' that its SVG no longer contains:\n  ${d}\n` +
        'The symbol was probably redrawn. Update scripts/upright-shapes.mjs to the new path data ' +
        '— do NOT edit the SVG in assets/shapes/, which is the source of truth.',
      );
      process.exit(1);
    }
    for (const shape of matches) shape.upright = true;
  }
}

/**
 * Shapes below the floor the drawing is seen from, drawn at half opacity (see
 * `Shape.belowDeck`). Only the elevator's upper-floor drawing has any: from the
 * mezzanine only its top third is on your level. The artwork is already split
 * there, so a shape whose top is at or below `fromCell` (cells from the top)
 * is below the deck.
 */
const BELOW_DECK = {
  'BP_ConveyorBelt_Elevator#haut': { fromCell: 1 },
};

/** Topmost y of a shape, in cells. Path numbers are raw viewBox units; V and H
 * take a single coordinate, so numbers are not always x/y pairs. */
function topOfShape(shape) {
  if (shape.kind === 'rect') return shape.y;
  let min = Infinity;
  for (const [, cmd, body] of shape.d.matchAll(/([MLCSQTAHVmlcsqtahv])([^MLCSQTAHVZmlcsqtahvz]*)/g)) {
    const nums = (body.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const upper = cmd.toUpperCase();
    if (upper === 'H') continue;                       // x only
    if (upper === 'V') { for (const n of nums) min = Math.min(min, n); continue; }
    for (let i = 1; i < nums.length; i += 2) min = Math.min(min, nums[i]);
  }
  return min === Infinity ? 0 : min / DIVISOR;
}

for (const [key, { fromCell }] of Object.entries(BELOW_DECK)) {
  const group = shapes[key];
  if (!group) {
    console.error(`shapes: BELOW_DECK names '${key}', which has no artwork.`);
    process.exit(1);
  }
  let marked = 0;
  for (const shape of group) {
    if (topOfShape(shape) >= fromCell - 1e-9) { shape.belowDeck = true; marked++; }
  }
  // A drawing that no longer splits at that line was redrawn: fail.
  if (marked === 0 || marked === group.length) {
    console.error(
      `shapes: '${key}' has ${marked} of ${group.length} shapes below cell ${fromCell} — expected some of each. ` +
      'The artwork was probably redrawn; check where its floor line now falls.',
    );
    process.exit(1);
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ divisor: DIVISOR, shapes }, null, 2) + '\n', 'utf8');

const shapeCounts = Object.entries(shapes).map(([id, s]) => `  ${id}: ${s.length} shape(s)`);
console.log(`shapes: ${svgFilenames.length} SVGs -> ${Object.keys(shapes).length} catalogue ids, divisor ${DIVISOR}`);
if (droppedIconCount > 0) {
  console.log(`shapes: ${droppedIconCount} file(s) had an embedded raster icon glyph dropped on purpose — src/render/renderer.ts draws the standalone PNG from src/data/icons.ts on top instead, so nothing is actually missing`);
}
for (const line of shapeCounts) console.log(line);
