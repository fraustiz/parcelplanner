import { isZone } from './zone';
import type { CatalogEntry, Door, Plan } from './types';

/**
 * The legend rows drawn beside an exported image of one floor. It covers only
 * what is on the picture: the exported floor of the building being viewed.
 */
export type LegendEntry =
  | { kind: 'object'; objectId: string; count: number }
  /** Zones of the same name and colour share one row. */
  | { kind: 'zone'; label?: string; colour?: string; count: number }
  | { kind: 'door'; look: DoorLook }
  /** A cargo-type logo stamped on an export door's bay. */
  | { kind: 'cargo'; type: string }
  /** The flag on a door that sorts by destination country. */
  | { kind: 'country' };

/**
 * The three door colours. `exit` covers cargo-type and country export doors,
 * drawn alike as in doorLook (src/render/renderer.ts); an export door
 * accepting no cargo type is the reject bin.
 */
export type DoorLook = 'delivery' | 'exit' | 'reject';

const DOOR_ORDER: readonly DoorLook[] = ['delivery', 'exit', 'reject'];

/**
 * The legend for `floor` of the building `plan` is viewing.
 *
 * Objects come most numerous first, then by id, so the order is stable. The
 * vertical elevator also counts on the floor above, where it is drawn.
 */
export function legendOf(
  plan: Plan,
  floor: number,
  catalogue: Map<string, CatalogEntry>,
  doors: readonly Door[],
): LegendEntry[] {
  const objects = new Map<string, number>();
  const zones = new Map<string, { label?: string; colour?: string; count: number }>();

  for (const p of plan.placements) {
    if (p.warehouse !== plan.warehouse) continue;
    const entry = catalogue.get(p.objectId);
    if (!entry) continue;
    const here = p.floor === floor || (entry.spansTheFloorAbove === true && floor === p.floor + 1);
    if (!here) continue;

    if (isZone(p.objectId)) {
      const key = `${p.label ?? ''}\u0000${p.colour ?? ''}`;
      const seen = zones.get(key);
      zones.set(key, {
        ...(p.label === undefined ? {} : { label: p.label }),
        ...(p.colour === undefined ? {} : { colour: p.colour }),
        count: (seen?.count ?? 0) + 1,
      });
      continue;
    }
    objects.set(p.objectId, (objects.get(p.objectId) ?? 0) + 1);
  }

  const looks = new Set<DoorLook>();
  const cargo: string[] = [];
  let country = false;
  for (const door of doors) {
    if (door.warehouse !== plan.warehouse || door.floor !== floor) continue;
    if (door.kind === 'delivery') { looks.add('delivery'); continue; }
    if (door.kind === 'country-export') { looks.add('exit'); country = true; continue; }
    const types = door.cargoTypes ?? [];
    if (types.length === 0) { looks.add('reject'); continue; }
    looks.add('exit');
    for (const type of types) if (!cargo.includes(type)) cargo.push(type);
  }

  return [
    ...[...objects]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([objectId, count]): LegendEntry => ({ kind: 'object', objectId, count })),
    ...[...zones.values()]
      .sort((a, b) => b.count - a.count || (a.label ?? '').localeCompare(b.label ?? ''))
      .map((zone): LegendEntry => ({ kind: 'zone', ...zone })),
    ...DOOR_ORDER.filter((look) => looks.has(look)).map((look): LegendEntry => ({ kind: 'door', look })),
    ...cargo.map((type): LegendEntry => ({ kind: 'cargo', type })),
    ...(country ? [{ kind: 'country' } as const] : []),
  ];
}
