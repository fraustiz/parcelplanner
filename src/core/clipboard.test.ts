import { describe, it, expect } from 'vitest';
import { copiedShape, pastedAt, turnedShape, flippedShape, type ClipboardEntry } from './clipboard';
import type { TransformResult } from './transform';
import type { CatalogEntry, Placement, Plan } from './types';

/** Unwraps a transform result; refusal reasons have their own tests. */
const got = (r: TransformResult): Placement[] | null => (r.ok ? r.placements : null);


const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const rack: CatalogEntry = { ...belt, id: 'rack', footprint: { w: 2, h: 1 } };
const catalogue = new Map([[belt.id, belt], [rack.id, rack]]);

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

describe('copiedShape', () => {
  it('keeps the objects relative to each other, not to the grid', () => {
    // A shape is copied, so it pastes anywhere rather than back on the original.
    const shape = copiedShape(plan([put('a', 10, 10), put('b', 12, 14)]), ['a', 'b']);
    expect(shape.map((p) => p.cell)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 4 }]);
  });

  it('anchors on the top-left of the selection, whatever order the ids came in', () => {
    const shape = copiedShape(plan([put('a', 12, 14), put('b', 10, 10)]), ['b', 'a']);
    expect(shape.map((p) => p.cell)).toContainEqual({ x: 0, y: 0 });
  });

  it('carries rotation, mirroring and tier', () => {
    const source = put('a', 5, 5, { rotation: 90, mirrored: true, tier: 3 });
    const [copied] = copiedShape(plan([source]), ['a']);
    expect(copied).toMatchObject({ objectId: 'belt', rotation: 90, mirrored: true, tier: 3 });
  });

  it('carries the colour the player painted the object', () => {
    // A chosen colour is part of the object, like its rotation.
    const source = put('a', 5, 5, { colour: '#ff8800' });
    const [copied] = copiedShape(plan([source]), ['a']);
    expect(copied?.colour).toBe('#ff8800');
  });

  it('leaves an unpainted object without a colour rather than inventing one', () => {
    const [copied] = copiedShape(plan([put('a', 5, 5)]), ['a']);
    expect(copied?.colour).toBeUndefined();
  });

  it('copies nothing when nothing is selected', () => {
    expect(copiedShape(plan([put('a', 1, 1)]), [])).toEqual([]);
  });

  it('ignores ids that are not in the plan', () => {
    expect(copiedShape(plan([put('a', 1, 1)]), ['a', 'ghost'])).toHaveLength(1);
  });
});

describe('pastedAt', () => {
  const shape = () => copiedShape(plan([put('a', 10, 10), put('b', 11, 10)]), ['a', 'b']);

  it('lands the shape with its corner on the target cell', () => {
    const pasted = got(pastedAt(plan([]), shape(), { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    expect(pasted?.map((p) => p.cell)).toEqual([{ x: 3, y: 4 }, { x: 4, y: 4 }]);
  });

  it('lands a zone with its name, turned and flipped on the way', () => {
    // Every hop rebuilds the entry field by field, so each is a chance to
    // drop the one field only zones have.
    const zone: CatalogEntry = { ...belt, id: 'zone-3x2', category: 'zone', footprint: { w: 3, h: 2 } };
    const withZone = new Map([...catalogue, [zone.id, zone]]);
    const named = copiedShape(plan([put('z', 10, 10, { objectId: 'zone-3x2', label: 'Desk' })]), ['z']);
    const aimed = flippedShape(turnedShape(named, withZone, 1), withZone);
    const pasted = got(pastedAt(plan([]), aimed, { x: 3, y: 4 }, withZone, geometry, 0, 'main'));
    expect(pasted?.[0]?.label).toBe('Desk');
  });

  it('lands the copied colour on the pasted object', () => {
    const painted = copiedShape(plan([put('a', 10, 10, { colour: '#ff8800' })]), ['a']);
    const pasted = got(pastedAt(plan([]), painted, { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    expect(pasted?.[0]?.colour).toBe('#ff8800');
  });

  it('survives being turned and flipped on the way', () => {
    // A colour must survive the whole journey: copied, aimed, turned, flipped,
    // landed. Each hop rebuilds the entry.
    const painted = copiedShape(plan([put('a', 10, 10, { colour: '#ff8800' })]), ['a']);
    const aimed = flippedShape(turnedShape(painted, catalogue, 1), catalogue);
    const pasted = got(pastedAt(plan([]), aimed, { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    expect(pasted?.[0]?.colour).toBe('#ff8800');
  });

  it('gives every pasted object a fresh id', () => {
    // Reused ids would make the paste indistinguishable from the original to
    // selection and undo.
    const pasted = got(pastedAt(plan([put('a', 10, 10)]), shape(), { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    const ids = new Set(pasted?.map((p) => p.id));
    expect(ids.size).toBe(2);
    expect(ids.has('a')).toBe(false);
  });

  it('refuses a paste that would land on something', () => {
    // All or nothing, like a move.
    const blocked = got(pastedAt(
      plan([put('x', 4, 4)]), shape(), { x: 3, y: 4 }, catalogue, geometry, 0, 'main',
    ));
    expect(blocked).toBeNull();
  });

  it('refuses a paste that would fall off the grid', () => {
    const off = got(pastedAt(plan([]), shape(), { x: 49, y: 0 }, catalogue, geometry, 0, 'main'));
    expect(off).toBeNull();
  });

  it('pastes onto the floor and warehouse being viewed, not the ones copied from', () => {
    // Copied on the ground floor, pasted upstairs: it lands on the floor being
    // viewed.
    const upstairs = got(pastedAt(
      { gameVersion: 'test', warehouse: 'second', placements: [] },
      shape(), { x: 3, y: 4 }, catalogue, geometry, 1, 'second',
    ));
    expect(upstairs?.every((p) => p.floor === 1 && p.warehouse === 'second')).toBe(true);
  });

  it('lets the objects of one paste sit next to each other', () => {
    // The two belts are adjacent, so checking the second against a plan that
    // already holds the first proves they do not collide.
    const pasted = got(pastedAt(plan([]), shape(), { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    expect(pasted).toHaveLength(2);
  });

  it('pastes nothing for an empty clipboard', () => {
    expect(got(pastedAt(plan([]), [], { x: 3, y: 4 }, catalogue, geometry, 0, 'main'))).toBeNull();
  });

  it('keeps a multi-cell object whole', () => {
    const wide = copiedShape(plan([put('r', 10, 10, { objectId: 'rack' })]), ['r']);
    const pasted = got(pastedAt(plan([]), wide, { x: 3, y: 4 }, catalogue, geometry, 0, 'main'));
    expect(pasted?.[0]).toMatchObject({ objectId: 'rack', cell: { x: 3, y: 4 } });
  });
});

describe('turning and flipping a shape being aimed', () => {
  const belt = (x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0): ClipboardEntry =>
    ({ objectId: 'belt', cell: { x, y }, rotation, tier: 1 });

  it('turns the arrangement, not each object on the spot', () => {
    // A row along x stands up along y; spinning each object in place would
    // move no cell.
    const row = [belt(0, 0), belt(1, 0), belt(2, 0)];
    const turned = turnedShape(row, catalogue, 1);
    expect(turned.map((e) => `${e.cell.x},${e.cell.y}`)).toEqual(['0,0', '0,1', '0,2']);
    expect(turned.every((e) => e.rotation === 90)).toBe(true);
  });

  it('comes back to where it started after four turns', () => {
    // Re-anchoring keeps a shape from drifting a cell per turn.
    const shape = [belt(0, 0), belt(1, 0), belt(1, 1)];
    let turned = shape;
    for (let i = 0; i < 4; i++) turned = turnedShape(turned, catalogue, 1);
    expect(turned).toEqual(shape);
  });

  it('turns back the other way for Shift+R', () => {
    const shape = [belt(0, 0), belt(1, 0)];
    expect(turnedShape(turnedShape(shape, catalogue, 1), catalogue, -1)).toEqual(shape);
  });

  it('flips left to right, and is its own inverse', () => {
    const shape = [belt(0, 0), belt(1, 0, 90), belt(2, 1)];
    expect(flippedShape(flippedShape(shape, catalogue), catalogue)).toEqual(shape);
  });

  it('negates the rotation when flipping, which is the part that shipped wrong', () => {
    // H o R(t) = R(-t) o H. Toggling `mirrored` alone is right only at 0 and
    // 180 (see mirroredSelection).
    const flipped = flippedShape([belt(0, 0, 90)], catalogue);
    expect(flipped[0]!.rotation).toBe(270);
    expect(flipped[0]!.mirrored).toBe(true);
  });

  it('leaves a shape alone when an object is not in the catalogue', () => {
    const odd: ClipboardEntry[] = [{ objectId: 'nope', cell: { x: 0, y: 0 }, rotation: 0, tier: 1 }];
    expect(turnedShape(odd, catalogue, 1)).toEqual(odd);
    expect(flippedShape(odd, catalogue)).toEqual(odd);
  });
});
