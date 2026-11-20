import { describe, it, expect } from 'vitest';
import { CELL_PX, cameraFitting, cameraShowing, cameraZoomedAt, worldToScreen, screenToCell, visibleCellRange } from './camera';

const camera = { x: 0, y: 0, zoom: 1 };

describe('worldToScreen', () => {
  it('puts the origin cell at the origin pixel', () => {
    expect(worldToScreen(camera, { x: 0, y: 0 })).toEqual({ px: 0, py: 0 });
  });

  it('advances one cell width per cell', () => {
    expect(worldToScreen(camera, { x: 2, y: 0 }).px).toBe(2 * CELL_PX);
  });

  it('scales with zoom', () => {
    expect(worldToScreen({ ...camera, zoom: 2 }, { x: 1, y: 0 }).px).toBe(2 * CELL_PX);
  });

  it('shifts with the camera', () => {
    expect(worldToScreen({ ...camera, x: 1 }, { x: 1, y: 0 }).px).toBe(0);
  });
});

describe('screenToCell', () => {
  it('inverts worldToScreen', () => {
    const cell = { x: 5, y: 7 };
    const { px, py } = worldToScreen(camera, cell);
    expect(screenToCell(camera, px, py)).toEqual(cell);
  });

  it('floors a position inside a cell to that cell', () => {
    expect(screenToCell(camera, CELL_PX * 3 + 5, CELL_PX * 2 + 5)).toEqual({ x: 3, y: 2 });
  });

  it('inverts correctly when zoomed and panned', () => {
    const c = { x: 2.5, y: -1.5, zoom: 1.75 };
    const cell = { x: 9, y: 4 };
    const { px, py } = worldToScreen(c, cell);
    expect(screenToCell(c, px + 1, py + 1)).toEqual(cell);
  });
});

describe('visibleCellRange', () => {
  it('covers the viewport with a one-cell margin', () => {
    const r = visibleCellRange(camera, CELL_PX * 10, CELL_PX * 5);
    expect(r.minX).toBe(-1);
    expect(r.maxX).toBe(11);
    expect(r.maxY).toBe(6);
  });
});

describe('cameraFitting', () => {
  const dims = { w: 70, h: 70 };

  it('shows the whole warehouse', () => {
    const camera = cameraFitting(dims, 1200, 630);
    const topLeft = worldToScreen(camera, { x: 0, y: 0 });
    const bottomRight = worldToScreen(camera, { x: dims.w, y: dims.h });
    expect(topLeft.px).toBeGreaterThanOrEqual(-0.01);
    expect(topLeft.py).toBeGreaterThanOrEqual(-0.01);
    expect(bottomRight.px).toBeLessThanOrEqual(1200.01);
    expect(bottomRight.py).toBeLessThanOrEqual(630.01);
  });

  it('centres what it shows, rather than pinning it to a corner', () => {
    // A square warehouse in a 1200x630 card leaves a wide margin, which must be split evenly.
    const camera = cameraFitting(dims, 1200, 630);
    const left = worldToScreen(camera, { x: 0, y: 0 }).px;
    const right = 1200 - worldToScreen(camera, { x: dims.w, y: dims.h }).px;
    expect(left).toBeCloseTo(right, 5);
  });

  it('fits by the tighter axis, so nothing is cropped', () => {
    // 630 tall for 70 cells is the binding constraint, not 1200 wide.
    const camera = cameraFitting(dims, 1200, 630);
    expect(camera.zoom).toBeCloseTo(630 / (70 * CELL_PX), 5);
  });

  it('leaves a margin, measured in cells so it scales with the fit', () => {
    const camera = cameraFitting(dims, 1200, 630, 2);
    expect(worldToScreen(camera, { x: 0, y: 0 }).py).toBeCloseTo(2 * CELL_PX * camera.zoom, 5);
  });

  it('keeps the building centred once a margin is added', () => {
    // Fitting a box two cells bigger would leave the whole margin on one side.
    const camera = cameraFitting(dims, 1200, 630, 2);
    const left = worldToScreen(camera, { x: 0, y: 0 }).px;
    const right = 1200 - worldToScreen(camera, { x: dims.w, y: dims.h }).px;
    expect(left).toBeCloseTo(right, 5);
  });

  it('never returns a zoom of zero, whatever it is handed', () => {
    // An empty warehouse, or a viewport of almost nothing, must still produce
    // a drawable camera rather than a division by zero.
    expect(cameraFitting({ w: 0, h: 0 }, 1200, 630).zoom).toBeGreaterThan(0);
    expect(cameraFitting(dims, 10, 10).zoom).toBeGreaterThan(0);
  });
});

describe('cameraZoomedAt', () => {
  // The world position, in fractional cells, under a canvas pixel.
  const worldAt = (c: { x: number; y: number; zoom: number }, px: number, py: number) => ({
    x: c.x + px / (CELL_PX * c.zoom),
    y: c.y + py / (CELL_PX * c.zoom),
  });

  it('keeps the point under the cursor where it was', () => {
    // Zooming goes toward the pointer, not toward the grid's corner.
    const c = { x: 2.5, y: -1.5, zoom: 1 };
    const before = worldAt(c, 400, 250);
    const after = worldAt(cameraZoomedAt(c, { x: 400, y: 250 }, 2), 400, 250);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('holds the point when zooming out as well as in', () => {
    const c = { x: -4, y: 7, zoom: 2.5 };
    const before = worldAt(c, 120, 600);
    const after = worldAt(cameraZoomedAt(c, { x: 120, y: 600 }, 0.5), 120, 600);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('lands on the zoom it is given', () => {
    expect(cameraZoomedAt({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 10 }, 1.1).zoom).toBe(1.1);
  });

  it('does not move at all when the zoom does not change', () => {
    // At a clamp the wheel asks for the zoom it already has; the view must
    // not drift a fraction of a cell with each notch.
    const c = { x: 3, y: 4, zoom: 3 };
    expect(cameraZoomedAt(c, { x: 500, y: 300 }, 3)).toEqual(c);
  });
});

describe('cameraShowing', () => {
  // 10 by 5 cells at zoom 1.
  const W = 10 * CELL_PX;
  const H = 5 * CELL_PX;

  it('leaves the camera alone while the cell is in view', () => {
    const start = { x: 0, y: 0, zoom: 1 };
    expect(cameraShowing(start, { x: 4, y: 2 }, W, H)).toBe(start);
  });

  it('pans just far enough to bring a cell past the right edge into view', () => {
    const moved = cameraShowing({ x: 0, y: 0, zoom: 1 }, { x: 12, y: 2 }, W, H);
    expect(moved).toEqual({ x: 4, y: 0, zoom: 1 });
  });

  it('pans back for a cell above or left of the view, keeping a margin', () => {
    expect(cameraShowing({ x: 5, y: 5, zoom: 1 }, { x: 5, y: 5 }, W, H)).toEqual({ x: 4, y: 4, zoom: 1 });
  });

  it('scales with zoom', () => {
    const moved = cameraShowing({ x: 0, y: 0, zoom: 2 }, { x: 6, y: 0 }, W, H, 0);
    expect(moved.x).toBe(2); // 5 cells wide at zoom 2
  });

  it('centres the cell in a view too small for its margin', () => {
    const moved = cameraShowing({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 0 }, 2 * CELL_PX, H);
    expect(moved.x).toBe(9.5);
  });

  it('does nothing before the view has a size', () => {
    const start = { x: 0, y: 0, zoom: 1 };
    expect(cameraShowing(start, { x: 99, y: 99 }, 0, 0)).toBe(start);
  });
});
