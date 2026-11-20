/**
 * A reserved area: a rectangle a player draws to keep floor space free for
 * things the catalogue does not carry (stations, desks, walkways).
 *
 * A zone is a placement, so selection, moves, copy, paste and undo all work on
 * it. Its size travels in the object id, `zone-<w>x<h>`, and the catalogue
 * answers for any such id (see `getCatalogue`). It is kept out of the
 * catalogue's own list: it is not a game object.
 */

export const ZONE_PREFIX = 'zone-';

/**
 * The longest side a zone may have, in cells (the widest warehouse is 70).
 * A bound: ids come from strangers' plans and footprints are enumerated cell
 * by cell, so a huge zone would hang the tab.
 */
export const MAX_ZONE_SIDE = 70;

const ZONE_ID = /^zone-([1-9]\d{0,2})x([1-9]\d{0,2})$/;

/** The object id of a `w` by `h` zone. */
export function zoneObjectId(w: number, h: number): string {
  return `${ZONE_PREFIX}${w}x${h}`;
}

/** The size a zone id names, or null for anything that is not a zone id,
 * including one out of bounds. */
export function zoneSize(objectId: string): { w: number; h: number } | null {
  const match = ZONE_ID.exec(objectId);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (w > MAX_ZONE_SIDE || h > MAX_ZONE_SIDE) return null;
  return { w, h };
}

export const isZone = (objectId: string): boolean => zoneSize(objectId) !== null;
