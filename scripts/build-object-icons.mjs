import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the palette's icon manifest by listing public/objects/. To add an
 * icon, name the SVG after its catalogue id (`BP_ConveyorBelt_Splitter.svg`);
 * it is served as authored through a plain <img>. A file matching no catalogue
 * id fails the build, since it would otherwise never appear.
 */

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', 'public', 'objects');
const catalogueFile = join(here, '..', 'src', 'data', 'generated', 'catalogue.json');
const outFile = join(here, '..', 'src', 'data', 'generated', 'object-icons.json');

// FModel/PowerShell exports sometimes carry a leading UTF-8 BOM; JSON.parse rejects it.
const catalogue = JSON.parse(readFileSync(catalogueFile, 'utf8').replace(/^﻿/, ''));
const catalogueIds = new Set(catalogue.map((e) => e.id));

// Icons are optional, so a missing directory is fine.
const files = existsSync(iconsDir)
  ? readdirSync(iconsDir).filter((f) => extname(f).toLowerCase() === '.svg')
  : [];

const icons = {};
const unknown = [];
for (const file of files) {
  const id = basename(file, extname(file));
  if (!catalogueIds.has(id)) {
    unknown.push(file);
    continue;
  }
  icons[id] = `/objects/${file}`;
}

if (unknown.length > 0) {
  console.error(
    `object-icons: ${unknown.length} file(s) in public/objects/ are named after no catalogue object:\n` +
    unknown.map((f) => `  ${f}`).join('\n') +
    '\nRename each one to its catalogue id (e.g. BP_ConveyorBelt_Splitter.svg). ' +
    'Run `npm run catalogue` first if you expected the id to exist.',
  );
  process.exit(1);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(icons, null, 2) + '\n', 'utf8');
console.log(`object-icons: ${Object.keys(icons).length} SVG icon(s) from public/objects/`);
