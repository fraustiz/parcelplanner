import { describe, it, expect } from 'vitest';
import { CELL_PX, worldToScreen, type Camera } from './camera';
import { cameraAfterTouch, MAX_ZOOM, MIN_ZOOM } from './touch-gestures';

const camera: Camera = { x: 10, y: 10, zoom: 1 };

/** Which world point sits under a screen pixel: what a gesture keeps still under the fingers. */
const worldUnder = (c: Camera, px: number, py: number) => ({
  x: c.x + px / (CELL_PX * c.zoom),
  y: c.y + py / (CELL_PX * c.zoom),
});

describe('one finger', () => {
  it('drags the layout along with the finger', () => {
    // Content follows the finger, so the camera moves the opposite way. Get
    // this backwards and the map runs away from the thumb.
    const moved = cameraAfterTouch(camera, [{ x: 100, y: 100 }], [{ x: 132, y: 100 }]);
    expect(moved.x).toBeCloseTo(10 - 1, 5); // 32px right = one cell at zoom 1
    expect(moved.y).toBeCloseTo(10, 5);
  });

  it('moves less world for the same swipe when zoomed in', () => {
    const zoomed = cameraAfterTouch({ ...camera, zoom: 2 }, [{ x: 0, y: 0 }], [{ x: 64, y: 0 }]);
    expect(zoomed.x).toBeCloseTo(10 - 1, 5); // 64px at zoom 2 is still one cell
  });

  it('leaves the zoom alone', () => {
    expect(cameraAfterTouch(camera, [{ x: 0, y: 0 }], [{ x: 50, y: 50 }]).zoom).toBe(1);
  });

  it('keeps the point under the finger under the finger', () => {
    const before = worldUnder(camera, 100, 80);
    const moved = cameraAfterTouch(camera, [{ x: 100, y: 80 }], [{ x: 140, y: 30 }]);
    const after = worldUnder(moved, 140, 30);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });
});

describe('two fingers', () => {
  const apart = (gap: number, at = 200) => [
    { x: at - gap / 2, y: 100 },
    { x: at + gap / 2, y: 100 },
  ];

  it('zooms in as the fingers spread', () => {
    expect(cameraAfterTouch(camera, apart(100), apart(200)).zoom).toBeCloseTo(2, 5);
  });

  it('zooms out as the fingers close', () => {
    expect(cameraAfterTouch(camera, apart(200), apart(100)).zoom).toBeCloseTo(0.5, 5);
  });

  it('keeps the point between the fingers between the fingers', () => {
    // The property that makes a pinch feel attached to the map rather than to
    // the screen. Without it the layout slides away as you zoom.
    const before = worldUnder(camera, 200, 100);
    const moved = cameraAfterTouch(camera, apart(100, 200), apart(240, 200));
    const after = worldUnder(moved, 200, 100);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('pans and zooms at once when the fingers also travel', () => {
    // Two fingers spreading and sliding: the world point that was between them
    // must end up between them at their new place.
    const before = worldUnder(camera, 200, 100);
    const moved = cameraAfterTouch(camera, apart(100, 200), apart(200, 320));
    const after = worldUnder(moved, 320, 100);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('will not zoom past the limits the wheel already obeys', () => {
    expect(cameraAfterTouch({ ...camera, zoom: MAX_ZOOM }, apart(100), apart(1000)).zoom)
      .toBe(MAX_ZOOM);
    expect(cameraAfterTouch({ ...camera, zoom: MIN_ZOOM }, apart(1000), apart(10)).zoom)
      .toBe(MIN_ZOOM);
  });

  it('survives two fingers landing on the same pixel', () => {
    // A real hazard: touchstart can report both points identically, and the
    // spread ratio would be a division by zero.
    const moved = cameraAfterTouch(camera, apart(0), apart(100));
    expect(Number.isFinite(moved.zoom)).toBe(true);
    expect(Number.isFinite(moved.x)).toBe(true);
    expect(moved.zoom).toBeGreaterThan(0);
  });
});

describe('changes in how many fingers are down', () => {
  it('does nothing when a finger joins or leaves', () => {
    // Lifting one finger of a pinch would otherwise be read as an enormous
    // one-finger swipe, and the map would jump. The caller re-anchors instead.
    const lifted = cameraAfterTouch(camera, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }]);
    expect(lifted).toEqual(camera);

    const joined = cameraAfterTouch(camera, [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(joined).toEqual(camera);
  });

  it('ignores no fingers at all, and more than two', () => {
    expect(cameraAfterTouch(camera, [], [])).toEqual(camera);
    const three = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    expect(cameraAfterTouch(camera, three, three.map((p) => ({ x: p.x + 50, y: p.y })))).toEqual(camera);
  });
});
