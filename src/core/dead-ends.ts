import type { Graph, ResolvedPort } from './graph';

/**
 * Where a parcel would fall off the line: objects whose every exit opens on
 * nothing that takes it (no belt facing it, no door).
 *
 * An object with only some exits unwired is not one: the game never sends a
 * parcel down a splitter arm or a diverter way with nothing in front of it,
 * and a country diverter's unused sides are normal. Only when nothing at all
 * leads on is the parcel lost. On two real saves of 911 and 3215 objects this
 * finds nothing but one elevator stored on the wrong floor.
 *
 * Racks are not: they keep parcels by design and have no exit. Doors are
 * fixtures, not placements, and never reported.
 */
export function deadEnds(graph: Pick<Graph, 'ports' | 'danglingOutputs'>): ResolvedPort[] {
  const exits = new Map<string, number>();
  for (const port of graph.ports) {
    if (port.dir === 'out' && !port.placementId.startsWith('door:')) {
      exits.set(port.placementId, (exits.get(port.placementId) ?? 0) + 1);
    }
  }
  const loose = new Map<string, ResolvedPort[]>();
  for (const port of graph.danglingOutputs) {
    if (port.placementId.startsWith('door:')) continue;
    loose.set(port.placementId, [...(loose.get(port.placementId) ?? []), port]);
  }
  return [...loose].flatMap(([id, ports]) => (ports.length === exits.get(id) ? ports : []));
}
