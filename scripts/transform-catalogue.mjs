import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBJECT_NAMES_FR } from './object-names-fr.mjs';
import { OBJECT_BASE_PRICES } from './object-base-prices.mjs';
import { MAX_UPGRADE_TIER, OBJECT_UPGRADE_PRICES } from './object-upgrade-prices.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, '..', 'data', 'raw');
const outFile = join(here, '..', 'src', 'data', 'generated', 'catalogue.json');

/** FModel/PowerShell exports sometimes carry a leading UTF-8 BOM; JSON.parse rejects it. */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

/**
 * Measured footprints, all 1 wide x 3 tall. Too small a footprint would let a
 * layout fit the planner and not the game.
 *   - Bridger, CountryDiverter2, the three racks, Speedway, Elevator: measured
 *     from the object artwork (viewBox 12x36, see scripts/svg-shape-map.mjs).
 *   - Speedway and Elevator also match the blueprint geometry: Speedway spans
 *     Y=-100..+100 like the Bridger, and the elevator platform sits at Y=+100,
 *     a whole cell from centre (a 2-cell object would put it at +/-50).
 * WIDE below is kept only to record which objects the game marks
 * `IsWidePlaceable`; every non-1x1 object is measured here.
 */
const CONFIRMED_FOOTPRINTS = {
  BP_ConveyorBelt_Bridger: { w: 1, h: 3 },
  BP_ConveyorBelt_CountryDiverter2: { w: 1, h: 3 },
  BP_ConveyorBelt_Speedway: { w: 1, h: 3 },
  BP_ConveyorBelt_Elevator: { w: 1, h: 3 },

  BP_StorageRack_Medium: { w: 1, h: 3 },
  BP_StorageRack_Large: { w: 1, h: 3 },
  BP_StorageRack_ExtraLarge: { w: 1, h: 3 },
};

/**
 * Cells an object passes over rather than stands on, as offsets into its
 * unrotated footprint (see `CatalogEntry.bridgedCells`). Only the Bridger's
 * middle cell is raised; both ramps collide normally.
 */
const BRIDGED_CELLS = {
  BP_ConveyorBelt_Bridger: [{ x: 0, y: 1 }],
};

/**
 * Objects marked BPI_GridPlaceable.IsWidePlaceable in the game data. The 2x1
 * fallback applies only to one with no entry in CONFIRMED_FOOTPRINTS.
 */
const WIDE = new Set([
  'BP_ConveyorBelt_CountryDiverter2',
  'BP_ConveyorBelt_Elevator',
  'BP_ConveyorBelt_Speedway',
  'BP_StorageRack_Medium',
  'BP_StorageRack_Large',
  'BP_StorageRack_ExtraLarge',
]);

function categoryOf(id) {
  if (id.includes('CriteriaScanner') || id.includes('Scanner')) return 'scanner';
  if (id.includes('Diverter') || id.includes('Splitter') || id.includes('Joiner')) return 'router';
  if (id.includes('StorageRack') || id.includes('Pallet')) return 'storage';
  if (id.includes('ConveyorBelt')) return 'conveyor';
  if (id.includes('InspectTable') || id.includes('Scales') || id.includes('Keypad')) return 'station';
  return 'decor';
}

/**
 * Product scope: only the conveyor and sorting system (conveyors, scanners,
 * routing pieces, storage racks). shop-items.json stays the full extraction;
 * this filter keeps furniture and decoration out of catalogue.json.
 * Stations and decor are excluded by category. Explicit exclusions:
 *   - The pallets: classified 'storage' but they are furniture; only racks are
 *     sorting-graph sinks.
 *   - BP_SerialNumberScanner: a desk device. The conveyor scanner is
 *     BP_ConveyorBelt_CriteriaScanner_SerialNumber, which is kept.
 */
const EXCLUDED_CATEGORIES = new Set(['station', 'decor']);
const EXCLUDED_IDS = new Set([
  'BP_Pallet',
  'BP_PalletMedium',
  'BP_PalletLarge',
  'BP_SerialNumberScanner',
]);

function isExcluded(id) {
  return EXCLUDED_IDS.has(id) || EXCLUDED_CATEGORIES.has(categoryOf(id));
}

/**
 * Objects newer than the extraction. Kept here, not in shop-items.json, so
 * hand-entered data stays separate from extracted data; an extraction that
 * contains the id takes precedence.
 */
const PENDING_EXTRACTION = [];

/** Inserts each pending object after its neighbour: the palette follows this order. */
function withPendingObjects(items) {
  const extracted = new Set(items.map((i) => i.id));
  let out = items;
  for (const { after, item } of PENDING_EXTRACTION) {
    if (extracted.has(item.id)) continue;
    const at = out.findIndex((i) => i.id === after);
    const insert = at === -1 ? out.length : at + 1;
    out = [...out.slice(0, insert), item, ...out.slice(insert)];
  }
  return out;
}

const shop = withPendingObjects(readJson(join(raw, 'shop-items.json')));

const kept = shop.filter((item) => !isExcluded(item.id));
const excluded = shop.filter((item) => isExcluded(item.id));

const entries = kept.map((item) => {
  const id = item.id;
  const name = item.displayName ?? id;
  const entry = {
    id,
    // Falls back to the English name, not the raw id; reported below.
    displayName: { en: name, fr: OBJECT_NAMES_FR[id] ?? name },
    category: categoryOf(id),
    footprint: CONFIRMED_FOOTPRINTS[id] ?? (WIDE.has(id) ? { w: 2, h: 1 } : { w: 1, h: 1 }),
    // Overrides win: the extraction is a snapshot of a game still being balanced.
    price: OBJECT_BASE_PRICES[id] ?? (typeof item.price === 'number' ? item.price : null),
    // Extracted UpgradePrice wins; most objects lack one and use the community
    // sheet (see object-upgrade-prices.mjs).
    upgradePrice: typeof item.upgradePrice === 'number'
      ? item.upgradePrice
      : (OBJECT_UPGRADE_PRICES[id] ?? null),
    ports: [],
  };
  // No upgrade price means no upgrades (racks, country diverter); everything
  // else shares BP_ConveyorBelt.MaxUpgradeTier.
  entry.maxTier = entry.upgradePrice === null ? 1 : MAX_UPGRADE_TIER;
  if (BRIDGED_CELLS[id]) entry.bridgedCells = BRIDGED_CELLS[id];
  // The elevator reaches through the floor above (see src/core/types.ts).
  if (id === 'BP_ConveyorBelt_Elevator') entry.spansTheFloorAbove = true;
  if (typeof item.speed === 'number') entry.speed = item.speed;
  return entry;
});

// A French name for an id not in the catalogue is a typo or a leftover: fail.
const keptIds = new Set(entries.map((e) => e.id));
const strayNames = Object.keys(OBJECT_NAMES_FR).filter((id) => !keptIds.has(id));
if (strayNames.length > 0) {
  console.error(
    `catalogue: scripts/object-names-fr.mjs names ${strayNames.length} object(s) that are not in the catalogue:\n` +
    strayNames.map((id) => `  ${id}`).join('\n'),
  );
  process.exit(1);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(entries, null, 2) + '\n', 'utf8');

// A missing French name is only a warning; the English name is shown instead.
const untranslated = entries.filter((e) => !(e.id in OBJECT_NAMES_FR));
if (untranslated.length > 0) {
  console.warn(`catalogue: ${untranslated.length} objet(s) sans nom francais (nom anglais utilise a la place):`);
  for (const e of untranslated) console.warn(`  ${e.id}`);
}

const stillPending = PENDING_EXTRACTION.filter((p) => entries.some((e) => e.id === p.item.id));
if (stillPending.length > 0) {
  console.warn(`catalogue: ${stillPending.length} objet(s) ajoute(s) a la main, absents de l'extraction:`);
  for (const p of stillPending) console.warn(`  ${p.item.id}`);
}

const priced = entries.filter((e) => e.price !== null).length;
console.log(`catalogue: ${entries.length} objets gardes, ${excluded.length} exclus (postes/decor/pallets/scanner de bureau), ${priced} avec un prix`);
console.log('objets gardes:');
for (const e of entries) console.log(`  ${e.id}`);
