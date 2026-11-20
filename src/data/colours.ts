import type { CatalogEntry } from '@/core/types';
import type { TranslationKey } from '@/i18n';

/**
 * Painting a placed object. The artwork is never edited: at draw time one source colour, per
 * family, is substituted (a conveyor's blue flanks, a rack's red uprights).
 */

/**
 * The colours a player may choose from, in picker order.
 *
 * Frozen like SHARE_OBJECT_IDS: a shared link stores a colour by its index, so reordering or
 * removing one repaints every shared layout. Append only.
 *
 * #044abe and #ae302e are the artwork's own conveyor blue and rack red, so choosing one on its
 * own family gives the original back. The substitution is case-insensitive.
 */
export const OBJECT_COLOURS: readonly string[] = [
  '#ae302e',
  '#cb551b',
  '#cbc11b',
  '#75bb59',
  '#044abe',
  '#bf0083',
  '#d0d0d1',
  '#121110',
];

/** What each swatch is called, for a screen reader and the tooltip. */
export const COLOUR_NAMES: Readonly<Record<string, TranslationKey>> = {
  '#ae302e': 'colour.red',
  '#cb551b': 'colour.orange',
  '#cbc11b': 'colour.yellow',
  '#75bb59': 'colour.green',
  '#044abe': 'colour.blue',
  '#bf0083': 'colour.magenta',
  '#d0d0d1': 'colour.lightGrey',
  '#121110': 'colour.black',
};

/**
 * The colour a family's artwork uses for the part that gets repainted: `#044ABE` appears only in
 * conveyors and routers, `#AE302E` only in the six rack variants. `#B84F4E` is left out because
 * the scanners share it.
 */
const REPAINTED: Readonly<Record<string, string>> = {
  conveyor: '#044ABE',
  router: '#044ABE',
  storage: '#AE302E',
  /** A reserved zone is a plain rectangle, drawn in this grey until painted (the dark scene's
   * `zone`, see src/render/renderer.ts). */
  zone: '#8D949E',
};

/**
 * The colour in `entry`'s artwork that a chosen colour replaces, or null when it cannot be painted.
 * Scanners cannot: their blue identifies the machine.
 */
export function repaintableColourOf(entry: CatalogEntry): string | null {
  return REPAINTED[entry.category] ?? null;
}

/** Whether `colour` is one this app offers. Checked on colours from shared links and localStorage. */
export const isObjectColour = (colour: string): boolean =>
  OBJECT_COLOURS.includes(colour.toLowerCase());
