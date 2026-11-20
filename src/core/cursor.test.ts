import { describe, it, expect } from 'vitest';
import { clampedCell, floorBounds, pickedSelection, placementAt, steppedCursor } from './cursor';
import type { CatalogEntry, Placement, Plan } from './types';

// Mirrors src/data/warehouses.ts, declared locally like the other core tests.
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

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const rack: CatalogEntry = { ...belt, id: 'rack', footprint: { w: 1, h: 3 } };
const bridge: CatalogEntry = { ...belt, id: 'bridge', footprint: { w: 1, h: 3 }, bridgedCells: [{ x: 0, y: 1 }] };
const elevator: CatalogEntry = { ...belt, id: 'elevator', spansTheFloorAbove: true };
const catalogue = new Map([belt, rack, bridge, elevator].map((e) => [e.id, e]));

const put = (over: Partial<Placement> = {}): Placement => ({
  id: 'a', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1, ...over,
});
const plan = (placements: Placement[], warehouse: Plan['warehouse'] = 'main'): Plan => ({
  gameVersion: 'test', warehouse, placements,
});

describe('floorBounds', () => {
  it('spans every block of the floor, inclusive', () => {
    expect(floorBounds('main', 0, geometry)).toEqual({ minX: 0, minY: 0, maxX: 49, maxY: 39 });
  });

  it('follows the floor asked for', () => {
    expect(floorBounds('second', 1, geometry)).toEqual({ minX: 0, minY: 0, maxX: 69, maxY: 29 });
  });

  it('is null for a floor that does not exist', () => {
    expect(floorBounds('main', 3, geometry)).toBeNull();
    expect(floorBounds('workshop', 0, geometry)).toBeNull();
  });
});

describe('steppedCursor', () => {
  const bounds = { minX: 0, minY: 0, maxX: 9, maxY: 9 };

  it('moves by the step', () => {
    expect(steppedCursor({ x: 4, y: 4 }, { dx: 1, dy: -1 }, bounds)).toEqual({ x: 5, y: 3 });
  });

  it('stops at the edge instead of leaving the floor', () => {
    expect(steppedCursor({ x: 8, y: 1 }, { dx: 5, dy: -5 }, bounds)).toEqual({ x: 9, y: 0 });
  });

  it('pulls a cell from outside back in', () => {
    expect(clampedCell({ x: -3, y: 40 }, bounds)).toEqual({ x: 0, y: 9 });
  });
});

describe('placementAt', () => {
  it('finds an object by any cell it covers', () => {
    const p = plan([put({ id: 'r', objectId: 'rack', cell: { x: 2, y: 2 } })]);
    expect(placementAt(p, 0, { x: 2, y: 4 }, catalogue)?.id).toBe('r');
  });

  it('answers undefined on empty ground', () => {
    expect(placementAt(plan([put()]), 0, { x: 5, y: 5 }, catalogue)).toBeUndefined();
  });

  it('ignores other floors and the other warehouse', () => {
    const p = plan([
      put({ id: 'upstairs', warehouse: 'second', floor: 1 }),
      put({ id: 'elsewhere', warehouse: 'main' }),
    ], 'second');
    expect(placementAt(p, 0, { x: 0, y: 0 }, catalogue)).toBeUndefined();
  });

  it('reaches an elevator from the floor above', () => {
    const p = plan([put({ id: 'lift', objectId: 'elevator', warehouse: 'second' })], 'second');
    expect(placementAt(p, 1, { x: 0, y: 0 }, catalogue)?.id).toBe('lift');
  });

  it('picks the bridge over the belt under it, and the belt when asked to reach past', () => {
    const p = plan([
      put({ id: 'under', cell: { x: 3, y: 1 } }),
      put({ id: 'over', objectId: 'bridge', cell: { x: 3, y: 0 } }),
    ]);
    expect(placementAt(p, 0, { x: 3, y: 1 }, catalogue)?.id).toBe('over');
    expect(placementAt(p, 0, { x: 3, y: 1 }, catalogue, true)?.id).toBe('under');
  });
});

describe('pickedSelection', () => {
  it('replaces the selection with what was picked', () => {
    expect(pickedSelection(['a', 'b'], 'c', false)).toEqual(['c']);
  });

  it('clears it on empty ground', () => {
    expect(pickedSelection(['a'], undefined, false)).toEqual([]);
  });

  it('toggles in additive mode', () => {
    expect(pickedSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(pickedSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('keeps the selection on empty ground in additive mode', () => {
    expect(pickedSelection(['a'], undefined, true)).toEqual(['a']);
  });
});
