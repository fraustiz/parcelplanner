import type { LegendEntry } from '@/core/legend';
import { cameraFitting, CELL_PX } from './camera';
import {
  DARK_SCENE, drawLegend, drawScene, legendHeight,
  type Draw2D, type DrawOptions, type LegendOptions,
} from './renderer';

/**
 * A floor of a plan as a picture: a title, the whole building and the legend beside it.
 * Drawn by `drawScene` through the canvas, since the SVG behind link previews cannot carry the
 * scanners' icons. Laid out here, away from the DOM, so it can be tested; src/components/export-image.ts
 * loads and saves.
 */

/** Pixels per cell: the renderer drops icons below 12, and a 70-cell building stays under 2000px. */
export const EXPORT_CELL = 24;
/** Room around the building, in cells: the doors hang three cells outside
 * the walls, as on a link's preview card. */
const MARGIN_CELLS = 4;
const TITLE_HEIGHT = 72;
/** Wide enough that the longest object name, in French, wraps onto two lines
 * and no more. */
const LEGEND_WIDTH = 360;

export interface ExportInput {
  /** The scene minus camera and size, which the picture decides, and minus the editor's live state. */
  scene: Omit<DrawOptions, 'camera' | 'width' | 'height' | 'highlight' | 'selectedIds' | 'marquee' | 'parcels' | 'trail'>;
  /** The whole building's bounding box across every floor, so both floors
   * of the regional warehouse come out at the same scale. */
  dims: { w: number; h: number };
  entries: readonly LegendEntry[];
  legend: Omit<LegendOptions, 'palette'>;
  title: string;
  subtitle: string;
  footer: string;
}

/** The picture's size in CSS pixels, before any device-pixel scaling. The
 * legend's names are needed because a long one wraps, and makes it taller. */
export function exportSize(
  dims: { w: number; h: number },
  entries: readonly LegendEntry[],
  text: (entry: LegendEntry) => string,
): {
  width: number; height: number;
  plan: { width: number; height: number };
  legend: { width: number; height: number };
} {
  const plan = {
    width: (dims.w + MARGIN_CELLS * 2) * EXPORT_CELL,
    height: (dims.h + MARGIN_CELLS * 2) * EXPORT_CELL,
  };
  const legend = { width: LEGEND_WIDTH, height: legendHeight(entries, LEGEND_WIDTH, text) };
  return {
    width: plan.width + legend.width,
    // A long legend makes the picture taller rather than running off it.
    height: TITLE_HEIGHT + Math.max(plan.height, legend.height),
    plan,
    legend,
  };
}

export function drawExportImage(ctx: Draw2D, input: ExportInput): void {
  const palette = input.scene.palette ?? DARK_SCENE;
  const { width, height, plan, legend } = exportSize(input.dims, input.entries, input.legend.text);

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = palette.legendInk;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(input.title, 24, 38);
  ctx.fillStyle = palette.ruler;
  ctx.font = '14px sans-serif';
  ctx.fillText(input.subtitle, 24, 60);

  const camera = cameraFitting(input.dims, plan.width, plan.height, MARGIN_CELLS);
  ctx.save();
  ctx.translate(0, TITLE_HEIGHT);
  drawScene(ctx, {
    ...input.scene,
    camera,
    width: plan.width,
    height: plan.height,
    highlight: null,
    selectedIds: [],
    marquee: null,
  });
  ctx.restore();

  drawLegend(ctx, input.entries, { x: plan.width, y: TITLE_HEIGHT, width: legend.width }, {
    ...input.legend,
    palette,
  });

  ctx.fillStyle = palette.ruler;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(input.footer, width - 20, height - 14);
}

/** Exposed for the tests: the scale the building is drawn at. */
export const EXPORT_ZOOM = EXPORT_CELL / CELL_PX;
