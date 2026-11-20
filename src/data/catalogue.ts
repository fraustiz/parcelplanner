import type { CatalogEntry } from '@/core/types';
import { zoneSize } from '@/core/zone';
import generated from './generated/catalogue.json';
import { PORTS } from './ports';

let cache: Map<string, CatalogEntry> | null = null;

/**
 * The entry for a reserved zone of the size its id names. Cached, so the same id always
 * returns the same object and memos keyed on it stay stable.
 */
const zones = new Map<string, CatalogEntry>();
function zoneEntry(id: string): CatalogEntry | undefined {
  const known = zones.get(id);
  if (known) return known;
  const footprint = zoneSize(id);
  if (!footprint) return undefined;
  const entry: CatalogEntry = {
    id,
    displayName: { en: 'Reserved area', fr: 'Zone réservée' },
    category: 'zone',
    footprint,
    // Free, not unpriced: a null would raise the "some prices are missing" warning.
    price: 0,
    upgradePrice: null,
    maxTier: 1,
    ports: [],
  };
  zones.set(id, entry);
  return entry;
}

/**
 * The game's objects, which also answers for any reserved zone (its size is in its id, see
 * src/core/zone.ts). `get` and `has` know zones; iteration does not, so lists and counts see only objects.
 */
class Catalogue extends Map<string, CatalogEntry> {
  override get(id: string): CatalogEntry | undefined {
    return super.get(id) ?? zoneEntry(id);
  }

  override has(id: string): boolean {
    return super.has(id) || zoneSize(id) !== null;
  }
}

/** The catalogue, with hand-authored ports merged in. Memoised. */
export function getCatalogue(): Map<string, CatalogEntry> {
  if (cache) return cache;
  const map = new Catalogue();
  for (const raw of generated as CatalogEntry[]) {
    map.set(raw.id, { ...raw, ports: PORTS[raw.id] ?? [] });
  }
  cache = map;
  return map;
}
