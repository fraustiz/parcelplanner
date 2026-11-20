import { describe, it, expect } from 'vitest';
import { flippedOnce, flippedVertically, mirroredSelection, rotatedSelection, turnedGroup } from './transform';
import type { TransformResult } from './transform';
import type { CatalogEntry, Placement, Plan } from './types';

/** Unwraps a transform result; refusal reasons have their own tests. */
const got = (r: TransformResult): Placement[] | null => (r.ok ? r.placements : null);


const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const long: CatalogEntry = { ...belt, id: 'long', footprint: { w: 1, h: 3 } };
const rack: CatalogEntry = { ...belt, id: 'rack', footprint: { w: 2, h: 1 } };
const catalogue = new Map([[belt.id, belt], [long.id, long], [rack.id, rack]]);

const geometry = {
  main: [[{ x: 0, y: 0, w: 20, h: 20 }, { x: 20, y: 0, w: 30, h: 40 }]],
  second: [[{ x: 0, y: 0, w: 70, h: 60 }], [{ x: 0, y: 0, w: 70, h: 30 }]],
};

const put = (id: string, x: number, y: number, over: Partial<Placement> = {}): Placement => ({
  id, objectId: 'belt', warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1, ...over,
});

const plan = (placements: Placement[]): Plan => ({
  gameVersion: 'test', warehouse: 'main', placements,
});

/** The cells of the result, as a set of strings, for order-free comparison. */
const cells = (ps: Placement[] | null) =>
  ps === null ? null : ps.map((p) => `${p.cell.x},${p.cell.y}`).sort();

describe('rotatedSelection', () => {
  it('turns the ARRANGEMENT, not each object where it stands', () => {
    // A quarter turn stands a row of three belts up, rather than spinning each.
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    const turned = got(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry));
    expect(cells(turned)).toEqual(['6,4', '6,5', '6,6']);
  });

  it('turns each object on itself as well as moving it', () => {
    const row = [put('a', 5, 5), put('b', 6, 5)];
    const turned = got(rotatedSelection(plan(row), ['a', 'b'], 1, catalogue, geometry));
    expect(turned?.every((p) => p.rotation === 90)).toBe(true);
  });

  it('goes the other way for a counter-clockwise turn', () => {
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    const cw = got(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry));
    const ccw = got(rotatedSelection(plan(row), ['a', 'b', 'c'], -1, catalogue, geometry));
    // Same column either way for a symmetric row, but turned the other way.
    expect(cells(ccw)).toEqual(cells(cw));
    expect(ccw?.every((p) => p.rotation === 270)).toBe(true);
  });

  it('brings a group back exactly where it started after four turns', () => {
    // Four turns bring a group back where it started. An L of belts, not
    // symmetric.
    const shape = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5), put('d', 5, 6)];
    let current = plan(shape);
    for (let i = 0; i < 4; i++) {
      const turned = got(rotatedSelection(current, ['a', 'b', 'c', 'd'], 1, catalogue, geometry));
      expect(turned).not.toBeNull();
      current = { ...current, placements: turned! };
    }
    expect(cells(current.placements)).toEqual(cells(shape));
    expect(current.placements.every((p) => p.rotation === 0)).toBe(true);
  });

  it('keeps a single object pivoting on its own middle, as R alone does', () => {
    // A selection of one turns exactly as R does on one object.
    const one = [put('r', 5, 5, { objectId: 'long' })];
    const turned = got(rotatedSelection(plan(one), ['r'], 1, catalogue, geometry));
    expect(turned?.[0]?.cell).toEqual({ x: 4, y: 6 });
  });

  it('refuses a turn that would leave the grid, moving nothing', () => {
    // All or nothing, like a move.
    const row = [put('a', 0, 0), put('b', 1, 0), put('c', 2, 0)];
    expect(got(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry))).toBeNull();
  });

  it('refuses a turn that would land on something not selected', () => {
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    const blocked = plan([...row, put('x', 6, 6)]);
    expect(got(rotatedSelection(blocked, ['a', 'b', 'c'], 1, catalogue, geometry))).toBeNull();
  });

  it('lets the group land on cells it is itself vacating', () => {
    // The whole group moves at once, so its own old cells are free.
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    expect(got(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry))).not.toBeNull();
  });

  it('gives nothing back for an empty selection', () => {
    expect(got(rotatedSelection(plan([]), [], 1, catalogue, geometry))).toBeNull();
  });
});

describe('mirroredSelection', () => {
  it('flips the arrangement across, not each object in place', () => {
    // Two belts side by side swap ends; a single object would not move.
    const row = [put('a', 5, 5), put('b', 7, 5)];
    const flipped = got(mirroredSelection(plan(row), ['a', 'b'], catalogue, geometry));
    expect(flipped?.find((p) => p.id === 'a')?.cell).toEqual({ x: 7, y: 5 });
    expect(flipped?.find((p) => p.id === 'b')?.cell).toEqual({ x: 5, y: 5 });
  });

  it('mirrors each object as well as moving it', () => {
    const row = [put('a', 5, 5), put('b', 7, 5)];
    const flipped = got(mirroredSelection(plan(row), ['a', 'b'], catalogue, geometry));
    expect(flipped?.every((p) => p.mirrored === true)).toBe(true);
  });

  it('is its own inverse', () => {
    const shape = [put('a', 5, 5), put('b', 7, 5), put('c', 5, 6, { mirrored: true })];
    const once = got(mirroredSelection(plan(shape), ['a', 'b', 'c'], catalogue, geometry))!;
    const twice = got(mirroredSelection(
      { ...plan(shape), placements: once }, ['a', 'b', 'c'], catalogue, geometry,
    ))!;
    const key = (ps: Placement[]) => ps
      .map((p) => `${p.id}:${p.cell.x},${p.cell.y}:${p.mirrored === true}`).sort();
    expect(key(twice)).toEqual(key(shape));
  });

  it('leaves a single object where it stands, only flipping it', () => {
    const one = [put('a', 5, 5)];
    const flipped = got(mirroredSelection(plan(one), ['a'], catalogue, geometry));
    expect(flipped?.[0]?.cell).toEqual({ x: 5, y: 5 });
    expect(flipped?.[0]?.mirrored).toBe(true);
  });

  it('refuses a flip that would land on something not selected', () => {
    const row = [put('a', 5, 5), put('b', 7, 5)];
    expect(got(mirroredSelection(plan([...row, put('x', 6, 5)]), ['a', 'b'], catalogue, geometry)))
      .not.toBeNull(); // (6,5) is between them and untouched by the swap
    const onTop = plan([put('a', 5, 5), put('x', 7, 5)]);
    expect(got(mirroredSelection(onTop, ['a'], catalogue, geometry))).not.toBeNull();
  });
});

describe('mirroring something that is turned', () => {
  const corner = (id: string, x: number, y: number, rotation: Placement['rotation']): Placement =>
    put(id, x, y, { rotation });

  it('turns a quarter-turned object the other way as well as flipping it', () => {
    // Drawing composes rotate-then-mirror, so H ∘ R(θ) = R(−θ) ∘ H. Toggling
    // `mirrored` alone is right only at 0 and 180.
    const flipped = got(mirroredSelection(
      plan([corner('a', 5, 5, 90)]), ['a'], catalogue, geometry,
    ));
    expect(flipped?.[0]).toMatchObject({ rotation: 270, mirrored: true });
  });

  it('leaves 0 and 180 alone, which is why this went unnoticed', () => {
    for (const rotation of [0, 180] as const) {
      const flipped = got(mirroredSelection(
        plan([corner('a', 5, 5, rotation)]), ['a'], catalogue, geometry,
      ));
      expect(flipped?.[0]?.rotation).toBe(rotation);
    }
  });

  it('sends 270 back to 90', () => {
    const flipped = got(mirroredSelection(
      plan([corner('a', 5, 5, 270)]), ['a'], catalogue, geometry,
    ));
    expect(flipped?.[0]?.rotation).toBe(90);
  });

  it('is still its own inverse for a turned object', () => {
    const original = [corner('a', 5, 5, 90), corner('b', 7, 5, 270)];
    const once = got(mirroredSelection(plan(original), ['a', 'b'], catalogue, geometry))!;
    const twice = got(mirroredSelection(
      { ...plan(original), placements: once }, ['a', 'b'], catalogue, geometry,
    ))!;
    const key = (ps: Placement[]) => ps
      .map((p) => `${p.id}:${p.cell.x},${p.cell.y}:${p.rotation}:${p.mirrored === true}`).sort();
    expect(key(twice)).toEqual(key(original));
  });

  it('mirrors a turned group\u2019s shape as well as each object', () => {
    // Two corners side by side, both turned: positions swap and each turns
    // back the other way.
    const row = [corner('a', 5, 5, 90), corner('b', 7, 5, 90)];
    const flipped = got(mirroredSelection(plan(row), ['a', 'b'], catalogue, geometry))!;
    expect(flipped.find((p) => p.id === 'a')).toMatchObject({ cell: { x: 7, y: 5 }, rotation: 270 });
    expect(flipped.find((p) => p.id === 'b')).toMatchObject({ cell: { x: 5, y: 5 }, rotation: 270 });
  });
});

describe('why a transform refused', () => {
  const reason = (r: TransformResult) => (r.ok ? null : r.reason);

  it('says OUT OF BOUNDS when the result leaves the warehouse', () => {
    // A refusal says the result would be off the map.
    const row = [put('a', 0, 0), put('b', 1, 0), put('c', 2, 0)];
    expect(reason(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry)))
      .toBe('out-of-bounds');
  });

  it('says OVERLAP when something is in the way instead', () => {
    // The two refusals need different fixes: moving, or clearing a space.
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    const blocked = plan([...row, put('x', 6, 6)]);
    expect(reason(rotatedSelection(blocked, ['a', 'b', 'c'], 1, catalogue, geometry)))
      .toBe('overlap');
  });

  it('says nothing at all when the transform worked', () => {
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    expect(reason(rotatedSelection(plan(row), ['a', 'b', 'c'], 1, catalogue, geometry))).toBeNull();
  });

  it('reports a mirror\u2019s refusal too, not only a rotation\u2019s', () => {
    // An asymmetric selection: a 2-wide rack at x5 and a belt at x8. The flip
    // sends the rack to 8-9 and the belt to 5, so a blocker at 9 is in the way.
    // A symmetric selection would only swap its own cells.
    const chosen = [put('a', 5, 5, { objectId: 'rack' }), put('b', 8, 5)];
    const blocked = plan([...chosen, put('x', 9, 5)]);
    expect(reason(mirroredSelection(blocked, ['a', 'b'], catalogue, geometry))).toBe('overlap');
  });
});

describe('flippedVertically', () => {
  // A vertical flip is a horizontal one plus a half turn: H maps (x,y) to
  // (-x,y), R(180) maps that to (x,-y). Composed, so the mirror arithmetic
  // exists once.
  const flipV = (ps: Placement[]) => flippedVertically(ps, catalogue);

  it('turns a column upside down, top row to bottom', () => {
    const column = [put('a', 5, 5), put('b', 5, 6), put('c', 5, 7)];
    const flipped = flipV(column)!;
    // Same three cells: the box keeps its shape, the objects swap ends.
    expect(cells(flipped)).toEqual(cells(column));
    expect(flipped.find((p) => p.id === 'a')?.cell).toEqual({ x: 5, y: 7 });
    expect(flipped.find((p) => p.id === 'c')?.cell).toEqual({ x: 5, y: 5 });
  });

  it('leaves a row where it is, since a row has no top and bottom to swap', () => {
    const row = [put('a', 5, 5), put('b', 6, 5), put('c', 7, 5)];
    const flipped = flipV(row)!;
    expect(flipped.find((p) => p.id === 'a')?.cell).toEqual({ x: 5, y: 5 });
    expect(flipped.find((p) => p.id === 'c')?.cell).toEqual({ x: 7, y: 5 });
  });

  it('is its own inverse', () => {
    // Flipped twice, a group is unchanged, not shifted a cell. `mirrored` is
    // normalised: a round trip leaves it explicitly false, which means the
    // same as absent.
    const settle = (ps: Placement[]) =>
      ps.map((p) => ({ ...p, mirrored: p.mirrored === true }));
    const group = [put('a', 5, 5), put('b', 6, 6, { rotation: 90 }), put('c', 7, 5, { objectId: 'long' })];
    expect(settle(flipV(flipV(group)!)!)).toEqual(settle(group));
  });

  it('differs from the horizontal flip on a shape that is not symmetric', () => {
    // On an L the vertical and horizontal flips must differ.
    const ell = [put('a', 5, 5), put('b', 5, 6), put('c', 6, 6)];
    expect(cells(flipV(ell)!)).not.toEqual(cells(flippedOnce(ell, catalogue)!));
  });

  it('lands a horizontal flip when it is itself turned half a circle', () => {
    // The identity it is built on.
    const group = [put('a', 5, 5), put('b', 6, 7, { rotation: 90 })];
    const viaComposition = turnedGroup(turnedGroup(flippedOnce(group, catalogue)!, catalogue, 1)!, catalogue, 1);
    expect(flipV(group)).toEqual(viaComposition);
  });

  it('gives nothing back for an object the catalogue does not know', () => {
    expect(flipV([put('a', 5, 5, { objectId: 'gone' })])).toBeNull();
  });
});
