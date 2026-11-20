import type { Shape } from '@/core/types';
import generated from './generated/shapes.json';

interface ShapeSheet {
  /** SVG viewBox units per grid cell. `path` `d` strings stay in raw units (see `Shape` in
   * src/core/types.ts). */
  divisor: number;
  shapes: Record<string, Shape[]>;
}

const sheet = generated as ShapeSheet;

let cache: Map<string, Shape[]> | null = null;

/** The object artwork, keyed by catalogue id. Memoised. An object without an entry is drawn
 * as a plain rectangle by src/render/renderer.ts. */
export function getShapes(): Map<string, Shape[]> {
  if (cache) return cache;
  cache = new Map(Object.entries(sheet.shapes));
  return cache;
}

/** See the `divisor` field doc above. */
export const SHAPE_DIVISOR = sheet.divisor;

/**
 * The artwork to draw for `id`, picking a variant by context (see VARIANTS in
 * scripts/svg-shape-map.mjs); objects without variants fall through to their only drawing.
 *   - Storage racks: 'fr' or 'en', by interface language.
 *   - Vertical elevator: 'bas' on its own floor, 'haut' from the floor above. `floorOffset` is
 *     the viewed floor minus the placement's.
 */
export function shapesFor(
  id: string,
  { locale, floorOffset = 0 }: { locale: 'en' | 'fr'; floorOffset?: number },
): Shape[] | undefined {
  const sheet = getShapes();
  return sheet.get(`${id}#${locale}`)
    ?? sheet.get(`${id}#${floorOffset > 0 ? 'haut' : 'bas'}`)
    ?? sheet.get(id);
}
