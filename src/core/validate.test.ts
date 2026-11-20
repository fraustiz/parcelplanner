import { describe, it, expect } from 'vitest';
import { validate } from './validate';
import { canPlace } from './occupancy';
import type { CatalogEntry, Plan, Placement } from './types';

// These tests cover placement legality only. `validate` gives no flow or
// "layout is valid" verdict: that would need scanner criteria and routing the
// app does not simulate.

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3,
  ports: [{ side: 'N', offset: 0, dir: 'in' }, { side: 'S', offset: 0, dir: 'out' }],
};
const rack: CatalogEntry = {
  ...belt, id: 'rack', category: 'storage',
  ports: [{ side: 'N', offset: 0, dir: 'in' }],
};
// 2x1 footprint, to check an issue reports the whole footprint and not just
// the anchor cell.
const wide: CatalogEntry = {
  ...belt, id: 'wide', footprint: { w: 2, h: 1 },
  ports: [{ side: 'W', offset: 0, dir: 'in' }, { side: 'E', offset: 0, dir: 'out' }],
};

const catalogue = new Map([[belt.id, belt], [rack.id, rack], [wide.id, wide]]);

// A local copy of WAREHOUSES (see the same fixture in grid.test.ts).
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

const put = (id: string, objectId: string, x: number, y: number): Placement =>
  ({ id, objectId, warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1 });

const plan = (placements: Placement[], over: Partial<Plan> = {}): Plan => ({
  gameVersion: 'test', warehouse: 'main',
  placements, ...over,
});

const codes = (p: Plan) => validate(p, catalogue, geometry).map((i) => i.code);

describe('validate', () => {
  it('returns nothing for an empty plan', () => {
    expect(codes(plan([]))).toEqual([]);
  });

  it('says nothing about a lone belt that leads nowhere and is fed by nothing', () => {
    // Where the belt sits is legal; whether it does anything useful is not
    // this module's question.
    expect(codes(plan([put('a', 'belt', 0, 0)]))).toEqual([]);
  });

  it('says nothing about a chain that is wired up correctly either', () => {
    expect(codes(plan([put('a', 'belt', 0, 1), put('r', 'rack', 0, 0)]))).toEqual([]);
  });

  it('flags overlapping placements', () => {
    expect(codes(plan([put('a', 'belt', 0, 0), put('b', 'belt', 0, 0)]))).toContain('overlap');
  });

  it('flags a placement outside the grid', () => {
    expect(codes(plan([put('a', 'belt', 99, 0)]))).toContain('out-of-bounds');
  });

  it('flags a cell inside the L-shaped warehouse\'s notch', () => {
    expect(codes(plan([put('a', 'belt', 5, 30)]))).toContain('out-of-bounds');
  });

  it('flags a floor the warehouse does not have', () => {
    const upstairs: Placement = { ...put('a', 'belt', 5, 5), floor: 1 };
    expect(codes(plan([upstairs]))).toContain('bad-floor');
  });

  it('flags an object that no longer exists in the game data', () => {
    // The practical case: an older plan or shared link referencing an object
    // removed from the catalogue. canPlace prevents this while editing.
    expect(codes(plan([put('a', 'BP_LongGone', 5, 5)]))).toContain('unknown-object');
  });

  it('reports exactly one issue per bad placement, not a cascade', () => {
    const result = validate(plan([put('a', 'belt', 99, 0)]), catalogue, geometry);
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe('out-of-bounds');
  });

  it('reports the full footprint of a wide object that straddles the boundary', () => {
    // The left block ends at x=20 and row 25 is below it, so a 2-wide object
    // anchored at (19,25) has one foot in the notch and one in the right block.
    const result = validate(plan([put('w', 'wide', 19, 25)]), catalogue, geometry);
    const issue = result.find((i) => i.code === 'out-of-bounds');
    expect(issue?.cells).toEqual([{ x: 19, y: 25 }]);
  });

  it('ignores placements belonging to the other warehouse entirely', () => {
    // Overlapping placements in the second warehouse, while the plan is scoped
    // to main, raise nothing here.
    const a: Placement = { ...put('a', 'belt', 0, 0), warehouse: 'second' };
    const b: Placement = { ...put('b', 'belt', 0, 0), warehouse: 'second' };
    expect(codes(plan([a, b]))).toEqual([]);
  });
});

describe('validate agrees with asking canPlace one placement at a time', () => {
  // validate builds the occupancy map once for the whole plan (rebuilding it
  // per placement is quadratic). That is only sound if it matches asking one
  // placement at a time, including each placement discounting its own cells.
  const bridge: CatalogEntry = {
    ...belt, id: 'bridge', footprint: { w: 1, h: 3 }, bridgedCells: [{ x: 0, y: 1 }],
  };
  const withBridge = new Map([...catalogue, [bridge.id, bridge]]);

  const agrees = (p: Plan, cat = catalogue) => {
    const oneByOne = p.placements
      .filter((x) => x.warehouse === p.warehouse)
      .map((x) => canPlace(p, x, cat, geometry)?.reason)
      .filter((r) => r !== undefined);
    expect(validate(p, cat, geometry).map((i) => i.code)).toEqual(oneByOne);
  };

  it('on a plan where nothing is wrong', () => {
    agrees(plan([put('a', 'belt', 2, 2), put('b', 'belt', 4, 4), put('w', 'wide', 6, 6)]));
  });

  it('on two objects sharing a cell', () => {
    agrees(plan([put('a', 'belt', 3, 3), put('b', 'belt', 3, 3)]));
  });

  it('on a bridge spanning a belt, which is legal and must stay legal', () => {
    // A bridge passes over its middle cell, so a belt may sit under it; a map
    // ignoring levels would call it an overlap.
    agrees(plan([
      { ...put('br', 'bridge', 5, 5) },
      { ...put('under', 'belt', 5, 6) },
    ]), withBridge);
  });

  it('on a bridge over a reserved zone, which is not legal at either level', () => {
    // A zone fills both levels, so it is counted once per level in the shared
    // map and must discount itself on both. One cell deep, so only the
    // bridge's raised middle crosses it.
    const zone: CatalogEntry = {
      ...belt, id: 'zone-3x1', category: 'zone', footprint: { w: 3, h: 1 }, price: 0, maxTier: 1,
    };
    const cat = new Map([...withBridge, [zone.id, zone]]);
    agrees(plan([put('z', 'zone-3x1', 5, 5)]), cat);
    agrees(plan([put('z', 'zone-3x1', 5, 5), put('br', 'bridge', 6, 4)]), cat);
    agrees(plan([put('z', 'zone-3x1', 5, 5), put('b', 'belt', 9, 9)]), cat);
    expect(validate(plan([put('z', 'zone-3x1', 5, 5), put('br', 'bridge', 6, 4)]), cat, geometry)
      .map((i) => i.code)).toEqual(['overlap', 'overlap']);
  });

  it('on two bridges stacked, which is not legal', () => {
    agrees(plan([put('b1', 'bridge', 5, 5), put('b2', 'bridge', 5, 5)]), withBridge);
  });

  it('on a plan mixing overlaps with out-of-bounds', () => {
    agrees(plan([
      put('a', 'belt', 2, 2), put('b', 'belt', 2, 2),
      put('far', 'belt', 99, 0), put('w', 'wide', 19, 25),
    ]));
  });

  it('on a crowd, which is the case that made this worth doing', () => {
    const many: Placement[] = [];
    for (let x = 0; x < 18; x++) for (let y = 0; y < 18; y++) {
      many.push(put(`p${x}-${y}`, 'belt', x, y));
    }
    many.push(put('dup', 'belt', 4, 4));
    agrees(plan(many));
  });
});
