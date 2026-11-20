/**
 * assets/ui/*.svg -> src/data/generated/ui-shapes.json
 *
 * Editor drawings that are not placeable objects (the door arrow), parsed like
 * object shapes but kept apart because build-shapes.mjs checks against the
 * catalogue. A build step, so editing the SVG is enough to change the drawing.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIVISOR, parseSvg } from './shape-parser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = join(here, '..', 'assets', 'ui');
const outFile = join(here, '..', 'src', 'data', 'generated', 'ui-shapes.json');

const shapes = {};
for (const filename of readdirSync(uiDir).filter((f) => f.endsWith('.svg'))) {
  const key = basename(filename, '.svg');
  shapes[key] = parseSvg(readFileSync(join(uiDir, filename), 'utf8'), filename);
  console.log(`  ${key}: ${shapes[key].length} shape(s)`);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ divisor: DIVISOR, shapes }, null, 2) + '\n', 'utf8');
console.log(`ui shapes -> ${outFile}`);
