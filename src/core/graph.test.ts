import { describe, it, expect } from 'vitest';
import { buildGraph, doorNodeId } from './graph';
import type { CatalogEntry, Door, Plan, Placement } from './types';

// Mirrors straightThrough in src/data/ports.ts: in on `N` (faces +y, fed from
// below on screen), out on `S` (exits upward). The labels are inverted on purpose.
const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3,
  ports: [{ side: 'N', offset: 0, dir: 'in' }, { side: 'S', offset: 0, dir: 'out' }],
};

const lift: CatalogEntry = {
  ...belt, id: 'lift',
  ports: [
    { side: 'N', offset: 0, dir: 'in', floorDelta: 0 },
    { side: 'S', offset: 0, dir: 'out', floorDelta: 1 },
  ],
};

// The mirror image of `lift`: floorDelta on the in side, no out port. Checks
// that the inputs index honours targetFloor like the out-side lookup.
const sinkAbove: CatalogEntry = {
  ...belt, id: 'sinkAbove',
  ports: [{ side: 'N', offset: 0, dir: 'in', floorDelta: 1 }],
};

// 2x1 with W in and E out, both at offset 0: tells "offset along the side's
// edge" apart from "offset into the flat cell list".
const wide: CatalogEntry = {
  ...belt, id: 'wide', footprint: { w: 2, h: 1 },
  ports: [
    { side: 'W', offset: 0, dir: 'in' },
    { side: 'E', offset: 0, dir: 'out' },
  ],
};

// 2x2 with one N out port at offset 1, so both dimensions exceed 1.
const wide2: CatalogEntry = {
  ...belt, id: 'wide2', footprint: { w: 2, h: 2 },
  ports: [{ side: 'N', offset: 1, dir: 'out' }],
};

// Asymmetric: fed from below (N), branching east only (E), so a mirrored
// placement routes differently from an unmirrored one.
const brancher: CatalogEntry = {
  ...belt, id: 'brancher',
  ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'E', offset: 0, dir: 'out' },
  ],
};

// Malformed port table: two identical `in` ports on the same cell/side.
const dupIn: CatalogEntry = {
  ...belt, id: 'dupIn',
  ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'N', offset: 0, dir: 'in' },
  ],
};

const catalogue = new Map([
  [belt.id, belt],
  [lift.id, lift],
  [sinkAbove.id, sinkAbove],
  [wide.id, wide],
  [wide2.id, wide2],
  [brancher.id, brancher],
  [dupIn.id, dupIn],
]);

const plan = (placements: Placement[]): Plan => ({
  gameVersion: 'test', warehouse: 'second',
  placements,
});

const put = (id: string, objectId: string, x: number, y: number, floor = 0): Placement =>
  ({ id, objectId, warehouse: 'second', floor, cell: { x, y }, rotation: 0, tier: 1 });

describe('buildGraph', () => {
  describe('mirrored placements', () => {
    // `brancher` branches east; mirrored it branches west, so the same plan
    // wires to the opposite neighbour.
    const branchAt = (mirrored: boolean, ...rest: Placement[]): Plan =>
      plan([{ ...put('a', 'brancher', 0, 0), mirrored }, ...rest]);

    it('routes an unmirrored brancher to its east neighbour', () => {
      const g = buildGraph(branchAt(false, put('e', 'belt', 1, 0)), catalogue, []);
      expect(g.edges).toEqual([]); // the belt's only `in` is on N, not W
      expect(g.danglingOutputs.map((p) => p.side)).toContain('E');
    });

    it('routes a mirrored brancher to its west neighbour instead', () => {
      const g = buildGraph(branchAt(true), catalogue, []);
      expect(g.danglingOutputs.map((p) => p.side)).toEqual(['W']);
    });

    it('treats a missing `mirrored` field exactly like false', () => {
      const withField = buildGraph(branchAt(false), catalogue, []);
      const withoutField = buildGraph(plan([put('a', 'brancher', 0, 0)]), catalogue, []);
      expect(withoutField.ports).toEqual(withField.ports);
    });

    it('mirrors before rotating, matching how the artwork is drawn', () => {
    // E mirrored to W, then turned 90° clockwise, is S. Rotating first would
    // give N (see placedPort in grid.test.ts).
      const g = buildGraph(
        plan([{ ...put('a', 'brancher', 0, 0), rotation: 90, mirrored: true }]),
        catalogue, [],
      );
      expect(g.danglingOutputs.map((p) => p.side)).toEqual(['S']);
    });
  });

  it('connects a belt to the belt in front of it', () => {
    // Belt's out is `S` (dy -1), so 'a' at (0,0) feeds (0,-1), where 'b'
    // enters on `N` (dy +1).
    const g = buildGraph(plan([put('a', 'belt', 0, 0), put('b', 'belt', 0, -1)]), catalogue, []);
    expect(g.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('leaves no dangling output when connected', () => {
    // 'b' still dangles its own output; only 'a' is absent. Checking both
    // catches a regression that empties the list.
    const g = buildGraph(plan([put('a', 'belt', 0, 0), put('b', 'belt', 0, -1)]), catalogue, []);
    const danglingIds = g.danglingOutputs.map((p) => p.placementId);
    expect(danglingIds).not.toContain('a');
    expect(danglingIds).toContain('b');
  });

  it('reports an output pointing at nothing', () => {
    const g = buildGraph(plan([put('a', 'belt', 0, 0)]), catalogue, []);
    expect(g.danglingOutputs).toHaveLength(1);
    expect(g.danglingOutputs[0]?.placementId).toBe('a');
  });

  it('does not connect two outputs facing each other', () => {
    // 'b' at (0,-1) rotated 180: its out turns from 'S' to 'N' and points back
    // at 'a'. Two `out` ports facing each other never match.
    const b: Placement = { ...put('b', 'belt', 0, -1), rotation: 180 };
    const g = buildGraph(plan([put('a', 'belt', 0, 0), b]), catalogue, []);
    expect(g.edges).toHaveLength(0);
  });

  it('does not connect across floors without an elevator', () => {
    // Same positions as the first test; only the floor differs.
    const g = buildGraph(
      plan([put('a', 'belt', 0, 0), put('b', 'belt', 0, -1, 1)]),
      catalogue,
      [],
    );
    expect(g.edges).toHaveLength(0);
  });

  it('connects through an elevator to the floor above', () => {
    // lift's out is `S` with floorDelta 1: from (0,0) floor 0 it targets
    // (0,-1) on floor 1.
    const g = buildGraph(
      plan([put('lift', 'lift', 0, 0), put('b', 'belt', 0, -1, 1)]),
      catalogue,
      [],
    );
    expect(g.edges).toEqual([{ from: 'lift', to: 'b' }]);
  });

  it('follows rotation when placing ports', () => {
    // Rotated 90 clockwise, belt's `S` out turns to 'E' (x+1), and 'b' at
    // (1,0) has its `N` in turned to 'W', completing the match.
    const a: Placement = { ...put('a', 'belt', 0, 0), rotation: 90 };
    const b: Placement = { ...put('b', 'belt', 1, 0), rotation: 90 };
    const g = buildGraph(plan([a, b]), catalogue, []);
    expect(g.edges).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('connects an in-port floorDelta to a belt on the floor above (floor symmetry)', () => {
    // floorDelta on the in side: 'feeder' at (0,1) floor 1 points its `S` out
    // at (0,0), where 'sink' (floor 0, in-port floorDelta 1) opens onto floor 1.
    // The inputs index must key on targetFloor, not the placement floor.
    const g = buildGraph(
      plan([put('feeder', 'belt', 0, 1, 1), put('sink', 'sinkAbove', 0, 0, 0)]),
      catalogue,
      [],
    );
    expect(g.edges).toEqual([{ from: 'feeder', to: 'sink' }]);
  });

  it('resolves in/out ports on a 2x1 object to distinct cells (edge-relative offset)', () => {
    // Both ports at offset 0 on opposite edges (W, E) of a 2-wide footprint
    // must resolve to different cells.
    const g = buildGraph(plan([put('w', 'wide', 0, 0)]), catalogue, []);
    const inPort = g.ports.find((p) => p.dir === 'in');
    const outPort = g.ports.find((p) => p.dir === 'out');
    expect(inPort?.cell).toEqual({ x: 0, y: 0 });
    expect(outPort?.cell).toEqual({ x: 1, y: 0 });
  });

  it('places an N offset-1 port on the correct cell of a 2x2 object', () => {
    const g = buildGraph(plan([put('w2', 'wide2', 0, 0)]), catalogue, []);
    expect(g.ports[0]?.cell).toEqual({ x: 1, y: 1 });
  });

  it('does not connect a placement in one warehouse to one in the other', () => {
    // Same geometry as the first test, but 'a' is in the main warehouse and
    // the graph is built for the second.
    const a: Placement = { ...put('a', 'belt', 0, 0), warehouse: 'main' };
    const b = put('b', 'belt', 0, -1); // warehouse: 'second', matches plan.warehouse
    const g = buildGraph(plan([a, b]), catalogue, []);
    expect(g.edges).toHaveLength(0);
  });

  it('reports a port conflict when two in ports collide, keeping one active', () => {
    // 'dupIn' declares two identical in ports (N, offset 0). 'feeder' at (0,1)
    // points its `S` out at (0,0). The collision must be reported, and one of
    // the two ports must still match.
    const g = buildGraph(
      plan([put('feeder', 'belt', 0, 1), put('d', 'dupIn', 0, 0)]),
      catalogue,
      [],
    );
    expect(g.portConflicts).toHaveLength(1);
    expect(g.portConflicts[0]?.placementId).toBe('d');
    expect(g.edges).toEqual([{ from: 'feeder', to: 'd' }]);
  });

  describe('doors', () => {
    // A door's table `side` faces the outer wall (see src/data/doors.test.ts),
    // so buildGraph uses OPPOSITE[side]. A delivery door at (5,5) with side 'N'
    // really faces 'S', toward (5,4), where `belt`'s `N` in-port resolves.
    const deliveryDoor: Door = {
      id: 'd1', warehouse: 'second', floor: 0, cell: { x: 5, y: 5 }, side: 'N', kind: 'delivery',
    };
    const exportDoor: Door = {
      id: 'e1', warehouse: 'second', floor: 0, cell: { x: 9, y: 9 }, side: 'N', kind: 'export',
    };

    it('connects a delivery door\'s output to a conveyor standing ON the door\'s cell', () => {
      // The conveyor stands on the door's own cell. The door's synthetic port
      // sits one step outside at (5,6), facing back in at (5,5).
      const b = put('b', 'belt', 5, 5);
      const g = buildGraph(plan([b]), catalogue, [deliveryDoor]);
      expect(g.edges).toEqual([{ from: doorNodeId(deliveryDoor), to: 'b' }]);
      // The door's out port found its match, so it is not dangling.
      expect(g.danglingOutputs.map((p) => p.placementId)).not.toContain(doorNodeId(deliveryDoor));
    });

    it('no longer connects a conveyor left standing in FRONT of the door', () => {
      // A belt one cell inside leaves a gap at the wall and must not count as
      // connected.
      const b = put('b', 'belt', 5, 4);
      const g = buildGraph(plan([b]), catalogue, [deliveryDoor]);
      expect(g.edges).toHaveLength(0);
    });

    it('leaves a placement\'s output facing a delivery door (wrong direction) dangling', () => {
      // Rotated 180, the belt's out port faces the door, and a delivery door
      // has no `in` port, so nothing matches.
      const c: Placement = { ...put('c', 'belt', 5, 5), rotation: 180 };
      const g = buildGraph(plan([c]), catalogue, [deliveryDoor]);
      expect(g.danglingOutputs.map((p) => p.placementId)).toContain('c');
      expect(g.edges).toHaveLength(0);
    });

    it('connects a conveyor on an export door\'s cell to that door\'s input', () => {
      // The belt on (9,9), rotated 180, points its out port 'N' (+y) at
      // (9,10), where the door's synthetic in port sits.
      const feeder: Placement = { ...put('feeder', 'belt', 9, 9), rotation: 180 };
      const g = buildGraph(plan([feeder]), catalogue, [exportDoor]);
      expect(g.edges).toEqual([{ from: 'feeder', to: doorNodeId(exportDoor) }]);
    });

    it('puts a door\'s port outside the wall, where no placement can ever reach it', () => {
      // The synthetic cell is outside every buildable block (see
      // src/data/doors.test.ts), so it cannot collide with a real port.
      const g = buildGraph(plan([]), catalogue, [deliveryDoor]);
      const port = g.ports.find((p) => p.placementId === doorNodeId(deliveryDoor));
      expect(port?.cell).toEqual({ x: 5, y: 6 }); // side 'N' steps +y
      expect(port?.side).toBe('S'); // facing back inward at (5,5)
    });

    it('does not let a door in the other warehouse affect this warehouse\'s graph', () => {
      const mainDoor: Door = { ...deliveryDoor, warehouse: 'main' };
      const b = put('b', 'belt', 5, 5);
      const g = buildGraph(plan([b]), catalogue, [mainDoor]);
      expect(g.edges).toHaveLength(0);
      // 'b's own in-port simply goes unmatched, as if no door existed.
    });
  });
});
