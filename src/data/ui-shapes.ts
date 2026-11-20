import type { Shape } from '@/core/types';
import generated from './generated/ui-shapes.json';

/**
 * Drawings that belong to the editor rather than a placeable object: the door arrow
 * (assets/ui/Flèche.svg). Built by scripts/build-ui-shapes.mjs with the object shape parser,
 * so editing the SVG is enough.
 */
export const UI_SHAPE_DIVISOR: number = generated.divisor;

/** The arrow through a door's opening, pointing up in its own frame; the renderer turns it
 * to face the way parcels travel. */
export const DOOR_ARROW: readonly Shape[] = generated.shapes['Flèche'] as Shape[];
