/**
 * Shapes that stay the right way round when their object is mirrored: labels
 * painted inside the SVG, which read wrong backwards. PNG icons (src/data/icons.ts)
 * are drawn outside the mirror transform and need no entry.
 *
 * Keyed by `d` string, not index, so reordered layers still match;
 * build-shapes.mjs fails if a `d` matches nothing. Declared by hand because
 * black strokes are usually direction arrows, which must mirror. The source
 * SVGs are not edited to encode this.
 */
export const UPRIGHT_SHAPES = {
  // The sticker checker's screen shows a tick, a cross, and the slash between
  // them: what it decided about a parcel, not which way anything moves.
  BP_ConveyorBelt_Scanner2_Tier1: [
    'M3 5L4 6',  // tick, short arm
    'M5 3L4 6',  // tick, long arm
    'M9 3L3 9',  // slash separating the two symbols
    'M9 7L7 9',  // cross, one stroke
    'M9 9L7 7',  // cross, the other
  ],
};
