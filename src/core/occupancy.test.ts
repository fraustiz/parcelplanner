import { describe, it, expect } from 'vitest';
import { canPlace, shiftedSelection } from './occupancy';
import type { CatalogEntry, Plan, Placement } from './types';

const single: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const wide: CatalogEntry = { ...single, id: 'rack', footprint: { w: 2, h: 1 } };

const catalogue = new Map([[single.id, single], [wide.id, wide]]);

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

const plan = (over: Partial<Plan> = {}): Plan => ({
  gameVersion: 'test', warehouse: 'main',
  placements: [], ...over,
});

const put = (over: Partial<Placement> = {}): Placement => ({
  id: 'a', objectId: 'belt', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1, ...over,
});

describe('canPlace', () => {
  it('accepts a placement inside the grid', () => {
    expect(canPlace(plan(), put({ cell: { x: 5, y: 5 } }), catalogue, geometry)).toBeNull();
  });

  it('accepts a placement in the main warehouse\'s right (taller) block', () => {
    expect(canPlace(plan(), put({ cell: { x: 25, y: 35 } }), catalogue, geometry)).toBeNull();
  });

  it('rejects a placement past the right edge of the bounding box', () => {
    const r = canPlace(plan(), put({ cell: { x: 50, y: 0 } }), catalogue, geometry);
    expect(r?.reason).toBe('out-of-bounds');
  });

  it('rejects a cell inside the L\'s notch (in the bounding box but in neither block)', () => {
    const r = canPlace(plan(), put({ cell: { x: 5, y: 30 } }), catalogue, geometry);
    expect(r?.reason).toBe('out-of-bounds');
  });

  it('rejects a wide object straddling the notch boundary', () => {
    // A 2-wide object at (19,25) has one cell in the notch (inside neither
    // block) and one in the right block: one cell is enough to reject it.
    const r = canPlace(plan(), put({ objectId: 'rack', cell: { x: 19, y: 25 } }), catalogue, geometry);
    expect(r?.reason).toBe('out-of-bounds');
    expect(r?.cells).toEqual([{ x: 19, y: 25 }]);
  });

  it('rejects negative coordinates', () => {
    expect(canPlace(plan(), put({ cell: { x: -1, y: 0 } }), catalogue, geometry)?.reason)
      .toBe('out-of-bounds');
  });

  it('rejects an upper floor in the main warehouse', () => {
    expect(canPlace(plan(), put({ floor: 1 }), catalogue, geometry)?.reason).toBe('bad-floor');
  });

  it('accepts an upper floor in the second warehouse', () => {
    // On the mezzanine's own footprint, y:[0,30).
    expect(canPlace(plan({ warehouse: 'second' }), put({ floor: 1, cell: { x: 0, y: 0 } }), catalogue, geometry))
      .toBeNull();
  });

  it('accepts the full width of second\'s ground floor but rejects the same cell on its narrower mezzanine', () => {
    // y=40 is on the ground floor's far half, beyond the mezzanine (y:[0,30)).
    expect(canPlace(plan({ warehouse: 'second' }), put({ cell: { x: 50, y: 40 } }), catalogue, geometry))
      .toBeNull();
    const r = canPlace(
      plan({ warehouse: 'second' }),
      put({ floor: 1, cell: { x: 50, y: 40 } }),
      catalogue,
      geometry,
    );
    expect(r?.reason).toBe('out-of-bounds');
  });

  it('reports an unknown object id as such', () => {
    expect(canPlace(plan(), put({ objectId: 'nope' }), catalogue, geometry)?.reason).toBe('unknown-object');
  });

  it('rejects an overlap and reports the shared cells', () => {
    const existing = put({ id: 'existing', cell: { x: 4, y: 4 } });
    const r = canPlace(plan({ placements: [existing] }), put({ cell: { x: 4, y: 4 } }), catalogue, geometry);
    expect(r?.reason).toBe('overlap');
    expect(r?.cells).toEqual([{ x: 4, y: 4 }]);
  });

  it('allows the same cell on a different floor', () => {
    // Inside the mezzanine's footprint (y:[0,30)), so both floors exist.
    const existing = put({ id: 'existing', floor: 0, cell: { x: 4, y: 4 } });
    const candidate = put({ floor: 1, cell: { x: 4, y: 4 } });
    expect(canPlace(plan({ warehouse: 'second', placements: [existing] }), candidate, catalogue, geometry))
      .toBeNull();
  });

  it('ignores the placement being moved when it is already in the plan', () => {
    const existing = put({ id: 'a', cell: { x: 4, y: 4 } });
    expect(canPlace(plan({ placements: [existing] }), existing, catalogue, geometry)).toBeNull();
  });

  it('does not collide with a placement at the same cell in the other warehouse', () => {
    const existing = put({ id: 'existing', warehouse: 'second', cell: { x: 4, y: 4 } });
    const candidate = put({ id: 'candidate', warehouse: 'main', cell: { x: 4, y: 4 } });
    expect(canPlace(plan({ warehouse: 'main', placements: [existing] }), candidate, catalogue, geometry))
      .toBeNull();
  });

  describe('bridging objects', () => {
    // 1 wide by 3 tall, raised over its middle cell only, like the real
    // BP_ConveyorBelt_Bridger.
    const bridge: CatalogEntry = {
      ...single, id: 'bridge', footprint: { w: 1, h: 3 }, bridgedCells: [{ x: 0, y: 1 }],
    };
    const withBridge = new Map([...catalogue, [bridge.id, bridge]]);
    const span = (over: Partial<Placement> = {}): Placement =>
      put({ id: 'span', objectId: 'bridge', cell: { x: 5, y: 5 }, ...over });

    it('lets a conveyor be built under a bridge\'s raised middle', () => {
      const plans = plan({ placements: [span()] });
      expect(canPlace(plans, put({ cell: { x: 5, y: 6 } }), withBridge, geometry)).toBeNull();
    });

    it('still refuses a conveyor on either of the bridge\'s ramps', () => {
      const plans = plan({ placements: [span()] });
      // The ramps stand on the ground; only the middle cell is raised.
      expect(canPlace(plans, put({ cell: { x: 5, y: 5 } }), withBridge, geometry)?.reason).toBe('overlap');
      expect(canPlace(plans, put({ cell: { x: 5, y: 7 } }), withBridge, geometry)?.reason).toBe('overlap');
    });

    it('lets a bridge be built over a conveyor that was already there', () => {
      // The other order: the belt first, the bridge dropped over it.
      const plans = plan({ placements: [put({ id: 'under', cell: { x: 5, y: 6 } })] });
      expect(canPlace(plans, span(), withBridge, geometry)).toBeNull();
    });

    it('refuses a bridge whose ramp would land on an existing conveyor', () => {
      const plans = plan({ placements: [put({ id: 'under', cell: { x: 5, y: 5 } })] });
      const r = canPlace(plans, span(), withBridge, geometry);
      expect(r?.reason).toBe('overlap');
      expect(r?.cells).toEqual([{ x: 5, y: 5 }]);
    });

    it('refuses to stack two bridges at the same height', () => {
      // Both raised cells land on (5,6), same level, so they collide.
      const plans = plan({ placements: [span()] });
      const crossing = span({ id: 'crossing', cell: { x: 4, y: 6 }, rotation: 90 });
      const r = canPlace(plans, crossing, withBridge, geometry);
      expect(r?.reason).toBe('overlap');
      expect(r?.cells).toEqual([{ x: 5, y: 6 }]);
    });

    it('follows the raised cell around when the bridge is rotated', () => {
      // Turned 90°, the same bridge runs east-west from (5,5) to (7,5), so
      // its raised cell is (6,5) and a belt fits there but not at (5,5).
      const plans = plan({ placements: [span({ rotation: 90 })] });
      expect(canPlace(plans, put({ cell: { x: 6, y: 5 } }), withBridge, geometry)).toBeNull();
      expect(canPlace(plans, put({ cell: { x: 5, y: 5 } }), withBridge, geometry)?.reason).toBe('overlap');
    });
  });

  describe('reserved zones', () => {
    // A zone is a placement whose footprint means "something stands here"
    // (see src/core/zone.ts). 3 wide by 2 tall, anchored at (5,5).
    const zone: CatalogEntry = {
      ...single, id: 'zone-3x2', category: 'zone', footprint: { w: 3, h: 2 }, price: 0, maxTier: 1,
    };
    const bridge: CatalogEntry = {
      ...single, id: 'bridge', footprint: { w: 1, h: 3 }, bridgedCells: [{ x: 0, y: 1 }],
    };
    // One cell deep, so a bridge across it has only its raised middle over
    // the zone, with both ramps on open floor.
    const strip: CatalogEntry = { ...zone, id: 'zone-3x1', footprint: { w: 3, h: 1 } };
    const withZone = new Map([...catalogue, [zone.id, zone], [strip.id, strip], [bridge.id, bridge]]);
    const reserved = (over: Partial<Placement> = {}): Placement =>
      put({ id: 'zone', objectId: 'zone-3x2', cell: { x: 5, y: 5 }, ...over });

    it('refuses an object on any of its cells', () => {
      const plans = plan({ placements: [reserved()] });
      expect(canPlace(plans, put({ cell: { x: 7, y: 6 } }), withZone, geometry)?.reason).toBe('overlap');
      expect(canPlace(plans, put({ cell: { x: 8, y: 6 } }), withZone, geometry)).toBeNull();
    });

    it('refuses a bridge passing over it, not just one standing on it', () => {
      // A zone claims the air above it too, so a bridge cannot cross it.
      const plans = plan({ placements: [reserved({ objectId: 'zone-3x1' })] });
      const over = put({ id: 'span', objectId: 'bridge', cell: { x: 6, y: 4 } });
      expect(canPlace(plans, over, withZone, geometry)?.reason).toBe('overlap');
    });

    it('cannot be drawn under a bridge either', () => {
      const plans = plan({ placements: [put({ id: 'span', objectId: 'bridge', cell: { x: 6, y: 4 } })] });
      expect(canPlace(plans, reserved({ objectId: 'zone-3x1' }), withZone, geometry)?.reason).toBe('overlap');
    });

    it('refuses another zone on top of it', () => {
      const plans = plan({ placements: [reserved()] });
      expect(canPlace(plans, reserved({ id: 'other', cell: { x: 7, y: 6 } }), withZone, geometry)?.reason)
        .toBe('overlap');
    });

    it('can be moved onto the cells it is itself vacating', () => {
      const plans = plan({ placements: [reserved()] });
      expect(canPlace(plans, reserved({ cell: { x: 6, y: 5 } }), withZone, geometry)).toBeNull();
    });
  });

  // Doors are not an input to canPlace: a conveyor must stand on a door's own
  // cell to meet its port (see buildGraph). That real door cells stay
  // buildable is checked in src/data/doors.test.ts.
});

describe('shiftedSelection', () => {
  const belts = (...cells: { x: number; y: number }[]) =>
    cells.map((cell, i) => put({ id: `b${i}`, cell }));

  it('shifts every placement it is given by the step', () => {
    const placements = belts({ x: 5, y: 5 }, { x: 9, y: 9 });
    expect(shiftedSelection(placements, { dx: 2, dy: -1 }).map((p) => p.cell))
      .toEqual([{ x: 7, y: 4 }, { x: 11, y: 8 }]);
  });

  it('keeps everything else about a placement, so only its cell changes', () => {
    const placements = [put({ id: 'b0', cell: { x: 5, y: 5 }, rotation: 90, mirrored: true })];
    expect(shiftedSelection(placements, { dx: 1, dy: 0 })[0])
      .toEqual({ ...placements[0], cell: { x: 6, y: 5 } });
  });

  it('shifts onto ground that is already taken, which movedSelection refuses', () => {
    // Unlike movedSelection, this lets a dragged silhouette sit anywhere
    // (on objects, off the grid) so it can be drawn in the refusing colour.
    // movedSelection answers whether it may land.
    const placements = belts({ x: 5, y: 5 }, { x: 6, y: 5 });
    const step = { dx: 1, dy: 0 };
    expect(shiftedSelection([placements[0]!], step)[0]?.cell).toEqual({ x: 6, y: 5 });
  });

  it('shifts clean off the grid rather than clamping to it', () => {
    expect(shiftedSelection(belts({ x: 49, y: 0 }), { dx: 3, dy: 0 })[0]?.cell)
      .toEqual({ x: 52, y: 0 });
  });

  it('gives nothing back for an empty list', () => {
    expect(shiftedSelection([], { dx: 1, dy: 0 })).toEqual([]);
  });
});

