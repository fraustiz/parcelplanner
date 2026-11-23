import { warehouseDimensions } from '@/core/grid';
import type { Plan } from '@/core/types';
import { getCatalogue } from '@/data/catalogue';
import { repaintableColourOf } from '@/data/colours';
import { DOORS } from '@/data/doors';
import { doorsOf } from '@/core/door-cargo';
import { CARGO_TYPE_ICONS, COUNTRY_DOOR_ICON, OBJECT_ICONS } from '@/data/icons';
import { shapesFor, SHAPE_DIVISOR } from '@/data/shapes';
import { STAIRS } from '@/data/stairs';
import { DOOR_ARROW, UI_SHAPE_DIVISOR } from '@/data/ui-shapes';
import { ownedGeometry, ownedTiersOf } from '@/data/warehouse-tiers';
import { WAREHOUSES } from '@/data/warehouses';
import { cameraFitting } from '@/render/camera';
import { drawScene } from '@/render/renderer';
import { createSvgDraw } from '@/render/svg-draw';
import { summarise } from './plan-summary';

/**
 * The preview image a `/s/<id>` link unfurls into, drawn by the editor's own `drawScene`
 * through the SVG `Draw2D`, so the card always matches the editor.
 * A preview cannot be panned, so it shows the busiest warehouse and floor, framed whole.
 */

/**
 * Empty space around the building, in cells. Doors and reject bins reach three cells past the
 * walls in both warehouses (pinned by the framing test), so five leaves a little air.
 */
const MARGIN_CELLS = 5;

/** The floor of `warehouse` with the most on it, ties going to the ground. */
export function busiestFloorOf(plan: Plan, warehouse: Plan['warehouse']): number {
  const counts = new Map<number, number>();
  for (const placement of plan.placements) {
    if (placement.warehouse !== warehouse) continue;
    counts.set(placement.floor, (counts.get(placement.floor) ?? 0) + 1);
  }

  let best = 0;
  let most = 0;
  // Ascending, so `>` alone breaks ties towards the lower floor.
  for (const floor of [...counts.keys()].sort((a, b) => a - b)) {
    const count = counts.get(floor) ?? 0;
    if (count > most) { most = count; best = floor; }
  }
  return best;
}

export function planCardSvg(plan: Plan, width: number, height: number): string {
  const warehouse = summarise(plan).busiest;
  const floor = busiestFloorOf(plan, warehouse);

  // drawScene draws the plan's `warehouse` field, so the busiest one is set on the plan it gets.
  const framed: Plan = { ...plan, warehouse };

  const geometry = WAREHOUSES;
  // Framed on the bounding box of every floor, so the building's scale does not depend on the floor shown.
  const dims = warehouseDimensions(warehouse, geometry);

  const ctx = createSvgDraw();
  drawScene(ctx, {
    plan: framed,
    catalogue: getCatalogue(),
    camera: cameraFitting(dims, width, height, MARGIN_CELLS),
    width,
    height,
    floor,
    highlight: null,
    selectedIds: [],
    marquee: null,
    geometry,
    unlocked: ownedGeometry(ownedTiersOf(plan)),
    // English: the reader's language is unknown from a stored plan.
    shapes: (id, floorOffset) => shapesFor(id, { locale: 'en', floorOffset }),
    shapeDivisor: SHAPE_DIVISOR,
    icons: new Map(Object.entries(OBJECT_ICONS)),
    cargoIcons: new Map(Object.entries(CARGO_TYPE_ICONS)),
    countryIcon: COUNTRY_DOOR_ICON,
    doors: doorsOf(DOORS, plan),
    doorArrow: DOOR_ARROW,
    doorArrowDivisor: UI_SHAPE_DIVISOR,
    stairs: STAIRS,
    repaintableColourOf,
  });

  return ctx.toSvg(width, height, BACKGROUND);
}

/** The editor's own background, so a card looks like the app it links to. */
const BACKGROUND = '#0d1117';
