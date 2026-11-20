import { CELL_PX, type Camera } from './camera';

/**
 * Pan and pinch, as a pure function of where the fingers were and where they are now.
 * Free of DOM types so the gesture arithmetic is testable without a phone.
 */

/** The same limits the wheel already obeys, so a phone and a mouse cannot
 * reach zoom levels the other cannot. */
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 3;

export interface TouchPoint { x: number; y: number }

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

const midpoint = (points: readonly TouchPoint[]): TouchPoint => ({
  x: (points[0].x + points[1].x) / 2,
  y: (points[0].y + points[1].y) / 2,
});

const spread = (points: readonly TouchPoint[]): number =>
  Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

/**
 * Moves `camera` so the world stays attached to the fingers: one finger pans, two pinch and pan.
 * A change in finger count moves nothing, so lifting one finger of a pinch is not read as a swipe.
 */
export function cameraAfterTouch(
  camera: Camera,
  from: readonly TouchPoint[],
  to: readonly TouchPoint[],
): Camera {
  if (from.length !== to.length) return camera;

  if (from.length === 1) {
    // Content follows the finger, so the camera travels the opposite way, in
    // cells, hence dividing by the on-screen size of one.
    const size = CELL_PX * camera.zoom;
    return {
      ...camera,
      x: camera.x - (to[0].x - from[0].x) / size,
      y: camera.y - (to[0].y - from[0].y) / size,
    };
  }

  if (from.length !== 2) return camera;

  const wasApart = spread(from);
  // Both fingers on one pixel: no ratio to be had, so treat it as a pure pan
  // rather than dividing by zero.
  const ratio = wasApart === 0 ? 1 : spread(to) / wasApart;
  const zoom = clampZoom(camera.zoom * ratio);

  // Anchor the world point between the fingers to their new midpoint; this also covers the
  // two-finger pan, with no separate translation step.
  const was = midpoint(from);
  const now = midpoint(to);
  const anchorX = camera.x + was.x / (CELL_PX * camera.zoom);
  const anchorY = camera.y + was.y / (CELL_PX * camera.zoom);

  return {
    zoom,
    x: anchorX - now.x / (CELL_PX * zoom),
    y: anchorY - now.y / (CELL_PX * zoom),
  };
}
