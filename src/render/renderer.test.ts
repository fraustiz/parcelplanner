import { describe, it, expect } from 'vitest';
import { DOOR_ARROW, UI_SHAPE_DIVISOR } from '@/data/ui-shapes';
import { drawScene, type Draw2D, type DrawOptions, DARK_SCENE, LIGHT_SCENE } from './renderer';
import { CELL_PX } from './camera';
import type { CatalogEntry, Door, Plan, Shape } from '@/core/types';
import { COUNTRY_DIVERTER } from '@/core/diverters';
import { getCatalogue } from '@/data/catalogue';

interface Call {
  op: string;
  args: (number | string)[];
  fill: string;
  stroke: string;
  /** Only meaningful for 'fillText' calls; carried on every call like fill/stroke. */
  align: string;
  baseline: string;
  /** Only meaningful for 'strokePath' calls; carried on every call likewise. */
  cap: string;
  /** Only meaningful for stroke calls; recorded on every call so tests see the lineWidth a stroke inherits. */
  lineWidthAtCall: number;
  /** globalAlpha in force at the call, for asserting the belowDeck fade. */
  alpha: number;
}

function recorder(): Draw2D & { calls: Call[] } {
  const calls: Call[] = [];
  const stub = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt' as const, globalAlpha: 1,
    font: '', textAlign: 'left' as const, textBaseline: 'top' as const, calls,
    fillRect(...args: number[]) { calls.push({ op: 'fillRect', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    strokeRect(...args: number[]) { calls.push({ op: 'strokeRect', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    beginPath() {},
    moveTo(...args: number[]) { calls.push({ op: 'moveTo', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    lineTo(...args: number[]) { calls.push({ op: 'lineTo', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    closePath() {},
    fill() { calls.push({ op: 'fill', args: [], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    stroke() { calls.push({ op: 'stroke', args: [], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    fillText(text: string, x: number, y: number) {
      calls.push({ op: 'fillText', args: [text, x, y], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha });
    },
    save() { calls.push({ op: 'save', args: [], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    restore() { calls.push({ op: 'restore', args: [], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    translate(...args: number[]) { calls.push({ op: 'translate', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    scale(...args: number[]) { calls.push({ op: 'scale', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    clipRect(...args: number[]) { calls.push({ op: 'clipRect', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    rotate(...args: number[]) { calls.push({ op: 'rotate', args, fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    fillPath(d: string) { calls.push({ op: 'fillPath', args: [d], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    strokePath(d: string) { calls.push({ op: 'strokePath', args: [d], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
    drawImage(path: string, ...rest: number[]) { calls.push({ op: 'drawImage', args: [path, ...rest], fill: stub.fillStyle, stroke: stub.strokeStyle, align: stub.textAlign, baseline: stub.textBaseline, cap: stub.lineCap, lineWidthAtCall: stub.lineWidth, alpha: stub.globalAlpha }); },
  };
  return stub as unknown as Draw2D & { calls: Call[] };
}

const COLOURS_OBJECT_FADED = 'rgba(91, 141, 239, 0.18)';

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const catalogue = new Map([[belt.id, belt]]);

// Mirrors src/data/warehouses.ts's WAREHOUSES; see the identical fixture in grid.test.ts for
// why it is declared locally.
const geometry = {
  main: [
    [
      { x: 0, y: 0, w: 20, h: 20 },
      { x: 20, y: 0, w: 30, h: 40 },
    ],
  ],
  second: [
    [{ x: 0, y: 0, w: 70, h: 60 }],
    [{ x: 0, y: 0, w: 70, h: 30 }],
  ],
};

const plan: Plan = {
  gameVersion: 'test', warehouse: 'main',
  placements: [
    { id: 'ground', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1 },
  ],
};

const options = (over: Partial<DrawOptions> = {}): DrawOptions => ({
  plan, catalogue,
  camera: { x: 0, y: 0, zoom: 1 },
  width: CELL_PX * 8, height: CELL_PX * 8,
  floor: 0, highlight: null, selectedIds: [],
  geometry,
  // Nothing masked by default: the whole building is buildable.
  unlocked: geometry,
  // No artwork by default, so tests exercise the plain-rectangle fallback unless they opt in.
  // A function, not a map: the real caller resolves an object's variant first.
  shapes: () => undefined,
  shapeDivisor: 12,
  // No icons by default, so tests exercise the no-icon path unless they opt in.
  icons: new Map<string, string>(),
  // The real CARGO_TYPE_ICONS map, mirrored. Populated by default: keyed by cargo type, it only
  // affects door tests, which want the real mapping.
  cargoIcons: new Map<string, string>([
    ['Road', '/cargo_types/road_icon.png'],
    ['Rail', '/cargo_types/rail_icon.png'],
    ['Air', '/cargo_types/air_icon.png'],
    ['Maritime', '/cargo_types/maritime_icon.png'],
  ]),
  // No doors by default.
  doors: [] as readonly Door[],
  stairs: [] as DrawOptions['stairs'],
  repaintableColourOf: (e: CatalogEntry) => (e.category === 'storage' ? '#AE302E' : e.category === 'scanner' ? null : '#044ABE'),
  doorArrow: DOOR_ARROW,
  doorArrowDivisor: UI_SHAPE_DIVISOR,
  // No box selection by default: it is a live gesture.
  marquee: null,
  ...over,
});

describe('drawScene', () => {
  it('fills the background before anything else', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    expect(ctx.calls[0]?.op).toBe('fillRect');
  });

  it('fills a rect for each placed object', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    const atCell = ctx.calls.filter(
      (c) => c.op === 'fillRect' && c.args[0] === 2 * CELL_PX + 1 && c.args[1] === 2 * CELL_PX + 1,
    );
    expect(atCell).toHaveLength(1);
  });

  it('draws a wide object across both of its cells', () => {
    const wide: CatalogEntry = { ...belt, id: 'wide', footprint: { w: 2, h: 1 } };
    const ctx = recorder();
    drawScene(ctx, options({
      catalogue: new Map([[wide.id, wide]]),
      plan: { ...plan, placements: [{ id: 'w', objectId: 'wide', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1 }] },
    }));
    const cells = ctx.calls.filter((c) => c.op === 'fillRect' && c.args[1] === 1);
    expect(cells.length).toBeGreaterThanOrEqual(2);
  });

  describe('object artwork', () => {
    const artRect: Shape = { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#123456' };
    const artFillPath: Shape = { kind: 'path', d: 'M0 0L1 1', fill: '#abcdef' };
    const artStrokePath: Shape = { kind: 'path', d: 'M0 0L1 1', stroke: 'black', cap: 'round', strokeWidth: 1 };

    it('draws an object\'s real artwork instead of the plain rectangle when shapes exist for its id', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect, artFillPath, artStrokePath] : undefined),
      }));

      // No plain-rectangle fill at the object's cell: artwork replaces it.
      const plainFill = ctx.calls.find(
        (c) => c.op === 'fillRect' && c.args[0] === 2 * CELL_PX + 1 && c.args[1] === 2 * CELL_PX + 1,
      );
      expect(plainFill).toBeUndefined();

      // The rect shape: fillRect scaled by the on-screen cell size, offset
      // by the object's own translate() (checked in the next assertion).
      expect(ctx.calls.some((c) => c.op === 'translate' && c.args[0] === 2 * CELL_PX && c.args[1] === 2 * CELL_PX)).toBe(true);
      expect(ctx.calls.some((c) => c.op === 'fillRect' && c.fill === '#123456' && c.args[2] === CELL_PX && c.args[3] === CELL_PX)).toBe(true);

      // The fill path: scaled by size/divisor, then fillPath'd with the raw d string.
      const fillPathCall = ctx.calls.find((c) => c.op === 'fillPath');
      expect(fillPathCall?.args[0]).toBe('M0 0L1 1');
      expect(fillPathCall?.fill).toBe('#abcdef');

      // The stroke path uses its declared cap and its own strokeWidth, never the lineWidth a
      // previous draw left on the context.
      const strokePathCall = ctx.calls.find((c) => c.op === 'strokePath');
      expect(strokePathCall?.args[0]).toBe('M0 0L1 1');
      expect(strokePathCall?.stroke).toBe('black');
      expect(strokePathCall?.cap).toBe('round');
      expect(strokePathCall?.lineWidthAtCall).toBe(1);
    });

    it('does not flip the artwork when the placement is not mirrored', () => {
      const ctx = recorder();
      drawScene(ctx, options({ shapes: (id: string) => (id === 'belt' ? [artRect] : undefined) }));
      expect(ctx.calls.some((c) => c.op === 'scale' && c.args[0] === -1)).toBe(false);
    });

    it('flips the artwork horizontally for a mirrored placement', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect] : undefined),
        plan: { ...plan, placements: [{ ...plan.placements[0]!, mirrored: true }] },
      }));
      // scale(-1, 1): flipped across x only, never squashed or flipped in y.
      const flip = ctx.calls.find((c) => c.op === 'scale' && c.args[0] === -1);
      expect(flip?.args[1]).toBe(1);
    });

    it('applies the flip after the rotation, so mirror-then-rotate composes as it does in the port table', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect] : undefined),
        plan: { ...plan, placements: [{ ...plan.placements[0]!, rotation: 90, mirrored: true }] },
      }));
      // A canvas composes transforms in reverse, so the flip pushed after rotate() applies before
      // the rotation, matching placedPort's mirror-then-rotate order (src/core/grid.ts).
      const rotateIndex = ctx.calls.findIndex((c) => c.op === 'rotate' && c.args[0] !== 0);
      const flipIndex = ctx.calls.findIndex((c) => c.op === 'scale' && c.args[0] === -1);
      expect(rotateIndex).toBeGreaterThanOrEqual(0);
      expect(flipIndex).toBeGreaterThan(rotateIndex);
    });

    it('never mirrors the object\'s logo, only its artwork', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect] : undefined),
        icons: new Map([['belt', '/criteria/weight-icon.png']]),
        plan: { ...plan, placements: [{ ...plan.placements[0]!, mirrored: true }] },
      }));
      // The icon has its own transform block after the artwork's restore(), so no scale(-1) applies.
      const iconIndex = ctx.calls.findIndex((c) => c.op === 'drawImage');
      const flipIndex = ctx.calls.findIndex((c) => c.op === 'scale' && c.args[0] === -1);
      const restoreAfterFlip = ctx.calls.findIndex((c, i) => i > flipIndex && c.op === 'restore');
      expect(iconIndex).toBeGreaterThan(restoreAfterFlip);
    });

    it('counter-flips an `upright` shape so a mirrored machine\'s symbols still read forwards', () => {
      // The sticker checker's tick and cross are labels on the machine, so they survive a mirror
      // unreversed. Flagged at build time (scripts/upright-shapes.mjs): black strokes elsewhere are arrows.
      const symbol: Shape = { kind: 'path', d: 'M3 5L4 6', stroke: 'black', strokeWidth: 1, upright: true };
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect, symbol] : undefined),
        plan: { ...plan, placements: [{ ...plan.placements[0]!, mirrored: true }] },
      }));
      // Two flips in effect for the symbol, one for the plain rect: the
      // second cancels the first, leaving the symbol as originally drawn.
      const flips = ctx.calls.filter((c) => c.op === 'scale' && c.args[0] === -1);
      expect(flips).toHaveLength(2);
      // The counter-flip is about the artwork's own width, so the symbol keeps its position too.
      const undo = ctx.calls.find((c) => c.op === 'translate' && c.args[0] === CELL_PX && c.args[1] === 0);
      expect(undo).toBeDefined();
    });

    it('leaves an `upright` shape alone when the placement is not mirrored', () => {
      const symbol: Shape = { kind: 'path', d: 'M3 5L4 6', stroke: 'black', strokeWidth: 1, upright: true };
      const ctx = recorder();
      drawScene(ctx, options({ shapes: (id: string) => (id === 'belt' ? [symbol] : undefined) }));
      expect(ctx.calls.some((c) => c.op === 'scale' && c.args[0] === -1)).toBe(false);
    });

    it('regression: a second placement\'s arrow keeps its own stroke width even when the first one is selected', () => {
      // Selecting a conveyor sets lineWidth = 2 for its outline; the next conveyor's arrow must not
      // inherit it, so drawShapeGroup sets its own lineWidth before stroking.
      const thinArrow: Shape = { kind: 'path', d: 'M0 0L1 1', stroke: 'black', strokeWidth: 1 };
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [thinArrow] : undefined),
        plan: {
          ...plan,
          placements: [
            { id: 'first', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1 },
            { id: 'second', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 2, y: 4 }, rotation: 0, tier: 1 },
          ],
        },
        // 'first' is selected, so its outline sets lineWidth=2 right before 'second' is drawn.
        selectedIds: ['first'],
      }));

      const strokePathCalls = ctx.calls.filter((c) => c.op === 'strokePath');
      expect(strokePathCalls).toHaveLength(2);
      for (const call of strokePathCalls) {
        expect(call.lineWidthAtCall).toBe(1);
      }
    });

    it('falls back to the plain rectangle when no shapes exist for the object\'s id', () => {
      const ctx = recorder();
      // Default options() shapes map is empty: 'belt' has no artwork.
      drawScene(ctx, options());

      const plainFill = ctx.calls.find(
        (c) => c.op === 'fillRect' && c.args[0] === 2 * CELL_PX + 1 && c.args[1] === 2 * CELL_PX + 1 && c.fill === '#5b8def',
      );
      expect(plainFill).toBeDefined();
      expect(ctx.calls.some((c) => c.op === 'fillPath' || c.op === 'strokePath')).toBe(false);
    });

    it('draws the artwork before the drag highlight, which still paints last', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artFillPath] : undefined),
        highlight: { cells: [{ x: 5, y: 5 }], valid: true },
      }));

      const artworkIndex = ctx.calls.findIndex((c) => c.op === 'fillPath');
      const highlightIndex = ctx.calls.length - 1;
      expect(artworkIndex).toBeGreaterThanOrEqual(0);
      expect(ctx.calls[highlightIndex]?.fill).toContain('86, 204, 128');
      expect(highlightIndex).toBeGreaterThan(artworkIndex);
    });

    it('shows the drag preview\'s artwork too', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        plan: { ...plan, placements: [] },
        shapes: (id: string) => (id === 'belt' ? [artRect] : undefined),
        highlight: {
          cells: [{ x: 3, y: 3 }],
          valid: true,
          preview: [{ objectId: 'belt', cell: { x: 3, y: 3 }, rotation: 0 }],
        },
      }));
      expect(ctx.calls.some((c) => c.op === 'fillRect' && c.fill === '#123456')).toBe(true);
    });

    it('emits artwork for a rotated placement, with the rotate() call in the right place and save/restore balanced', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artRect] : undefined),
        plan: {
          ...plan,
          placements: [{ id: 'ground', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 90, tier: 1 }],
        },
      }));

      // A rotated placement must still draw the real artwork, not fall back
      // to the plain rectangle.
      expect(ctx.calls.some((c) => c.op === 'fillRect' && c.fill === '#123456')).toBe(true);

      const rotateCall = ctx.calls.find((c) => c.op === 'rotate');
      expect(rotateCall).toBeDefined();
      expect(rotateCall!.args[0]).toBeCloseTo(Math.PI / 2, 10); // 90deg clockwise, in radians

      // drawShapeGroup's transform is translate, translate, rotate, translate: rotate sits just
      // before the last one.
      const rotateIndex = ctx.calls.findIndex((c) => c.op === 'rotate');
      const before = ctx.calls.slice(0, rotateIndex).filter((c) => c.op === 'translate');
      const after = ctx.calls.slice(rotateIndex + 1).filter((c) => c.op === 'translate');
      expect(before.length).toBeGreaterThanOrEqual(2);
      expect(after.length).toBeGreaterThanOrEqual(1);

      const saves = ctx.calls.filter((c) => c.op === 'save').length;
      const restores = ctx.calls.filter((c) => c.op === 'restore').length;
      expect(saves).toBe(restores);
      expect(saves).toBeGreaterThan(0);
    });

    it('rotates a 1x3 object at rotation 90 so its artwork lands exactly on the 3 cells coveredCells reports', () => {
      // A 1x3 rect spanning the whole unrotated footprint (x:0,y:0,w:1,h:3),
      // so its fillRect args are the artwork's own local corners (0,0) and
      // (size, 3*size) before drawShapeGroup's outer transform is applied.
      const tallRect: Shape = { kind: 'rect', x: 0, y: 0, w: 1, h: 3, fill: '#654321' };
      const tall: CatalogEntry = { ...belt, id: 'tall', footprint: { w: 1, h: 3 } };
      const placement = {
        id: 'p', objectId: 'tall', warehouse: 'main' as const, floor: 0,
        cell: { x: 2, y: 2 }, rotation: 90 as const, tier: 1,
      };
      const ctx = recorder();
      drawScene(ctx, options({
        catalogue: new Map([[tall.id, tall]]),
        plan: { ...plan, placements: [placement] },
        shapes: (id: string) => (id === tall.id ? [tallRect] : undefined),
      }));

      const fillIndex = ctx.calls.findIndex((c) => c.op === 'fillRect' && c.fill === '#654321');
      expect(fillIndex).toBeGreaterThan(0);
      const rectArgs = ctx.calls[fillIndex]!.args as number[];

      // The transform calls between this object's save() and its fillRect: translate(anchor),
      // translate(half rotated box), rotate(theta), translate(-half unrotated box).
      const saveIndex = ctx.calls.slice(0, fillIndex).map((c) => c.op).lastIndexOf('save');
      const transformCalls = ctx.calls.slice(saveIndex + 1, fillIndex);
      expect(transformCalls.map((c) => c.op)).toEqual(['translate', 'translate', 'rotate', 'translate']);

      // Replay the ops onto a local point as a canvas would: each op right-multiplies the CTM, so
      // the most recent op applies first.
      const applyCTM = (x0: number, y0: number): [number, number] => {
        let x = x0;
        let y = y0;
        for (let i = transformCalls.length - 1; i >= 0; i--) {
          const c = transformCalls[i]!;
          if (c.op === 'translate') {
            x += c.args[0] as number;
            y += c.args[1] as number;
          } else if (c.op === 'rotate') {
            const theta = c.args[0] as number;
            const cos = Math.cos(theta);
            const sin = Math.sin(theta);
            const nx = x * cos - y * sin;
            const ny = x * sin + y * cos;
            x = nx;
            y = ny;
          }
        }
        return [x, y];
      };

      const [rx, ry, rw, rh] = rectArgs;
      const corners = [
        applyCTM(rx, ry),
        applyCTM(rx + rw, ry),
        applyCTM(rx, ry + rh),
        applyCTM(rx + rw, ry + rh),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);

      // coveredCells for this 1x3 object at rotation 90 (anchor (2,2)) are (2,2),(3,2),(4,2):
      // on screen x:[2*CELL_PX, 5*CELL_PX), y:[2*CELL_PX, 3*CELL_PX).
      expect(Math.min(...xs)).toBeCloseTo(2 * CELL_PX, 5);
      expect(Math.max(...xs)).toBeCloseTo(5 * CELL_PX, 5);
      expect(Math.min(...ys)).toBeCloseTo(2 * CELL_PX, 5);
      expect(Math.max(...ys)).toBeCloseTo(3 * CELL_PX, 5);
    });

    it('draws the icon after the artwork', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artFillPath] : undefined),
        icons: new Map([['belt', '/criteria/weight-icon.png']]),
      }));
      const artworkIndex = ctx.calls.findIndex((c) => c.op === 'fillPath');
      const iconIndex = ctx.calls.findIndex((c) => c.op === 'drawImage');
      expect(artworkIndex).toBeGreaterThanOrEqual(0);
      expect(iconIndex).toBeGreaterThan(artworkIndex);
      expect(ctx.calls[iconIndex]!.args[0]).toBe('/criteria/weight-icon.png');
    });

    it('does not draw the icon below the minimum zoom threshold', () => {
      const ctx = recorder();
      drawScene(ctx, options({
        shapes: (id: string) => (id === 'belt' ? [artFillPath] : undefined),
        icons: new Map([['belt', '/criteria/weight-icon.png']]),
        camera: { x: 0, y: 0, zoom: 0.3 }, // size = 32 * 0.3 = 9.6px, below the 12px floor
      }));
      expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    });

    it('draws no icon for an object with no mapped icon', () => {
      const ctx = recorder();
      drawScene(ctx, options({ shapes: (id: string) => (id === 'belt' ? [artFillPath] : undefined) }));
      expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    });
  });

  it('paints a valid highlight green and an invalid one red', () => {
    const green = recorder();
    drawScene(green, options({ highlight: { cells: [{ x: 5, y: 5 }], valid: true } }));
    const red = recorder();
    drawScene(red, options({ highlight: { cells: [{ x: 5, y: 5 }], valid: false } }));

    const last = (ctx: ReturnType<typeof recorder>) =>
      ctx.calls.filter((c) => c.op === 'fillRect').at(-1)?.fill;

    expect(last(green)).not.toBe(last(red));
    expect(last(green)).toContain('86, 204, 128');
    expect(last(red)).toContain('232, 96, 76');
  });

  it('draws the highlight last so it sits above objects', () => {
    const ctx = recorder();
    drawScene(ctx, options({ highlight: { cells: [{ x: 2, y: 2 }], valid: true } }));
    expect(ctx.calls.at(-1)?.fill).toContain('86, 204, 128');
  });

  describe('objects on another floor', () => {
    const art = (id: string) =>
      id === 'belt' ? [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#123456' } as Shape] : undefined;
    const on = (floor: number, x: number, y: number) => ({
      id: 'other', objectId: 'belt', warehouse: 'second' as const,
      floor, cell: { x, y }, rotation: 0 as const, tier: 1,
    });
    // Wide enough to contain the cells below, past the mezzanine's edge at y=30, so these tests
    // are about what a floor hides rather than about off-screen cells.
    const WIDE = { width: 50 * CELL_PX, height: 50 * CELL_PX };
    const scene = (viewedFloor: number, placement: ReturnType<typeof on>) => {
      const ctx = recorder();
      drawScene(ctx, options({
        plan: { ...plan, warehouse: 'second', placements: [placement] },
        floor: viewedFloor,
        shapes: art,
        ...WIDE,
      }));
      return ctx;
    };

    it('draws their real artwork at half opacity, not an anonymous blue rectangle', () => {
      // (2,40) is past the mezzanine's far edge at y=30, so the ground floor
      // is visible there from upstairs.
      const ctx = scene(1, on(0, 2, 40));
      const drawn = ctx.calls.find((c) => c.fill === '#123456');
      expect(drawn).toBeDefined();
      expect(drawn?.alpha).toBe(0.5);
      expect(ctx.calls.some((c) => c.fill === COLOURS_OBJECT_FADED)).toBe(false);
    });

    it('hides a lower floor where a deck covers it', () => {
      // The mezzanine spans y 0..29, so from up there the deck hides the ground floor beneath it.
      const ctx = scene(1, on(0, 2, 10));
      expect(ctx.calls.some((c) => c.fill === '#123456')).toBe(false);
    });

    it('clips each visible cell, so an object straddling the deck edge is half shown', () => {
      const tall: CatalogEntry = { ...belt, id: 'belt', footprint: { w: 1, h: 3 } };
      const ctx = recorder();
      drawScene(ctx, options({
        catalogue: new Map([['belt', tall]]),
        plan: { ...plan, warehouse: 'second', placements: [on(0, 2, 29)] },
        floor: 1,
        shapes: art,
        ...WIDE,
      }));
      // Covers y 29, 30 and 31; only 30 and 31 are past the mezzanine's edge.
      const clips = ctx.calls.filter((c) => c.op === 'clipRect');
      expect(clips).toHaveLength(2);
      expect(clips.map((c) => c.args[1])).toEqual([30 * CELL_PX, 31 * CELL_PX]);
    });

    it('draws nothing at all for a floor ABOVE the one being viewed', () => {
      // You cannot see through a ceiling, so the upper floor is not drawn from below. The fade
      // applies only the other way: a floor below is seen over the deck's edge.
      const ctx = scene(0, on(1, 2, 10));
      expect(ctx.calls.some((c) => c.fill === '#123456')).toBe(false);
    });
  });

  // The canvas draws no validation-issue outline: the only outline is the selection ring, so an
  // unselected placement draws no stroke, issue or not (issues show in StatusBar.tsx).
  it('draws no outline for an unselected placement, even one a validator would flag as having an issue', () => {
    const ctx = recorder();
    // The default fixture's lone placement fails validation (no ports), but drawScene only
    // knows about `selectedIds`.
    drawScene(ctx, options());
    expect(ctx.calls.some((c) => c.op === 'strokeRect')).toBe(false);
  });

  it('outlines the selected placement in gold, regardless of any validation issue', () => {
    const ctx = recorder();
    drawScene(ctx, options({ selectedIds: ['ground'] }));
    const outlines = ctx.calls.filter((c) => c.op === 'strokeRect');
    expect(outlines).toHaveLength(1);
    expect(outlines[0]?.stroke).toBe('#f5c65b');
  });

  it('paints a bridging object after the ones it spans, so it is never covered up', () => {
    const bridge: CatalogEntry = {
      ...belt, id: 'bridge', footprint: { w: 1, h: 3 }, bridgedCells: [{ x: 0, y: 1 }],
    };
    const ctx = recorder();
    drawScene(ctx, options({
      catalogue: new Map([[belt.id, belt], [bridge.id, bridge]]),
      // The bridge comes first in the plan, so plan order alone would paint the belt over it.
      plan: {
        ...plan,
        placements: [
          { id: 'span', objectId: 'bridge', warehouse: 'main', floor: 0, cell: { x: 4, y: 4 }, rotation: 0, tier: 1 },
          { id: 'under', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 4, y: 5 }, rotation: 0, tier: 1 },
        ],
      },
      shapes: (id: string) => (id === 'bridge' ? [{ kind: 'rect', x: 0, y: 0, w: 1, h: 3, fill: '#bbbbbb' } as Shape] : id === 'belt' ? [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#123456' } as Shape] : undefined),
    }));
    const beltIndex = ctx.calls.findIndex((c) => c.fill === '#123456');
    const bridgeIndex = ctx.calls.findIndex((c) => c.fill === '#bbbbbb');
    expect(beltIndex).toBeGreaterThanOrEqual(0);
    expect(bridgeIndex).toBeGreaterThan(beltIndex);
  });

  describe('an object that reaches up through the floor above', () => {
    const lift: CatalogEntry = {
      ...belt, id: 'lift', footprint: { w: 1, h: 3 }, spansTheFloorAbove: true,
    };
    const onGround = {
      id: 'e', objectId: 'lift', warehouse: 'main' as const, floor: 0,
      cell: { x: 2, y: 2 }, rotation: 0 as const, tier: 1,
    };
    // Two drawings, picked by how far the viewed floor is above the placement's: the foot from
    // its own level, the head from the next.
    const art = (id: string, floorOffset: number) =>
      id !== 'lift' ? undefined
        : [{ kind: 'rect', x: 0, y: 0, w: 1, h: 3, fill: floorOffset > 0 ? '#aaaaaa' : '#111111' } as Shape];

    const scene = (viewedFloor: number) => {
      const ctx = recorder();
      drawScene(ctx, options({
        catalogue: new Map([[belt.id, belt], [lift.id, lift]]),
        plan: { ...plan, warehouse: 'second', placements: [{ ...onGround, warehouse: 'second' }] },
        floor: viewedFloor,
        shapes: art,
      }));
      return ctx;
    };

    it('draws its foot from the floor it stands on', () => {
      expect(scene(0).calls.some((c) => c.fill === '#111111')).toBe(true);
    });

    it('draws the part below the floor you are on at half opacity', () => {
      // The elevator's upper-floor drawing is 1x3 but only its top third is
      // actually on the mezzanine; the rest is the shaft dropping away, and
      // must read as below rather than as solid geometry up here.
      const ctx = recorder();
      const solid: Shape = { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#111111' };
      const under: Shape = { kind: 'rect', x: 0, y: 1, w: 1, h: 2, fill: '#222222', belowDeck: true };
      drawScene(ctx, options({
        catalogue: new Map([[belt.id, belt], [lift.id, lift]]),
        plan: { ...plan, warehouse: 'second', placements: [{ ...onGround, warehouse: 'second' }] },
        floor: 1,
        shapes: (id: string) => (id === 'lift' ? [solid, under] : undefined),
      }));
      expect(ctx.calls.find((c) => c.fill === '#111111')?.alpha).toBe(1);
      expect(ctx.calls.find((c) => c.fill === '#222222')?.alpha).toBe(0.5);
    });

    it('leaves the context opaque afterwards, so the next object is not faded too', () => {
      // Ambient context state must not leak into the next draw.
      const ctx = recorder();
      const under: Shape = { kind: 'rect', x: 0, y: 1, w: 1, h: 2, fill: '#222222', belowDeck: true };
      drawScene(ctx, options({
        catalogue: new Map([[belt.id, belt], [lift.id, lift]]),
        plan: {
          ...plan, warehouse: 'second',
          placements: [
            { ...onGround, warehouse: 'second' },
            { id: 'later', objectId: 'belt', warehouse: 'second' as const, floor: 1, cell: { x: 8, y: 8 }, rotation: 0 as const, tier: 1 },
          ],
        },
        floor: 1,
        shapes: (id: string) => (id === 'lift' ? [under] : undefined),
      }));
      const faded = ctx.calls.findIndex((c) => c.alpha === 0.5);
      expect(faded).toBeGreaterThanOrEqual(0);
      expect(ctx.calls.slice(faded + 1).every((c) => c.alpha === 1)).toBe(true);
    });

    it('draws its HEAD, in full, from the floor above', () => {
      // The head upstairs is drawn as real artwork, not as a faded ghost.
      const ctx = scene(1);
      expect(ctx.calls.some((c) => c.fill === '#aaaaaa')).toBe(true);
      expect(ctx.calls.some((c) => c.fill === COLOURS_OBJECT_FADED)).toBe(false);
    });

    it('still fades an ordinary object seen from another floor', () => {
      // At (2,40), past the mezzanine's far edge, so it is visible from up there; with no artwork
      // it falls back to the faded rectangle.
      const ctx = recorder();
      drawScene(ctx, options({
        plan: {
          ...plan, warehouse: 'second',
          placements: [{ ...onGround, objectId: 'belt', warehouse: 'second', cell: { x: 2, y: 40 } }],
        },
        floor: 1,
        // y=40 needs the wide viewport, as above.
        width: 50 * CELL_PX, height: 50 * CELL_PX,
      }));
      expect(ctx.calls.some((c) => c.fill === COLOURS_OBJECT_FADED)).toBe(true);
    });
  });

  it('outlines the whole footprint of a selected multi-cell object, not just its anchor cell', () => {
    const ctx = recorder();
    const tall: CatalogEntry = { ...belt, id: 'tall', footprint: { w: 1, h: 3 } };
    drawScene(ctx, options({
      catalogue: new Map([[belt.id, belt], [tall.id, tall]]),
      plan: { ...plan, placements: [{ ...plan.placements[0]!, objectId: 'tall' }] },
      selectedIds: ['ground'],
    }));
    const [outline] = ctx.calls.filter((c) => c.op === 'strokeRect');
    expect(outline?.args[2]).toBe(CELL_PX - 2);       // one cell wide
    expect(outline?.args[3]).toBe(3 * CELL_PX - 2);   // three cells tall
  });

  it('outlines a rotated multi-cell object over the cells it actually covers', () => {
    const ctx = recorder();
    const tall: CatalogEntry = { ...belt, id: 'tall', footprint: { w: 1, h: 3 } };
    drawScene(ctx, options({
      catalogue: new Map([[belt.id, belt], [tall.id, tall]]),
      plan: { ...plan, placements: [{ ...plan.placements[0]!, objectId: 'tall', rotation: 90 }] },
      selectedIds: ['ground'],
    }));
    // Turned 90°, the same object covers three cells across and one down.
    const [outline] = ctx.calls.filter((c) => c.op === 'strokeRect');
    expect(outline?.args[2]).toBe(3 * CELL_PX - 2);
    expect(outline?.args[3]).toBe(CELL_PX - 2);
  });

  it('counts the vertical ruler up from the bottom-left, not down from the top', () => {
    const ctx = recorder();
    // Tall enough a viewport to see main's whole 40-row bounding box.
    drawScene(ctx, options({ width: 50 * CELL_PX, height: 40 * CELL_PX }));
    const rowLabels = ctx.calls.filter((c) => c.op === 'fillText' && c.baseline === 'middle');
    // Row y=0 is the top row on screen, so it reads as the full height, and the bottom row y=39
    // is row 1. Cells count from 1; 0 belongs to the corner.
    const topRow = rowLabels.find((c) => c.args[2] === CELL_PX / 2);
    const bottomRow = rowLabels.find((c) => c.args[2] === 39 * CELL_PX + CELL_PX / 2);
    expect(topRow?.args[0]).toBe('40');
    expect(bottomRow?.args[0]).toBe('1');
  });

  it('counts the horizontal ruler left to right from 1', () => {
    const ctx = recorder();
    drawScene(ctx, options({ width: 50 * CELL_PX, height: 40 * CELL_PX }));
    const columnLabels = ctx.calls.filter((c) => c.op === 'fillText' && c.align === 'center');
    const leftmost = columnLabels.find((c) => c.args[1] === CELL_PX / 2);
    expect(leftmost?.args[0]).toBe('1');
  });

  it('draws no fill and no grid line for a cell in the L-shaped main warehouse\'s notch', () => {
    const ctx = recorder();
    // Wide enough to see the whole 50x40 bounding box, including the notch at y=30.
    drawScene(ctx, options({ width: 50 * CELL_PX, height: 40 * CELL_PX }));
    // (5, 30) is inside the bounding box but outside both of main's blocks: the notch. It must
    // get no fill and none of its edges (all of them touch its top-left corner px, py).
    const notchFill = ctx.calls.find(
      (c) => c.op === 'fillRect' && c.args[0] === 5 * CELL_PX && c.args[1] === 30 * CELL_PX,
    );
    expect(notchFill).toBeUndefined();
    const notchCorner = 5 * CELL_PX;
    const notchRow = 30 * CELL_PX;
    const notchLine = ctx.calls.find(
      (c) => (c.op === 'moveTo' || c.op === 'lineTo')
        && c.stroke === 'rgba(125, 133, 144, 0.5)'
        && ((c.args[0] === notchCorner && c.args[1] === notchRow)
          || (c.args[0] === notchCorner + CELL_PX && c.args[1] === notchRow)
          || (c.args[0] === notchCorner && c.args[1] === notchRow + CELL_PX)),
    );
    expect(notchLine).toBeUndefined();
  });

  it('still draws the grid lines around a cell inside a buildable block', () => {
    const ctx = recorder();
    drawScene(ctx, options({ width: 50 * CELL_PX, height: 40 * CELL_PX }));
    // (5, 5) is inside main's left block. Its bottom and right edges are drawn by its buildable
    // neighbours; the "exactly once" test below proves nobody draws them twice.
    const px = 5 * CELL_PX;
    const py = 5 * CELL_PX;
    const gridSegments = ctx.calls
      .filter((c) => (c.op === 'moveTo' || c.op === 'lineTo') && c.stroke === 'rgba(125, 133, 144, 0.5)')
      .map((c) => c.args.join(','));
    expect(gridSegments).toEqual(expect.arrayContaining([
      `${px},${py}`, `${px + CELL_PX},${py}`, // top edge of (5,5)
      `${px},${py}`, `${px},${py + CELL_PX}`, // left edge of (5,5)
      `${px},${py + CELL_PX}`, `${px + CELL_PX},${py + CELL_PX}`, // top edge of (5,6) == bottom edge of (5,5)
      `${px + CELL_PX},${py}`, `${px + CELL_PX},${py + CELL_PX}`, // left edge of (6,5) == right edge of (5,5)
    ]));
  });

  it('draws each grid line exactly once, with no doubled interior line', () => {
    // visibleCellRange pads a 1x1 viewport to a 3x3 patch inside main's left block, so every cell
    // draws only its top and left edges: 18 lines. Stroking all four sides would give 36.
    const ctx = recorder();
    drawScene(ctx, options({ width: CELL_PX, height: CELL_PX }));

    const gridSegments = ctx.calls
      .filter((c) => (c.op === 'moveTo' || c.op === 'lineTo') && c.stroke === 'rgba(125, 133, 144, 0.5)')
      .map((c) => c.args.join(','));
    // Pair each moveTo/lineTo into an order-independent key, so a line drawn from either end
    // still collides.
    const lineKeys: string[] = [];
    for (let i = 0; i + 1 < gridSegments.length; i += 2) {
      const [a, b] = [gridSegments[i]!, gridSegments[i + 1]!];
      lineKeys.push([a, b].sort().join('|'));
    }
    const counts = new Map<string, number>();
    for (const key of lineKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
    const doubled = [...counts.entries()].filter(([, n]) => n > 1);
    expect(doubled).toEqual([]);
    expect(lineKeys).toHaveLength(18);
    expect(new Set(lineKeys).size).toBe(18); // all 18 are distinct lines
  });
});

// 'main' is L-shaped (20x20 + 30x40) with a 50x40 bounding box, which the rulers are pinned to
// (see warehouseDimensions). At CELL_PX=32, zoom 1, camera at the origin, the grid's bottom
// edge is at py=1280 and its right edge at px=1600, whatever the viewport.
describe('coordinate rulers', () => {
  it('labels a visible column at both the top and bottom edges with its cell index', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    // Cell x=3 is the fourth column, so it reads as 4.
    const columnLabels = ctx.calls.filter(
      (c) => c.op === 'fillText' && c.align === 'center' && c.args[0] === '4',
    );
    expect(columnLabels).toHaveLength(2);
    const top = columnLabels.find((c) => c.baseline === 'bottom');
    const bottom = columnLabels.find((c) => c.baseline === 'top');
    expect(top?.args).toEqual(['4', 112, -2]); // top edge (py=0), 2px above it
    expect(bottom?.args).toEqual(['4', 112, 1282]); // bottom edge (py=40*32=1280), 2px below it
  });

  it('labels a visible row at both the left and right edges', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    // Rows count up from the bottom (see displayRow), so in main's 40-row
    // bounding box the fourth row from the top, y=3, reads as 37.
    const rowLabels = ctx.calls.filter(
      (c) => c.op === 'fillText' && (c.align === 'right' || c.align === 'left') && c.args[0] === '37',
    );
    expect(rowLabels).toHaveLength(2);
    const left = rowLabels.find((c) => c.align === 'right');
    const right = rowLabels.find((c) => c.align === 'left');
    expect(left?.args).toEqual(['37', -4, 112]); // left edge (px=0), 4px left of it
    expect(right?.args).toEqual(['37', 1604, 112]); // right edge (px=50*32=1600), 4px right of it
  });

  it('puts a single 0 at the origin corner, and nowhere else', () => {
    // The 0 marks the corner the rulers count from, like the end of a physical ruler. Cells count
    // from 1, so it is the only 0 and is not read as a cell.
    const ctx = recorder();
    drawScene(ctx, options({ width: 50 * CELL_PX, height: 40 * CELL_PX }));
    const zeros = ctx.calls.filter((c) => c.op === 'fillText' && c.args[0] === '0');
    expect(zeros).toHaveLength(1);
    // Bottom-left: 4px left of the left edge (px=0), 2px below the bottom
    // edge (py=40*32=1280).
    expect(zeros[0]?.args).toEqual(['0', -4, 1282]);
  });

  it('only labels visible columns for a grid much wider than the viewport', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      plan: { ...plan, warehouse: 'second', placements: [] },
      // 'second' has a 60x70 bounding box (see warehouseDimensions); the
      // 256px-wide viewport at zoom 1 only shows ~10 of those 60 columns.
      camera: { x: 0, y: 0, zoom: 1 },
    }));
    const topLabels = ctx.calls.filter((c) => c.op === 'fillText' && c.baseline === 'bottom');
    expect(topLabels.length).toBeLessThan(15);
    expect(topLabels.some((c) => c.args[0] === '35')).toBe(false);
  });

  it('hides ruler labels entirely below the minimum legible cell size', () => {
    const ctx = recorder();
    // size = CELL_PX * 0.3 = 9.6px, below the 12px floor.
    drawScene(ctx, options({ camera: { x: 0, y: 0, zoom: 0.3 } }));
    expect(ctx.calls.some((c) => c.op === 'fillText')).toBe(false);
  });

  it('thins ruler labels to every 5th cell in the intermediate zoom band', () => {
    const ctx = recorder();
    // 16px cells: above the 12px hide floor, below the 22px full-labelling threshold, so only every
    // fifth shown number is drawn (round multiples of five, not every fifth index).
    drawScene(ctx, options({ camera: { x: 0, y: 0, zoom: 0.5 } }));
    const topLabels = ctx.calls
      .filter((c) => c.op === 'fillText' && c.align === 'center' && c.baseline === 'bottom')
      .map((c) => c.args[0]);
    expect(topLabels).toEqual(['5', '10', '15']);
  });

  it('draws rulers before the drag highlight, which still paints last', () => {
    const ctx = recorder();
    drawScene(ctx, options({ highlight: { cells: [{ x: 2, y: 2 }], valid: true } }));
    const lastRulerIndex = ctx.calls.map((c) => c.op).lastIndexOf('fillText');
    const lastHighlightIndex = ctx.calls.length - 1;
    expect(ctx.calls[lastHighlightIndex]?.fill).toContain('86, 204, 128');
    expect(lastRulerIndex).toBeLessThan(lastHighlightIndex);
  });
});

describe('box selection', () => {
  it('draws nothing extra when no marquee is being dragged', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    expect(ctx.calls.some((c) => c.fill === 'rgba(245, 198, 91, 0.12)')).toBe(false);
  });

  it('draws the marquee snapped to whole cells', () => {
    const ctx = recorder();
    drawScene(ctx, options({ marquee: { from: { x: 1, y: 1 }, to: { x: 3, y: 2 } } }));
    const box = ctx.calls.find((c) => c.op === 'fillRect' && c.fill === 'rgba(245, 198, 91, 0.12)');
    // 3 columns (1..3) by 2 rows (1..2), anchored at the top-left cell.
    expect(box?.args).toEqual([CELL_PX, CELL_PX, 3 * CELL_PX, 2 * CELL_PX]);
  });

  it('normalises a marquee dragged up and to the left', () => {
    const ctx = recorder();
    drawScene(ctx, options({ marquee: { from: { x: 3, y: 2 }, to: { x: 1, y: 1 } } }));
    const box = ctx.calls.find((c) => c.op === 'fillRect' && c.fill === 'rgba(245, 198, 91, 0.12)');
    expect(box?.args).toEqual([CELL_PX, CELL_PX, 3 * CELL_PX, 2 * CELL_PX]);
  });

  it('paints the marquee last, over even the drag/drop highlight', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      marquee: { from: { x: 1, y: 1 }, to: { x: 3, y: 2 } },
      highlight: { cells: [{ x: 5, y: 5 }], valid: true },
    }));
    const highlightIndex = ctx.calls.map((c) => c.fill)
      .lastIndexOf('rgba(86, 204, 128, 0.45)');
    const marqueeIndex = ctx.calls.findIndex((c) => c.fill === 'rgba(245, 198, 91, 0.12)');
    expect(marqueeIndex).toBeGreaterThan(highlightIndex);
  });
});

describe('doors', () => {
  const DELIVERY = '#e08c3c';
  const EXPORT = '#3fa96a';
  const REJECT = '#d94f3d';
  const PORTAL = '#0b0d10';

  // A cell away from the default placement at (2,2), so the door sits on empty ground.
  const door: Door = {
    id: 'd1', warehouse: 'main', floor: 0, cell: { x: 10, y: 10 }, side: 'N', kind: 'delivery',
  };
  const exportDoor: Door = { ...door, id: 'd2', kind: 'export', cargoTypes: ['Air'] };
  const rejectDoor: Door = { ...door, id: 'd3', kind: 'export' };

  /** Every fillRect painted in `colour`, biggest first. */
  const rectsIn = (ctx: ReturnType<typeof recorder>, colour: string) =>
    ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === colour);

  it('draws a fixed marker for a door on the current warehouse/floor', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    expect(rectsIn(ctx, DELIVERY).length).toBeGreaterThan(0);
  });

  it('does not draw a door belonging to the other warehouse', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [{ ...door, warehouse: 'second' }] }));
    expect(ctx.calls.some((c) => c.fill === DELIVERY)).toBe(false);
  });

  it('does not draw a door on a floor other than the one being edited', () => {
    const ctx = recorder();
    drawScene(ctx, options({ floor: 1, doors: [door] }));
    expect(ctx.calls.some((c) => c.fill === DELIVERY)).toBe(false);
  });

  it('colours a delivery door orange, a cargo export green, and a reject bin red', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      doors: [
        door,
        { ...exportDoor, cell: { x: 12, y: 10 } },
        { ...rejectDoor, cell: { x: 14, y: 10 } },
      ],
    }));
    expect(rectsIn(ctx, DELIVERY).length).toBeGreaterThan(0);
    expect(rectsIn(ctx, EXPORT).length).toBeGreaterThan(0);
    expect(rectsIn(ctx, REJECT).length).toBeGreaterThan(0);
  });

  it('draws a 3-wide, 3-deep bay outside the wall the door sits in', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] })); // side 'N' = the +y/bottom edge
    const bay = rectsIn(ctx, DELIVERY)[0];
    // Centred on the door's own cell along the wall (10 - 1 = column 9),
    // starting just past the cell's outer edge (row 10 + 1 = 11).
    expect(bay?.args).toEqual([9 * CELL_PX, 11 * CELL_PX, 3 * CELL_PX, 3 * CELL_PX]);
  });

  it('turns the bay to face out of a vertical wall rather than keeping it wide', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [{ ...door, side: 'E' }] })); // +x/right edge
    const bay = rectsIn(ctx, DELIVERY)[0];
    // 3 cells deep along x (out through the east wall), 3 along y (with it).
    expect(bay?.args).toEqual([11 * CELL_PX, 9 * CELL_PX, 3 * CELL_PX, 3 * CELL_PX]);
  });

  it('marks the opening with a black square where the bay meets the wall', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    const portal = ctx.calls.find((c) => c.op === 'fillRect' && c.fill === PORTAL);
    // One cell, on the door's own column, in the bay's first row.
    expect(portal?.args).toEqual([10 * CELL_PX, 11 * CELL_PX, CELL_PX, CELL_PX]);
  });

  it('no longer paints the small marker that used to jut over the wall', () => {
    // A sub-cell marker would cover the conveyor running up to the opening.
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    const subCell = rectsIn(ctx, DELIVERY).filter(
      (c) => Number(c.args[2]) < CELL_PX && Number(c.args[3]) < CELL_PX,
    );
    expect(subCell).toHaveLength(0);
  });

  it('draws the arrow from the hand-authored SVG, not a shape of its own', () => {
    // assets/ui/Flèche.svg, through the same parser as every conveyor. The renderer must not keep
    // its own copy of the coordinates, which would drift from the file.
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    const strokes = ctx.calls.filter((c) => c.op === 'strokePath').map((c) => c.args[0]);
    expect(strokes).toEqual(['M6 2L6 10', 'M6 2L8 4', 'M6 2L4 4']);
  });

  it('inks the arrow against its own portal in each theme, not in the artwork\'s white', () => {
    // The SVG is stroked white, the light theme's portal colour, so the renderer repaints it to an
    // ink the palette guarantees differs from the opening.
    const dark = recorder();
    drawScene(dark, options({ doors: [door] }));
    const light = recorder();
    drawScene(light, { ...options({ doors: [door] }), palette: LIGHT_SCENE });

    const inks = (ctx: ReturnType<typeof recorder>) =>
      new Set(ctx.calls.filter((c) => c.op === 'strokePath').map((c) => c.stroke));

    expect(inks(dark)).toEqual(new Set([DARK_SCENE.doorArrow]));
    expect(inks(light)).toEqual(new Set([LIGHT_SCENE.doorArrow]));
    // An arrow that is never the colour of its own portal.
    expect(DARK_SCENE.doorArrow).not.toBe(DARK_SCENE.doorPortal);
    expect(LIGHT_SCENE.doorArrow).not.toBe(LIGHT_SCENE.doorPortal);
  });

  it('turns the arrow to face the way parcels travel', () => {
    // The SVG points up. A delivery through a north wall (+y here) brings parcels in, toward -y,
    // which is where the arrow already points: no turn.
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    const turns = ctx.calls.filter((c) => c.op === 'rotate').map((c) => c.args[0]);
    expect(turns).toContain(0);
  });

  it('turns it the other way for an exit through the same wall', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [exportDoor] }));
    const turns = ctx.calls.filter((c) => c.op === 'rotate').map((c) => c.args[0]);
    expect(turns).toContain(Math.PI); // half a turn: out through the north wall
  });

  it('turns it with the wall it sits in', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [{ ...exportDoor, side: 'E' }] }));
    const turns = ctx.calls.filter((c) => c.op === 'rotate').map((c) => c.args[0]);
    expect(turns).toContain(Math.PI / 2); // out through the east wall: +x
  });

  it('stamps an export door\'s bay with the logo of the cargo type that leaves by it', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [exportDoor] }));
    const drawn = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(drawn.map((c) => c.args[0])).toEqual(['/cargo_types/air_icon.png']);
  });

  it('stamps both logos, side by side, on a bay that takes two cargo types', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [{ ...exportDoor, cargoTypes: ['Road', 'Rail'] }] }));
    const drawn = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(drawn.map((c) => c.args[0]))
      .toEqual(['/cargo_types/road_icon.png', '/cargo_types/rail_icon.png']);
    // Laid out along the wall (x differs, y matches) and symmetric about the
    // bay's centre, which for a side-'N' door at column 10 is x = 10.5 cells.
    expect(drawn[0]?.args[2]).toBe(drawn[1]?.args[2]);
    const centreOf = (c: (typeof drawn)[number]) => Number(c.args[1]) + Number(c.args[3]) / 2;
    expect((centreOf(drawn[0]!) + centreOf(drawn[1]!)) / 2).toBeCloseTo(10.5 * CELL_PX);
  });

  it('paints a country exit green like any exit, but labels it with a flag', () => {
    const ctx = recorder();
    const countryDoor: Door = { ...door, id: 'c1', kind: 'country-export' };
    drawScene(ctx, options({ doors: [countryDoor], countryIcon: '/criteria/country-flag-icon.png' }));
    expect(rectsIn(ctx, EXPORT).length).toBeGreaterThan(0);
    expect(ctx.calls.filter((c) => c.op === 'drawImage').map((c) => c.args[0]))
      .toEqual(['/criteria/country-flag-icon.png']);
  });

  it('shows the flag of the country the plan gives a country door, in place of the generic icon', () => {
    const ctx = recorder();
    const countryDoor: Door = { ...door, id: 'c1', kind: 'country-export' };
    const base = options();
    drawScene(ctx, options({
      plan: { ...base.plan, doorCountries: { c1: 'Vocua' } },
      doors: [countryDoor, { ...countryDoor, id: 'c2', cell: { x: 14, y: 10 } }],
      countryIcon: '/criteria/country-flag-icon.png',
      countryFlags: new Map([['Vocua', '/flags/Vocua.png']]),
    }));
    const drawn = ctx.calls.filter((c) => c.op === 'drawImage');
    // c1 has its flag; c2, unassigned, keeps the generic icon.
    expect(drawn.map((c) => c.args[0])).toEqual(['/flags/Vocua.png', '/criteria/country-flag-icon.png']);
    // Drawn at the game's 5:3 flag shape, not squashed into a square glyph.
    const [, , , w, h] = drawn[0]!.args.map(Number);
    expect(w! / h!).toBeCloseTo(5 / 3);
  });

  it('marks each country door as clickable with a drop-down chip, in the editor only', () => {
    const countryDoor: Door = { ...door, id: 'c1', kind: 'country-export' };
    const chips = (doorChips: boolean | undefined) => {
      const ctx = recorder();
      drawScene(ctx, options({ doors: [countryDoor, exportDoor], doorChips }));
      return ctx.calls.filter((c) => c.op === 'fillPath' && c.fill === '#ffffff').length;
    };
    // One chip, on the country door; none on the cargo export door.
    expect(chips(true)).toBe(1);
    // An exported image or a link preview is not clicked.
    expect(chips(undefined)).toBe(0);
  });

  it('lights up the country door under the pointer', () => {
    const countryDoor: Door = { ...door, id: 'c1', kind: 'country-export' };
    const outlined = (hoveredDoorId: string | undefined) => {
      const ctx = recorder();
      drawScene(ctx, options({ doors: [countryDoor], hoveredDoorId }));
      return ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#f5c65b').length;
    };
    expect(outlined('c1')).toBe(1);
    expect(outlined(undefined)).toBe(0);
  });

  it('never reads a country exit as a reject bin, despite it having no cargo types', () => {
    // For a cargo export door an empty cargo list means a reject bin; a country door legitimately
    // has none.
    const ctx = recorder();
    drawScene(ctx, options({ doors: [{ ...door, id: 'c1', kind: 'country-export' }] }));
    expect(rectsIn(ctx, REJECT)).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'moveTo' && c.stroke === '#000000')).toHaveLength(0);
  });

  it('marks a reject bin with a cross instead of a logo', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [rejectDoor] }));
    expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    // Pinned by geometry, not by counting pen moves, since the door arrow is a path too. The glyph
    // field of a north door at (10,10) is centred on (336, 416); each arm reaches 16px.
    const arms = ctx.calls.filter((c) => c.op === 'moveTo').map((c) => c.args.join(','));
    expect(arms).toContain('320,400');
    expect(arms).toContain('352,400');
  });

  it('leaves a delivery door\'s bay unlabelled — nothing leaves by it to name', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door] }));
    expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(ctx.calls.some((c) => c.stroke === '#000000')).toBe(false);
  });

  it('drops the bay glyphs at far zoom-out, where they would be pixel noise', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      doors: [exportDoor, rejectDoor],
      camera: { x: 0, y: 0, zoom: 0.35 }, // 11.2px cells, below MIN_CELL_SIZE_FOR_ICON
    }));
    expect(ctx.calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(ctx.calls.some((c) => c.stroke === '#000000')).toBe(false);
    // The bay itself still draws; only its label is dropped.
    expect(rectsIn(ctx, EXPORT).length).toBeGreaterThan(0);
  });

  it('draws the door with (right after) the grid, well before any placement or the highlight', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      doors: [door],
      shapes: (id: string) => (id === 'belt' ? [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#123456' } as Shape] : undefined),
      highlight: { cells: [{ x: 5, y: 5 }], valid: true },
    }));
    const doorIndex = ctx.calls.findIndex((c) => c.op === 'fillRect' && c.fill === DELIVERY);
    const placementIndex = ctx.calls.findIndex((c) => c.op === 'fillRect' && c.fill === '#123456');
    const highlightIndex = ctx.calls.length - 1;
    expect(doorIndex).toBeGreaterThanOrEqual(0);
    expect(doorIndex).toBeLessThan(placementIndex);
    expect(doorIndex).toBeLessThan(highlightIndex);
  });

  it('never disrupts the existing draw-order guarantee that the highlight paints last', () => {
    const ctx = recorder();
    drawScene(ctx, options({ doors: [door], highlight: { cells: [{ x: 2, y: 2 }], valid: true } }));
    expect(ctx.calls.at(-1)?.fill).toContain('86, 204, 128');
  });
});

describe('the box-selection marquee', () => {
  const box = { from: { x: 3, y: 4 }, to: { x: 7, y: 6 } };

  it('says how big it is while it is being dragged', () => {
    // A dragged box shows its size, so a run can be measured without counting cells.
    const ctx = recorder();
    drawScene(ctx, options({ marquee: box }));
    const label = ctx.calls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('×'));
    expect(label?.args[0]).toBe('5 × 3');
  });

  it('counts both ends, so a box over one cell reads 1 × 1', () => {
    // Off-by-one bait: the box from a cell to itself covers that cell.
    const ctx = recorder();
    drawScene(ctx, options({ marquee: { from: { x: 3, y: 4 }, to: { x: 3, y: 4 } } }));
    const label = ctx.calls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('×'));
    expect(label?.args[0]).toBe('1 × 1');
  });

  it('measures the same box dragged backwards', () => {
    const ctx = recorder();
    drawScene(ctx, options({ marquee: { from: { x: 7, y: 6 }, to: { x: 3, y: 4 } } }));
    const label = ctx.calls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('×'));
    expect(label?.args[0]).toBe('5 × 3');
  });

  it('says nothing when no box is being dragged', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    const label = ctx.calls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('×'));
    expect(label).toBeUndefined();
  });
});

// From the ground floor of the Regional warehouse, the mezzanine's edge overhead is drawn, so
// you can build under it without switching floors.
describe('the edge of the floor above', () => {
  const downstairs = () => options({
    plan: { ...plan, warehouse: 'second' as const, placements: [] },
    floor: 0,
    width: 70 * CELL_PX,
    height: 60 * CELL_PX,
  });

  const DECK_EDGE = 'rgba(125, 133, 144, 0.8)';

  /** The deck-edge pen moves, picked out by colour rather than width, so the width can change freely. */
  const heavy = (ctx: ReturnType<typeof recorder>) =>
    ctx.calls.filter((c) => (c.op === 'moveTo' || c.op === 'lineTo') && c.stroke === DECK_EDGE);

  it('draws the inner edge of the mezzanine while you stand underneath it', () => {
    const ctx = recorder();
    drawScene(ctx, downstairs());
    // second's upper floor is the 70x30 half nearest y=0, so the edge that
    // matters runs right across at y=30, between rows 30 and 31 as the
    // rulers count them.
    expect(heavy(ctx).map((c) => c.args.join(','))).toEqual([
      `0,${30 * CELL_PX}`,
      `${70 * CELL_PX},${30 * CELL_PX}`,
    ]);
  });

  it('ignores the seams between the strips the deck is made of', () => {
    // The mezzanine is one block per owned tier; the seams between them have floor above and below
    // and must not be drawn across a continuous deck.
    const ctx = recorder();
    drawScene(ctx, {
      ...downstairs(),
      unlocked: {
        main: geometry.main,
        second: [
          geometry.second[0]!,
          [
            { x: 0, y: 0, w: 15, h: 30 },
            { x: 15, y: 0, w: 20, h: 30 },
            { x: 35, y: 0, w: 15, h: 30 },
            { x: 50, y: 0, w: 20, h: 30 },
          ],
        ],
      },
    });

    // Four strips, one continuous deck: still one line straight across, in
    // four abutting pieces, and not a single vertical.
    const verticals = heavy(ctx).filter((c, i, all) =>
      i % 2 === 1 && all[i - 1]!.args[0] === c.args[0]);
    expect(verticals).toHaveLength(0);
    const horizontals = heavy(ctx).filter((c, i, all) =>
      i % 2 === 1 && all[i - 1]!.args[1] === c.args[1]);
    expect(horizontals).toHaveLength(4);
  });

  it('leaves the three edges that are just the outside wall alone', () => {
    // Only the edge with floor on both sides is drawn, not the building's own outline.
    const ctx = recorder();
    drawScene(ctx, downstairs());
    expect(heavy(ctx)).toHaveLength(2); // one segment: a move and a line
  });

  it('draws nothing of the sort upstairs, where there is no floor above', () => {
    const ctx = recorder();
    drawScene(ctx, { ...downstairs(), floor: 1 });
    expect(heavy(ctx)).toHaveLength(0);
  });

  it('draws nothing in a warehouse with only one floor', () => {
    const ctx = recorder();
    drawScene(ctx, options());
    expect(heavy(ctx)).toHaveLength(0);
  });

  it('follows what the player has actually unlocked', () => {
    // A mezzanine strip on an expansion they have ticked off is not there to
    // stand under, so its edge must not be drawn either.
    const ctx = recorder();
    drawScene(ctx, {
      ...downstairs(),
      unlocked: { main: geometry.main, second: [geometry.second[0]!, []] },
    });
    expect(heavy(ctx)).toHaveLength(0);
  });
});

describe('what a floor hides', () => {
  const upstairsBelt = {
    id: 'up', objectId: 'belt', warehouse: 'second' as const, floor: 1,
    cell: { x: 5, y: 5 }, rotation: 0 as const, tier: 1,
  };
  const downstairsBelt = { ...upstairsBelt, id: 'down', floor: 0, cell: { x: 5, y: 40 } };

  const inSecond = (floor: number, placements: typeof plan.placements) => options({
    plan: { ...plan, warehouse: 'second' as const, placements },
    floor,
    width: 70 * CELL_PX,
    height: 60 * CELL_PX,
  });

  /** Anything painted for an object, at any opacity. */
  const objectPaint = (ctx: ReturnType<typeof recorder>) =>
    ctx.calls.filter((c) => c.op === 'fillRect' && (c.fill === '#5b8def' || c.fill === 'rgba(91, 141, 239, 0.18)'));

  it('does not show the floor above through the deck', () => {
    // From underneath you cannot see through the mezzanine.
    const ctx = recorder();
    drawScene(ctx, inSecond(0, [upstairsBelt]));
    expect(objectPaint(ctx)).toHaveLength(0);
  });

  it('still shows the floor below, where no deck covers it', () => {
    // The fade the other way must survive: y=40 is past the mezzanine's edge, open air from above.
    const ctx = recorder();
    drawScene(ctx, inSecond(1, [downstairsBelt]));
    expect(objectPaint(ctx).length).toBeGreaterThan(0);
  });

  it('still hides the floor below where the deck DOES cover it', () => {
    const ctx = recorder();
    drawScene(ctx, inSecond(1, [{ ...downstairsBelt, cell: { x: 5, y: 5 } }]));
    expect(objectPaint(ctx)).toHaveLength(0);
  });

  it('still draws what is on the floor you are standing on', () => {
    const ctx = recorder();
    drawScene(ctx, inSecond(1, [upstairsBelt]));
    expect(objectPaint(ctx).length).toBeGreaterThan(0);
  });
});

describe('staircases', () => {
  // A real flight: 1.4 cells wide by 2.2 deep, against the west wall.
  const stairs = [
    { id: 's1', warehouse: 'second' as const, floor: 0, cell: { x: 0, y: 37 }, w: 1.4, h: 2.2 },
  ];

  const inSecond = (floor: number) => options({
    plan: { ...plan, warehouse: 'second' as const, placements: [] },
    floor,
    width: 70 * CELL_PX,
    height: 60 * CELL_PX,
    stairs,
  });

  const STAIRS_FILL = 'rgba(141, 148, 158, 0.22)';
  const painted = (ctx: ReturnType<typeof recorder>) =>
    ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === STAIRS_FILL);

  it('draws a staircase on the floor it climbs from', () => {
    const ctx = recorder();
    drawScene(ctx, inSecond(0));
    // Fractional extents, drawn as measured rather than rounded to cells.
    expect(painted(ctx)[0]?.args).toEqual([0, 37 * CELL_PX, 1.4 * CELL_PX, 2.2 * CELL_PX]);
  });

  it('draws the steps, so it reads as stairs and not as a blank block', () => {
    const ctx = recorder();
    drawScene(ctx, inSecond(0));
    const steps = ctx.calls.filter(
      (c) => c.op === 'moveTo' && c.stroke === 'rgba(141, 148, 158, 0.55)',
    );
    expect(steps.length).toBeGreaterThan(1);
  });

  it('is see-through, so it never claims the cells under it', () => {
    // It does not block building, so a solid block would mislead and hide a conveyor laid across it.
    const ctx = recorder();
    drawScene(ctx, inSecond(0));
    expect(painted(ctx)[0]?.fill).toMatch(/^rgba\(.*0\.22\)$/);
  });

  it('draws nothing on a floor the staircase does not start from', () => {
    const ctx = recorder();
    drawScene(ctx, inSecond(1));
    expect(painted(ctx)).toHaveLength(0);
  });

  it('draws nothing in the other warehouse', () => {
    const ctx = recorder();
    drawScene(ctx, options({ stairs }));
    expect(painted(ctx)).toHaveLength(0);
  });
});

describe('painting a placed object', () => {
  const art = new Map([
    ['belt', [{ kind: 'path' as const, d: 'M0 0h12', fill: '#044ABE' }]],
    ['rack', [{ kind: 'path' as const, d: 'M0 0h12', fill: '#AE302E' }]],
  ]);

  const scene = (objectId: string, colour?: string) => {
    const ctx = recorder();
    drawScene(ctx, options({
      plan: {
        ...plan,
        placements: [{
          id: 'p', objectId, warehouse: 'main' as const, floor: 0,
          cell: { x: 2, y: 2 }, rotation: 0 as const, tier: 1,
          ...(colour ? { colour } : {}),
        }],
      },
      catalogue: new Map([
        ['belt', { ...(catalogue.get('belt')!), id: 'belt', category: 'conveyor' }],
        ['rack', { ...(catalogue.get('belt')!), id: 'rack', category: 'storage' }],
      ]),
      shapes: (id: string) => art.get(id),
    }));
    return ctx.calls.filter((c) => c.op === 'fillPath').map((c) => c.fill);
  };

  it('replaces a conveyor\'s blue with the chosen colour', () => {
    expect(scene('belt', '#75bb59')).toContain('#75bb59');
  });

  it('replaces a rack\'s red, not its blue', () => {
    expect(scene('rack', '#75bb59')).toContain('#75bb59');
  });

  it('leaves the artwork alone when no colour was chosen', () => {
    expect(scene('belt')).toContain('#044ABE');
  });

  it('matches the artwork\'s colour whatever case each is spelt in', () => {
    // The SVGs spell hexes in upper case, the palette in lower; a missed match would silently draw
    // the original.
    expect(scene('belt', '#00A2BA')).toContain('#00A2BA');
    expect(scene('belt', '#00a2ba')).toContain('#00a2ba');
  });

  /** The same artwork, previewed rather than placed. */
  const ghost = (colour?: string) => {
    const ctx = recorder();
    drawScene(ctx, options({
      catalogue: new Map([['belt', { ...(catalogue.get('belt')!), id: 'belt', category: 'conveyor' }]]),
      shapes: (id: string) => art.get(id),
      highlight: {
        cells: [{ x: 2, y: 2 }],
        valid: true,
        preview: [{ objectId: 'belt', cell: { x: 2, y: 2 }, rotation: 0 as const, ...(colour ? { colour } : {}) }],
      },
    }));
    return ctx.calls.filter((c) => c.op === 'fillPath').map((c) => c.fill);
  };

  it('paints a SILHOUETTE in the chosen colour too, not just a placed object', () => {
    // A painted object being aimed previews in its painted colour, as it will land.
    expect(ghost('#75bb59')).toContain('#75bb59');
  });

  it('leaves an unpainted silhouette in the artwork\'s own colour', () => {
    expect(ghost()).toContain('#044ABE');
  });
});

describe('white line-art in an object\'s own drawing', () => {
  // The letters on a storage rack are white strokes in the gaps between the rails, over the page,
  // so they need a dark ink on the near-white light page.
  const art = new Map([
    ['belt', [
      { kind: 'path' as const, d: 'M3 13L3 19', stroke: 'white', strokeWidth: 1 },
      { kind: 'path' as const, d: 'M0 0h12', stroke: 'black', strokeWidth: 1 },
      { kind: 'rect' as const, x: 0, y: 0, w: 0.1, h: 0.1, fill: 'white' },
    ]],
  ]);

  const drawn = (palette?: typeof LIGHT_SCENE) => {
    const ctx = recorder();
    drawScene(ctx, options({
      plan: {
        ...plan,
        placements: [{
          id: 'p', objectId: 'belt', warehouse: 'main' as const, floor: 0,
          cell: { x: 2, y: 2 }, rotation: 0 as const, tier: 1,
        }],
      },
      shapes: () => art.get('belt'),
      ...(palette ? { palette } : {}),
    }));
    return ctx.calls;
  };

  const strokes = (calls: ReturnType<typeof drawn>) =>
    calls.filter((c) => c.op === 'strokePath').map((c) => c.stroke);

  it('draws a white stroke in the theme\'s ink, so it never matches the page', () => {
    expect(strokes(drawn())).toContain(DARK_SCENE.artworkLine);
    expect(strokes(drawn(LIGHT_SCENE))).toContain(LIGHT_SCENE.artworkLine);
    expect(DARK_SCENE.artworkLine).not.toBe(LIGHT_SCENE.artworkLine);
  });

  it('leaves every other stroke exactly as the artwork drew it', () => {
    // Only white is theme-dependent. The black direction arrows on every
    // conveyor read fine against both pages and must not move.
    expect(strokes(drawn(LIGHT_SCENE))).toContain('black');
  });

  it('leaves a white FILL alone', () => {
    // The only white fills are the elevator's corner caps, against its own dark grey rail, where
    // black would hide them.
    const fills = drawn(LIGHT_SCENE).filter((c) => c.op === 'fillRect').map((c) => c.fill);
    expect(fills).toContain('white');
  });
});

describe('drawing only what is on screen', () => {
  // Only placements inside the canvas are drawn: 500 storage racks would otherwise cost 23,744
  // draw operations per frame.
  const art = new Map([['belt', [{ kind: 'path' as const, d: 'M0 0h12', fill: '#044ABE' }]]]);

  const scene = (cells: { x: number; y: number }[]) => {
    const ctx = recorder();
    drawScene(ctx, options({
      plan: {
        ...plan,
        placements: cells.map((cell, i) => ({
          id: `p${i}`, objectId: 'belt', warehouse: 'main' as const, floor: 0,
          cell, rotation: 0 as const, tier: 1,
        })),
      },
      catalogue: new Map([['belt', { ...(catalogue.get('belt')!), id: 'belt' }]]),
      shapes: (id: string) => art.get(id),
      // 320x320 at zoom 1 is ten cells square, and the camera starts at 0,0.
      width: 320, height: 320, camera: { x: 0, y: 0, zoom: 1 },
    }));
    return ctx.calls.filter((c) => c.op === 'fillPath').length;
  };

  it('draws a placement inside the viewport', () => {
    expect(scene([{ x: 4, y: 4 }])).toBe(1);
  });

  it('skips one well outside it', () => {
    expect(scene([{ x: 45, y: 35 }])).toBe(0);
  });

  it('still draws one that only overlaps the edge', () => {
    // Its anchor is off-screen to the left but part of it is not; culling on the anchor alone would
    // clip objects at the edges.
    expect(scene([{ x: -1, y: 4 }])).toBe(1);
  });

  it('keeps every one of a crowd that is genuinely visible', () => {
    const crowd = [];
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) crowd.push({ x, y });
    expect(scene(crowd)).toBe(100);
  });

  it('drops the ones off screen out of a mixed plan', () => {
    expect(scene([{ x: 1, y: 1 }, { x: 44, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 39 }])).toBe(2);
  });
});

describe('the palette', () => {
  it('paints the dark background when none is asked for', () => {
    // Callers that pass no theme, including the server's link preview, rely on this default.
    const ctx = recorder();
    drawScene(ctx, options());
    expect(ctx.calls[0]).toMatchObject({ op: 'fillRect', fill: DARK_SCENE.background });
  });

  it('paints the light background when the light palette is given', () => {
    const ctx = recorder();
    drawScene(ctx, { ...options(), palette: LIGHT_SCENE });
    expect(ctx.calls[0]).toMatchObject({ op: 'fillRect', fill: LIGHT_SCENE.background });
  });

  it('reaches the helpers too, not just the code inside drawScene', () => {
    // The palette is a module binding drawScene sets on entry for the helpers; the rulers are drawn
    // by one of them.
    const ctx = recorder();
    drawScene(ctx, { ...options(), palette: LIGHT_SCENE });
    const inks = new Set(ctx.calls.map((c) => c.fill));
    expect(inks.has(DARK_SCENE.ruler)).toBe(false);
    expect(inks.has(LIGHT_SCENE.ruler)).toBe(true);
  });

  it('does not leak one draw\'s palette into the next', () => {
    // The binding is reset on every entry, so a light frame followed by a
    // default one goes back to dark rather than staying light.
    const light = recorder();
    drawScene(light, { ...options(), palette: LIGHT_SCENE });
    const dark = recorder();
    drawScene(dark, options());
    expect(dark.calls[0]).toMatchObject({ fill: DARK_SCENE.background });
  });
});

describe('previewing a whole shape', () => {
  const art: Shape = { kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: '#123456' };

  it('draws the artwork of every pending object, not just the first', () => {
    // A paste previews every pending object's artwork, not just a coloured tint.
    const ctx = recorder();
    drawScene(ctx, {
      ...options({ shapes: (id: string) => (id === 'belt' ? [art] : undefined) }),
      // Nothing placed, so every shape drawn here belongs to the preview.
      plan: { gameVersion: 'test', warehouse: 'main', placements: [] },
      highlight: {
        cells: [{ x: 3, y: 3 }, { x: 5, y: 5 }],
        valid: true,
        preview: [
          { objectId: 'belt', cell: { x: 3, y: 3 }, rotation: 0 },
          { objectId: 'belt', cell: { x: 5, y: 5 }, rotation: 0 },
        ],
      },
    });

    // One shape group per pending object: each is drawn in its own transform,
    // so a translate lands on each cell.
    const origins = ctx.calls
      .filter((c) => c.op === 'translate')
      .map((c) => `${c.args[0]},${c.args[1]}`);
    expect(origins).toContain(`${3 * CELL_PX},${3 * CELL_PX}`);
    expect(origins).toContain(`${5 * CELL_PX},${5 * CELL_PX}`);
  });

  it('still tints every cell of the shape', () => {
    const ctx = recorder();
    drawScene(ctx, {
      ...options(),
      highlight: { cells: [{ x: 3, y: 3 }, { x: 5, y: 5 }], valid: false },
    });
    const tinted = ctx.calls.filter(
      (c) => c.op === 'fillRect' && c.fill === DARK_SCENE.highlightInvalid,
    );
    expect(tinted).toHaveLength(2);
  });
});

describe('a parcel being walked through the layout', () => {
  const ART = '/parcel.png';
  const walked = (over: Partial<Parameters<typeof drawScene>[1]>) => {
    const ctx = recorder();
    drawScene(ctx, options({ parcelIcon: ART, ...over }));
    return ctx.calls;
  };
  const sprites = (calls: ReturnType<typeof walked>) =>
    calls.filter((c) => c.op === 'drawImage' && c.args[0] === ART);

  it('draws nothing at all when no parcel is being followed', () => {
    expect(sprites(walked({}))).toHaveLength(0);
  });

  it('draws the parcel as the artwork, not as a coloured square', () => {
    const calls = walked({ parcels: [{ at: { x: 3, y: 4 }, dropped: false }], trail: [] });
    const drawn = sprites(calls)[0];
    expect(drawn).toBeDefined();
    // Inside its cell rather than filling it, so the conveyor underneath stays readable.
    expect(Number(drawn?.args[3])).toBeLessThan(CELL_PX);
  });

  it('keeps the drawing’s own proportions', () => {
    // The artwork is taller than it is wide and keeps that ratio.
    const calls = walked({ parcels: [{ at: { x: 3, y: 4 }, dropped: false }], trail: [] });
    const drawn = sprites(calls)[0]!;
    const w = Number(drawn.args[3]);
    const h = Number(drawn.args[4]);
    expect(w).toBeLessThan(h);
  });

  it('rings a dropped parcel in the refusing colour, artwork untouched', () => {
    // A dropped parcel must not look like an ordinary one, but the mark goes around the drawing
    // rather than repainting it.
    const calls = walked({ parcels: [{ at: { x: 3, y: 4 }, dropped: true }], trail: [] });
    expect(calls.some((c) => c.op === 'strokeRect' && c.stroke === DARK_SCENE.parcelDropped)).toBe(true);
    expect(sprites(calls)).toHaveLength(1);
  });

  it('leaves a travelling parcel unringed', () => {
    const calls = walked({ parcels: [{ at: { x: 3, y: 4 }, dropped: false }], trail: [] });
    expect(calls.some((c) => c.op === 'strokeRect' && c.stroke === DARK_SCENE.parcelDropped)).toBe(false);
  });

  it('lays a trail behind it, one mark per cell travelled', () => {
    const trail = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }];
    const calls = walked({ parcels: [{ at: { x: 1, y: 4 }, dropped: false }], trail });
    // Op-specific: the recorder stamps the current fillStyle onto every call it captures, so the
    // sprite itself would count as a trail mark otherwise.
    expect(calls.filter((c) => c.op === 'fillRect' && c.fill === DARK_SCENE.parcelTrail)).toHaveLength(3);
  });

  it('draws the trail UNDER the parcel, not over it', () => {
    const trail = [{ x: 1, y: 1 }];
    const calls = walked({ parcels: [{ at: { x: 1, y: 2 }, dropped: false }], trail });
    const trailIndexes = calls
      .map((c, i) => (c.op === 'fillRect' && c.fill === DARK_SCENE.parcelTrail ? i : -1))
      .filter((i) => i >= 0);
    const lastTrail = trailIndexes[trailIndexes.length - 1] ?? -1;
    const parcel = calls.findIndex((c) => c.op === 'drawImage' && c.args[0] === ART);
    expect(parcel).toBeGreaterThan(lastTrail);
  });

  it('has a distinct colour in each theme', () => {
    for (const role of ['parcel', 'parcelDropped', 'parcelTrail'] as const) {
      expect(DARK_SCENE[role]).toBeTruthy();
      expect(LIGHT_SCENE[role]).toBeTruthy();
    }
  });
});

describe('a parcel between two cells', () => {
  it('is drawn at a fractional position rather than snapped to a cell', () => {
    // The parcel glides: a position of 4.5 lands exactly halfway between cells.
    const sprite = (y: number) => {
      const ctx = recorder();
      drawScene(ctx, options({ parcelIcon: '/parcel.png', parcels: [{ at: { x: 2, y }, dropped: false }], trail: [] }));
      return ctx.calls.find((c) => c.op === 'drawImage' && c.args[0] === '/parcel.png');
    };
    // args are [path, x, y, w, h]; index 2 is the top edge.
    expect(Number(sprite(4.5)?.args[2]) - Number(sprite(4)?.args[2])).toBeCloseTo(CELL_PX / 2);
  });

  it('draws every parcel it is given, not just the first', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      parcelIcon: '/parcel.png',
      parcels: [
        { at: { x: 1, y: 1 }, dropped: false },
        { at: { x: 2, y: 2 }, dropped: false },
        { at: { x: 3, y: 3 }, dropped: true },
      ],
      trail: [],
    }));
    // All three: a stopped parcel is still a parcel, it just wears a ring.
    expect(ctx.calls.filter((c) => c.op === 'drawImage' && c.args[0] === '/parcel.png')).toHaveLength(3);
    // Exactly one is ringed: the refusing colour is a stroke around the drawing. Op-specific
    // because the recorder stamps the live strokeStyle onto every call.
    expect(
      ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === DARK_SCENE.parcelDropped),
    ).toHaveLength(1);
  });
});

describe('notes left on the grid', () => {
  const NOTE = { id: 'n', warehouse: 'main' as const, floor: 0, cell: { x: 3, y: 4 }, text: 'rail here' };

  it('draws nothing when there are none', () => {
    const ctx = recorder();
    drawScene(ctx, options({}));
    expect(ctx.calls.some((c) => c.fill === DARK_SCENE.note)).toBe(false);
  });

  it('marks the cell without covering it', () => {
    // A small corner mark, not a sticky square over the cell, so the conveyor beneath stays visible.
    const ctx = recorder();
    drawScene(ctx, options({ notes: [NOTE] }));
    const drawn = ctx.calls.filter((c) => c.fill === DARK_SCENE.note);
    expect(drawn.length).toBe(1);
    expect(drawn[0]?.op).toBe('fillPath');
    expect(ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === 'rail here')).toBe(false);
  });

  it('leaves the other floor and the other warehouse alone', () => {
    // A note is pinned to one floor of one building, exactly like a placement.
    // Drawing them all everywhere would turn the mezzanine into a noticeboard.
    const elsewhere = [
      { ...NOTE, id: 'a', floor: 1 },
      { ...NOTE, id: 'b', warehouse: 'second' as const },
    ];
    const ctx = recorder();
    drawScene(ctx, options({ notes: elsewhere }));
    expect(ctx.calls.some((c) => c.fill === DARK_SCENE.note)).toBe(false);
  });

  it('has a colour in each theme', () => {
    expect(DARK_SCENE.note).toBeTruthy();
    expect(LIGHT_SCENE.note).toBeTruthy();
    expect(DARK_SCENE.note).not.toBe(LIGHT_SCENE.note);
  });
});

describe('reserved zones', () => {
  // A 3x2 zone anchored at (2,4): on screen, x 64..160 and y 128..192.
  const zone: CatalogEntry = {
    ...belt, id: 'zone-3x2', category: 'zone', footprint: { w: 3, h: 2 }, price: 0, maxTier: 1,
  };
  const zoned = (over: Partial<Plan['placements'][number]> = {}): Partial<DrawOptions> => ({
    catalogue: new Map([[belt.id, belt], [zone.id, zone]]),
    plan: {
      ...plan,
      placements: [{
        id: 'z', objectId: 'zone-3x2', warehouse: 'main', floor: 0, cell: { x: 2, y: 4 }, rotation: 0, tier: 1, ...over,
      }],
    },
    repaintableColourOf: (e: CatalogEntry) => (e.category === 'zone' ? '#8D949E' : '#044ABE'),
  });
  const outline = (ctx: ReturnType<typeof recorder>) => ctx.calls.find(
    (c) => c.op === 'strokeRect' && (c.args[2] as number) > 2 * CELL_PX && (c.args[3] as number) > CELL_PX,
  );

  it('is outlined as ONE rectangle over its whole footprint', () => {
    // Not one box per cell: a zone is a single area, and a grid of little
    // squares would read as that many objects.
    const ctx = recorder();
    drawScene(ctx, options(zoned()));
    const box = outline(ctx);
    expect(box).toBeDefined();
    expect(box!.args[0]).toBeCloseTo(2 * CELL_PX, -1);
    expect(box!.args[1]).toBeCloseTo(4 * CELL_PX, -1);
    expect(box!.args[2]).toBeCloseTo(3 * CELL_PX, -1);
    expect(box!.args[3]).toBeCloseTo(2 * CELL_PX, -1);
  });

  it('does not fall back to the blue squares an object without artwork gets', () => {
    const ctx = recorder();
    drawScene(ctx, options(zoned()));
    expect(ctx.calls.some((c) => c.op === 'fillRect' && c.fill === DARK_SCENE.object)).toBe(false);
  });

  it('is drawn in grey until painted, then in its colour', () => {
    const grey = recorder();
    drawScene(grey, options(zoned()));
    expect(outline(grey)?.stroke).toBe(DARK_SCENE.zone);

    const painted = recorder();
    drawScene(painted, options(zoned({ colour: '#75bb59' })));
    expect(outline(painted)?.stroke).toBe('#75bb59');
  });

  it('is hatched, so it reads as floor set aside rather than as a solid object', () => {
    const ctx = recorder();
    drawScene(ctx, options(zoned()));
    // Diagonals: each runs as far down as it runs across.
    const lines = ctx.calls.filter((c, i) => {
      const next = ctx.calls[i + 1];
      return c.op === 'moveTo' && next?.op === 'lineTo' && c.stroke === DARK_SCENE.zone
        && Math.abs((next.args[0] as number) - (c.args[0] as number)) > 0
        && Math.abs(Math.abs((next.args[0] as number) - (c.args[0] as number))
          - Math.abs((next.args[1] as number) - (c.args[1] as number))) < 0.01;
    });
    expect(lines.length).toBeGreaterThan(2);
  });

  it('writes its name in the middle, upright whichever way it was turned', () => {
    const ctx = recorder();
    drawScene(ctx, options(zoned({ label: 'Tri', rotation: 90 })));
    const name = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'Tri');
    expect(name).toBeDefined();
    expect(name!.align).toBe('center');
    // The 3x2 turned a quarter covers 2 across and 3 down: its middle is
    // (2 + 1, 4 + 1.5).
    expect(name!.args[1]).toBeCloseTo(3 * CELL_PX, 5);
    expect(name!.args[2]).toBeCloseTo(5.5 * CELL_PX, 5);
    expect(ctx.calls.some((c) => c.op === 'rotate')).toBe(false);
  });

  it('shortens a name too long for it rather than letting it spill out', () => {
    const ctx = recorder();
    drawScene(ctx, options(zoned({ label: 'Poste de contrôle des colis internationaux' })));
    const name = ctx.calls.find((c) => c.op === 'fillText' && String(c.args[0]).startsWith('Poste'));
    expect(name).toBeDefined();
    expect(String(name!.args[0]).endsWith('…')).toBe(true);
  });

  it('leaves the opacity as it found it', () => {
    // The SVG backend that draws link previews does not carry opacity through
    // save/restore, so the zone has to put it back itself.
    const ctx = recorder();
    drawScene(ctx, options({
      ...zoned(),
      plan: {
        ...plan,
        placements: [
          { id: 'z', objectId: 'zone-3x2', warehouse: 'main', floor: 0, cell: { x: 2, y: 4 }, rotation: 0, tier: 1 },
          { id: 'b', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 6, y: 6 }, rotation: 0, tier: 1 },
        ],
      },
    }));
    const after = ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === DARK_SCENE.object);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((c) => c.alpha === 1)).toBe(true);
  });

  it('shows its outline while it is being moved, as an object shows its artwork', () => {
    const ctx = recorder();
    drawScene(ctx, options({
      ...zoned(),
      plan: { ...plan, placements: [] },
      highlight: {
        cells: [], valid: true,
        preview: [{ objectId: 'zone-3x2', cell: { x: 2, y: 4 }, rotation: 0 }],
      },
    }));
    expect(outline(ctx)).toBeDefined();
  });
});

describe('drawScene keyboard cursor', () => {
  const cursorStrokes = (ctx: ReturnType<typeof recorder>, colour: string) =>
    ctx.calls.filter((c) => c.op === 'stroke' && c.stroke === colour);

  it('draws nothing for a cursor that is not shown', () => {
    const ctx = recorder();
    drawScene(ctx, options({ cursor: null }));
    expect(cursorStrokes(ctx, DARK_SCENE.cursor)).toHaveLength(0);
  });

  it('draws the cursor last, in the accent, over a halo of the background', () => {
    const ctx = recorder();
    drawScene(ctx, options({ cursor: { x: 3, y: 1 } }));
    const strokes = ctx.calls.filter((c) => c.op === 'stroke');
    expect(strokes.at(-1)?.stroke).toBe(DARK_SCENE.cursor);
    expect(strokes.at(-2)?.stroke).toBe(DARK_SCENE.background);
    // The top-left bracket's corner sits just outside the cell's corner.
    const corner = ctx.calls.find((c) => c.op === 'lineTo' && c.args[0] === 3 * CELL_PX - 1 && c.args[1] === CELL_PX - 1);
    expect(corner).toBeDefined();
  });

  it('uses the light accent on the light theme', () => {
    const ctx = recorder();
    drawScene(ctx, options({ cursor: { x: 0, y: 0 }, palette: LIGHT_SCENE }));
    expect(cursorStrokes(ctx, LIGHT_SCENE.cursor)).toHaveLength(1);
  });
});

describe('country diverter screens', () => {
  const diverterEntry = getCatalogue().get(COUNTRY_DIVERTER)!;
  const withDiverter = (over: Partial<DrawOptions> = {}): DrawOptions => options({
    catalogue: new Map([[COUNTRY_DIVERTER, diverterEntry]]),
    plan: {
      gameVersion: 'test', warehouse: 'main',
      placements: [{
        id: 'd', objectId: COUNTRY_DIVERTER, warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1,
        diverterCountries: [{ left: 'Cristin' }, {}, { right: 'Molland' }],
      }],
    },
    countryFlags: new Map([['Cristin', '/flags/Cristin.png'], ['Molland', '/flags/Molland.png']]),
    ...over,
  });
  const flagsDrawn = (ctx: ReturnType<typeof recorder>) =>
    ctx.calls.filter((c) => c.op === 'drawImage').map((c) => c.args[0]).sort();

  it('draws the flag of every screen set to a country', () => {
    const ctx = recorder();
    drawScene(ctx, withDiverter());
    expect(flagsDrawn(ctx)).toEqual(['/flags/Cristin.png', '/flags/Molland.png']);
  });

  it('draws none when zoomed out past the icon size', () => {
    const ctx = recorder();
    drawScene(ctx, withDiverter({ camera: { x: 0, y: 0, zoom: 0.2 } }));
    expect(flagsDrawn(ctx)).toEqual([]);
  });
});
