import type { Cell } from '@/core/types';

/** Pixels per grid cell at zoom 1. */
export const CELL_PX = 32;

export interface Camera { x: number; y: number; zoom: number }

export function worldToScreen(camera: Camera, cell: Cell): { px: number; py: number } {
  return {
    px: (cell.x - camera.x) * CELL_PX * camera.zoom,
    py: (cell.y - camera.y) * CELL_PX * camera.zoom,
  };
}

export function screenToCell(camera: Camera, px: number, py: number): Cell {
  const size = CELL_PX * camera.zoom;
  return {
    x: Math.floor(px / size + camera.x),
    y: Math.floor(py / size + camera.y),
  };
}

/**
 * `camera` at `zoom`, keeping the world point under `at` (canvas pixels) in place.
 * An unchanged zoom returns the camera as is, so float error cannot creep the view at a clamp.
 */
export function cameraZoomedAt(camera: Camera, at: { x: number; y: number }, zoom: number): Camera {
  if (zoom === camera.zoom) return camera;
  const anchorX = camera.x + at.x / (CELL_PX * camera.zoom);
  const anchorY = camera.y + at.y / (CELL_PX * camera.zoom);
  return {
    zoom,
    x: anchorX - at.x / (CELL_PX * zoom),
    y: anchorY - at.y / (CELL_PX * zoom),
  };
}

/**
 * `camera` panned just enough that `cell` plus `margin` cells is inside the view; a cell
 * already in view leaves it unchanged. A too-small view centres on the cell; a zero-size view is left alone.
 */
export function cameraShowing(
  camera: Camera,
  cell: Cell,
  width: number,
  height: number,
  margin: number = 1,
): Camera {
  if (width <= 0 || height <= 0) return camera;
  const size = CELL_PX * camera.zoom;
  const follow = (from: number, at: number, span: number): number => {
    const cells = span / size;
    if (cells < 1 + margin * 2) return at + 0.5 - cells / 2;
    if (at - margin < from) return at - margin;
    if (at + 1 + margin > from + cells) return at + 1 + margin - cells;
    return from;
  };
  const x = follow(camera.x, cell.x, width);
  const y = follow(camera.y, cell.y, height);
  return x === camera.x && y === camera.y ? camera : { ...camera, x, y };
}

/**
 * The camera that shows a whole `dims` area inside `width` by `height`, centred, fitting by
 * the tighter axis so the building is never cropped (used for link preview cards).
 * `margin` is in cells so it scales with the zoom; it lives here because fitting a larger box
 * alone would shift the building off-centre.
 */
export function cameraFitting(
  dims: { w: number; h: number },
  width: number,
  height: number,
  margin: number = 0,
): Camera {
  const w = Math.max(1, dims.w) + margin * 2;
  const h = Math.max(1, dims.h) + margin * 2;
  // Guards a degenerate area against dividing by zero.
  const zoom = Math.min(width / Math.max(1, w * CELL_PX), height / Math.max(1, h * CELL_PX));

  const size = CELL_PX * zoom;
  // Camera x/y are in cells; negative means the origin sits that far in from the left.
  // Centring the margined box puts the building's corner one margin further in.
  return {
    x: -((width - w * size) / 2) / size - margin,
    y: -((height - h * size) / 2) / size - margin,
    zoom,
  };
}

/** Cell bounds to draw, with a one-cell margin so wide objects are not clipped. */
export function visibleCellRange(
  camera: Camera,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const topLeft = screenToCell(camera, 0, 0);
  const bottomRight = screenToCell(camera, width, height);
  return {
    minX: topLeft.x - 1,
    minY: topLeft.y - 1,
    maxX: bottomRight.x + 1,
    maxY: bottomRight.y + 1,
  };
}
