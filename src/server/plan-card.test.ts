import { describe, it, expect } from 'vitest';
import { planCardSvg, busiestFloorOf } from './plan-card';
import type { Placement, Plan } from '@/core/types';

const belt = (
  id: string,
  where: Partial<Pick<Placement, 'warehouse' | 'floor' | 'cell'>> = {},
): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1',
  warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1,
  ...where,
});

const plan = (placements: Placement[], warehouse: Plan['warehouse'] = 'main'): Plan => ({
  gameVersion: 'test', warehouse, placements,
});

/**
 * The bounding box of everything the card draws, in image pixels.
 * SVG coordinates are local to each `<g transform="matrix(...)">`, so they are transformed first.
 * The background rect, the only element outside a group, is excluded.
 */
function drawnExtent(svg: string): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

  for (const [, attrs, body] of svg.matchAll(/<g([^>]*)>(.*?)<\/g>/gs)) {
    const m = attrs.match(/matrix\(([^)]+)\)/)?.[1].split(' ').map(Number) ?? [1, 0, 0, 1, 0, 0];
    const [a, b, c, d, e, f] = m;

    const local: { x: number; y: number }[] = [];
    for (const [, x, y, w, h] of body.matchAll(
      /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g,
    )) {
      const [X, Y, W, H] = [x, y, w, h].map(Number);
      local.push({ x: X, y: Y }, { x: X + W, y: Y }, { x: X, y: Y + H }, { x: X + W, y: Y + H });
    }
    // Every number pair in `d`. Curve control points can only over-estimate the box, the safe direction here.
    for (const [, d0] of body.matchAll(/ d="([^"]+)"/g)) {
      const nums = [...d0.matchAll(/-?[\d.]+/g)].map((n) => Number(n[0]));
      for (let i = 0; i + 1 < nums.length; i += 2) local.push({ x: nums[i], y: nums[i + 1] });
    }

    for (const p of local) {
      const x = a * p.x + c * p.y + e;
      const y = b * p.x + d * p.y + f;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom };
}

describe('busiestFloorOf', () => {
  it('picks the floor with the most on it', () => {
    const p = plan([
      belt('a', { floor: 1 }), belt('b', { floor: 1 }), belt('c', { floor: 0 }),
    ]);
    expect(busiestFloorOf(p, 'main')).toBe(1);
  });

  it('ignores the other warehouse when counting', () => {
    // The floor shown must be busy in the building being drawn.
    const p = plan([
      belt('a', { warehouse: 'second', floor: 1 }),
      belt('b', { warehouse: 'second', floor: 1 }),
      belt('c', { warehouse: 'main', floor: 0 }),
    ]);
    expect(busiestFloorOf(p, 'main')).toBe(0);
  });

  it('breaks a tie towards the ground floor', () => {
    const p = plan([belt('a', { floor: 0 }), belt('b', { floor: 1 })]);
    expect(busiestFloorOf(p, 'main')).toBe(0);
  });

  it('answers ground for a warehouse with nothing in it', () => {
    expect(busiestFloorOf(plan([]), 'main')).toBe(0);
  });
});

describe('planCardSvg', () => {
  it('produces an SVG of the size it was asked for', () => {
    const svg = planCardSvg(plan([belt('a')]), 1200, 630);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('actually draws the objects, not just an empty grid', () => {
    // An empty plan and a full one must not produce the same picture.
    const empty = planCardSvg(plan([]), 1200, 630);
    const built = planCardSvg(plan([belt('a'), belt('b', { cell: { x: 5, y: 5 } })]), 1200, 630);
    expect(built.length).toBeGreaterThan(empty.length);
  });

  it('draws the busiest warehouse, whichever one the plan was last viewing', () => {
    // The stored `warehouse` is only where the editor was left, not where the work is.
    const lopsided = plan([
      belt('a', { warehouse: 'second' }),
      belt('b', { warehouse: 'second', cell: { x: 5, y: 5 } }),
      belt('c', { warehouse: 'second', cell: { x: 8, y: 8 } }),
    ], 'main');
    const second = planCardSvg(lopsided, 1200, 630);
    const emptyMain = planCardSvg(plan([], 'main'), 1200, 630);
    expect(second).not.toBe(emptyMain);
  });

  it('draws the busiest floor, not always the ground one', () => {
    const upstairs = plan([belt('a', { floor: 1 }), belt('b', { floor: 1, cell: { x: 5, y: 5 } })]);
    const downstairs = plan([belt('a', { floor: 0 }), belt('b', { floor: 0, cell: { x: 5, y: 5 } })]);
    expect(planCardSvg(upstairs, 1200, 630)).not.toBe(planCardSvg(downstairs, 1200, 630));
  });

  it('fits everything it draws inside the frame, and fills it', () => {
    // Drawing past the edge crops the layout; drawing far short of it means the wrong extent was measured.
    // Both warehouses are checked because their fixtures differ.
    for (const warehouse of ['main', 'second'] as const) {
      const svg = planCardSvg(plan([belt('a', { warehouse })], warehouse), 1200, 630);
      const box = drawnExtent(svg);

      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(1200);
      expect(box.bottom).toBeLessThanOrEqual(630);
      // Fitted by the short axis, so the height is the one that must be filled.
      expect(box.bottom - box.top).toBeGreaterThan(630 * 0.85);
    }
  });

  it('respects the expansions the author had unlocked', () => {
    // The card draws only the owned tier. The Regional Sorting Centre is the tier-gated building.
    const inSecond = [belt('a', { warehouse: 'second' })];
    const few = planCardSvg({ ...plan(inSecond, 'second'), ownedTiers: [] }, 1200, 630);
    const all = planCardSvg({ ...plan(inSecond, 'second'), ownedTiers: [15, 16, 17, 18] }, 1200, 630);
    expect(few).not.toBe(all);
    // A higher tier has more grid to draw.
    expect(all.length).toBeGreaterThan(few.length);
  });

  it('survives a placement whose object is not in the catalogue', () => {
    // A payload may name a retired object; the card must not crash.
    const odd = plan([{ ...belt('a'), objectId: 'BP_NoSuchThing' }]);
    expect(() => planCardSvg(odd, 1200, 630)).not.toThrow();
  });

  it('draws a reserved zone, name and all', () => {
    const zone: Placement = { ...belt('z'), objectId: 'zone-6x4', cell: { x: 4, y: 4 }, label: 'Bureau' };
    expect(planCardSvg(plan([belt('a'), zone]), 1200, 630)).toContain('Bureau');
  });

  it('never emits a raw angle bracket from the name of a zone', () => {
    // The name is untrusted free text, written as SVG text.
    const zone: Placement = {
      ...belt('z'), objectId: 'zone-20x4', cell: { x: 4, y: 4 }, label: '</text><foreignObject>',
    };
    expect(planCardSvg(plan([zone]), 1200, 630)).not.toContain('<foreignObject>');
  });

  it('never emits a raw angle bracket from plan data', () => {
    // An untrusted colour must not be able to open a tag in the rasterised SVG.
    const nasty = plan([{ ...belt('a'), colour: '"><foreignObject>' }]);
    expect(planCardSvg(nasty, 1200, 630)).not.toContain('<foreignObject>');
  });
});
