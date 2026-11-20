import { describe, it, expect } from 'vitest';
import { rotateSide, rotatedFootprint, cellsBetween, centreOf, centredAnchor, displayColumn, coveredCells, orientationFor, displayRow, isBuildable, joinerOrientation, splitterOrientation, orientationFacing, placedPort, portFacings, rotatedAboutCentre, warehouseDimensions } from './grid';
import { SIDE_STEP } from './grid';
import { getCatalogue } from '@/data/catalogue';
import { JOINS_INTO } from '@/data/corners';
import type { CatalogEntry, Placement } from './types';

// A local copy of WAREHOUSES, so these tests do not depend on src/data/ and
// stay stable if its unconfirmed geometry changes.
const testGeometry = {
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

const wide: CatalogEntry = {
  id: 'wide', displayName: { en: 'Wide', fr: 'Large' }, category: 'conveyor',
  footprint: { w: 2, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};

const single: CatalogEntry = { ...wide, id: 'single', footprint: { w: 1, h: 1 } };

const rect3x2: CatalogEntry = { ...wide, id: 'rect3x2', footprint: { w: 3, h: 2 } };

const at = (cell: { x: number; y: number }, rotation: 0 | 90 | 180 | 270): Placement =>
  ({ id: 'p', objectId: 'wide', warehouse: 'main', floor: 0, cell, rotation, tier: 1 });

describe('placedPort', () => {
  const square = { w: 1, h: 1 };

  it('is exactly rotateSide when the placement is not mirrored', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      for (const rotation of [0, 90, 180, 270] as const) {
        expect(placedPort({ side, offset: 0 }, rotation, false, square).side)
          .toBe(rotateSide(side, rotation));
      }
    }
  });

  it('swaps the two sides that face along x, and leaves the other two alone', () => {
    const mirror = (side: 'N' | 'E' | 'S' | 'W') =>
      placedPort({ side, offset: 0 }, 0, true, square).side;
    expect(mirror('E')).toBe('W');
    expect(mirror('W')).toBe('E');
    expect(mirror('N')).toBe('N');
    expect(mirror('S')).toBe('S');
  });

  it('is its own inverse: mirroring a mirrored port gets the original back', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      const once = placedPort({ side, offset: 0 }, 0, true, square);
      expect(placedPort(once, 0, true, square).side).toBe(side);
    }
  });

  it('mirrors before it rotates, not after', () => {
    // E mirrors to W, and W turned 90° clockwise is S. Rotating first (E to
    // N, unchanged by the flip) would give N: drawn one way, wired another.
    expect(placedPort({ side: 'E', offset: 0 }, 90, true, square).side).toBe('S');
    expect(rotateSide('W', 90)).toBe('S');
    expect(rotateSide('E', 90)).toBe('N'); // the wrong-order answer, for contrast
  });

  it('reverses the offset along an edge that runs with x, but not one that runs with y', () => {
    // A 3-wide object: N/S edges are indexed along x (offset 0 flips to 2),
    // E/W edges along y, untouched by a horizontal flip.
    const wide3 = { w: 3, h: 2 };
    expect(placedPort({ side: 'N', offset: 0 }, 0, true, wide3).offset).toBe(2);
    expect(placedPort({ side: 'S', offset: 2 }, 0, true, wide3).offset).toBe(0);
    expect(placedPort({ side: 'E', offset: 1 }, 0, true, wide3).offset).toBe(1);
  });
});

describe('rotateSide', () => {
  it('leaves sides untouched at 0 degrees', () => {
    expect(rotateSide('N', 0)).toBe('N');
  });

  it('turns north into west at 90 degrees', () => {
    // Clockwise on screen from N lands on W, not E, because the labels are
    // inverted (see SIDES_CCW in src/core/grid.ts).
    expect(rotateSide('N', 90)).toBe('W');
  });

  it('turns north into east at 270 degrees', () => {
    expect(rotateSide('N', 270)).toBe('E');
  });

  it('returns to the start after four quarter turns', () => {
    expect(rotateSide(rotateSide(rotateSide(rotateSide('E', 90), 90), 90), 90)).toBe('E');
  });
});

describe('rotatedFootprint', () => {
  it('keeps dimensions at 0 and 180 degrees', () => {
    expect(rotatedFootprint({ w: 2, h: 1 }, 0)).toEqual({ w: 2, h: 1 });
    expect(rotatedFootprint({ w: 2, h: 1 }, 180)).toEqual({ w: 2, h: 1 });
  });

  it('swaps dimensions at 90 and 270 degrees', () => {
    expect(rotatedFootprint({ w: 2, h: 1 }, 90)).toEqual({ w: 1, h: 2 });
    expect(rotatedFootprint({ w: 2, h: 1 }, 270)).toEqual({ w: 1, h: 2 });
  });
});

describe('coveredCells', () => {
  it('covers one cell for a single-cell object', () => {
    expect(coveredCells({ ...at({ x: 3, y: 4 }, 0), objectId: 'single' }, single))
      .toEqual([{ x: 3, y: 4 }]);
  });

  it('extends along x when unrotated', () => {
    expect(coveredCells(at({ x: 3, y: 4 }, 0), wide))
      .toEqual([{ x: 3, y: 4 }, { x: 4, y: 4 }]);
  });

  it('extends along y when rotated a quarter turn', () => {
    expect(coveredCells(at({ x: 3, y: 4 }, 90), wide))
      .toEqual([{ x: 3, y: 4 }, { x: 3, y: 5 }]);
  });

  it('covers 3×2 footprint in row-major order', () => {
    expect(coveredCells({ ...at({ x: 1, y: 2 }, 0), objectId: 'rect3x2' }, rect3x2))
      .toEqual([
        { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
      ]);
  });
});

describe('warehouseDimensions', () => {
  it('gives the main warehouse its 50x40 bounding box on a single floor', () => {
    // main is L-shaped (20x20 + 30x40): this is the bounding box, not the
    // buildable area.
    expect(warehouseDimensions('main', testGeometry)).toEqual({ w: 50, h: 40, floors: 1 });
  });

  it('gives the second warehouse its 70x60 bounding box across two floors', () => {
    // The mezzanine is half as deep, so the box is the ground floor's: the
    // blocks are unioned, not read from the first floor.
    expect(warehouseDimensions('second', testGeometry)).toEqual({ w: 70, h: 60, floors: 2 });
  });
});

describe('a building the geometry does not describe', () => {
  // A building missing from the geometry has nothing to build on, and must not crash.
  it('has no buildable cell', () => {
    expect(isBuildable('workshop', 0, { x: 1, y: 1 }, testGeometry)).toBe(false);
  });

  it('has no extent and no floors', () => {
    expect(warehouseDimensions('workshop', testGeometry)).toEqual({ w: 0, h: 0, floors: 0 });
  });
});

describe('isBuildable', () => {
  it('accepts a cell in the main warehouse\'s left block', () => {
    expect(isBuildable('main', 0, { x: 5, y: 5 }, testGeometry)).toBe(true);
  });

  it('accepts a cell in the main warehouse\'s right block', () => {
    expect(isBuildable('main', 0, { x: 25, y: 35 }, testGeometry)).toBe(true);
  });

  it('rejects a cell inside the L\'s notch (in the bounding box, in neither block)', () => {
    expect(isBuildable('main', 0, { x: 5, y: 30 }, testGeometry)).toBe(false);
  });

  it('rejects a floor the warehouse does not have', () => {
    expect(isBuildable('main', 1, { x: 5, y: 5 }, testGeometry)).toBe(false);
  });

  it('accepts the full width of second\'s ground floor but not its narrower mezzanine', () => {
    // The mezzanine covers y:[0,30) only, so a far-half cell is ground-only.
    expect(isBuildable('second', 0, { x: 50, y: 40 }, testGeometry)).toBe(true);
    expect(isBuildable('second', 1, { x: 50, y: 40 }, testGeometry)).toBe(false);
    // Both floors exist where they overlap.
    expect(isBuildable('second', 0, { x: 65, y: 5 }, testGeometry)).toBe(true);
    expect(isBuildable('second', 1, { x: 65, y: 5 }, testGeometry)).toBe(true);
    // y=60 is past the 60-deep ground floor.
    expect(isBuildable('second', 0, { x: 50, y: 60 }, testGeometry)).toBe(false);
  });
});

describe('displayRow', () => {
  it('counts from 1 at the bottom row up to the height at the top', () => {
    // Main's box is 40 rows tall and y grows southward, so y=0 is the top row.
    // Rows count from 1; 0 marks the origin corner.
    expect(displayRow(39, { h: 40 })).toBe(1);
    expect(displayRow(0, { h: 40 })).toBe(40);
  });

  it('never shows a 0, which now belongs to the corner alone', () => {
    for (let y = 0; y < 40; y++) expect(displayRow(y, { h: 40 })).toBeGreaterThan(0);
  });

  it('round-trips back to the cell it came from', () => {
    // Not its own inverse: a shown row r is the cell h - r.
    for (const y of [0, 1, 17, 38, 39]) {
      expect(40 - displayRow(y, { h: 40 })).toBe(y);
    }
  });
});

describe('displayColumn', () => {
  it('counts from 1 at the leftmost column', () => {
    expect(displayColumn(0)).toBe(1);
    expect(displayColumn(49)).toBe(50);
  });
});

describe('cellsBetween', () => {
  it('returns the single cell when both ends are the same', () => {
    expect(cellsBetween({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual([{ x: 3, y: 4 }]);
  });

  it('fills a horizontal run, both ends included', () => {
    expect(cellsBetween({ x: 1, y: 0 }, { x: 4, y: 0 }))
      .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
  });

  it('fills a vertical run', () => {
    expect(cellsBetween({ x: 0, y: 2 }, { x: 0, y: 0 }))
      .toEqual([{ x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }]);
  });

  it('walks a diagonal one cell at a time', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 3 }))
      .toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
  });

  it('bridges a jump a fast drag would otherwise skip', () => {
    // A pointer sampled every ~10 cells must still lay a continuous run, with
    // no gap and no repeated cell.
    const cells = cellsBetween({ x: 0, y: 0 }, { x: 10, y: 3 });
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells.at(-1)).toEqual({ x: 10, y: 3 });
    expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
    for (let i = 1; i < cells.length; i++) {
      const step = Math.max(
        Math.abs(cells[i]!.x - cells[i - 1]!.x),
        Math.abs(cells[i]!.y - cells[i - 1]!.y),
      );
      expect(step).toBe(1); // never leaps over a cell
    }
  });

  it('is symmetric: reversing the ends reverses the path', () => {
    const a = cellsBetween({ x: 0, y: 0 }, { x: 5, y: 2 });
    const b = cellsBetween({ x: 5, y: 2 }, { x: 0, y: 0 });
    expect(b).toEqual([...a].reverse());
  });
});

describe('orientationFor', () => {
  // As in src/data/ports.ts: a straight belt is in N / out S, a corner in N /
  // out W (unmirrored it turns one way only).
  const straight: CatalogEntry = {
    ...single, id: 'straight',
    ports: [{ side: 'N', offset: 0, dir: 'in' }, { side: 'S', offset: 0, dir: 'out' }],
  };
  const cornerPiece: CatalogEntry = {
    ...single, id: 'corner',
    ports: [{ side: 'N', offset: 0, dir: 'in' }, { side: 'W', offset: 0, dir: 'out' }],
  };
  const UP = { dx: 0, dy: -1 };
  const DOWN = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };

  it('leaves an upward straight run unrotated, matching how the artwork is drawn', () => {
    // ports.ts authors every table as flowing upward on screen.
    expect(orientationFor(straight, UP, UP)).toEqual({ rotation: 0, mirrored: false });
  });

  it('turns a straight belt to follow each of the four directions', () => {
    const of = (d: typeof UP) => orientationFor(straight, d, d);
    expect(of(RIGHT)?.rotation).toBe(90);
    expect(of(DOWN)?.rotation).toBe(180);
    expect(of(LEFT)?.rotation).toBe(270);
    // A symmetric object never needs mirroring.
    for (const d of [UP, DOWN, LEFT, RIGHT]) expect(of(d)?.mirrored).toBe(false);
  });

  it('refuses to make a straight belt turn a corner', () => {
    expect(orientationFor(straight, UP, RIGHT)).toBeNull();
    expect(orientationFor(straight, UP, LEFT)).toBeNull();
  });

  it('orients a corner for every turn, mirroring only when it must', () => {
    for (const [incoming, outgoing] of [
      [UP, LEFT], [LEFT, DOWN], [DOWN, RIGHT], [RIGHT, UP],
      [UP, RIGHT], [RIGHT, DOWN], [DOWN, LEFT], [LEFT, UP],
    ] as const) {
      const o = orientationFor(cornerPiece, incoming, outgoing);
      expect(o, `${JSON.stringify(incoming)} -> ${JSON.stringify(outgoing)}`).not.toBeNull();
    }
    // The unmirrored corner turns left, so a right turn needs the mirror.
    expect(orientationFor(cornerPiece, UP, LEFT)?.mirrored).toBe(false);
    expect(orientationFor(cornerPiece, UP, RIGHT)?.mirrored).toBe(true);
  });

  it('refuses a corner asked to go straight on, or to double back', () => {
    expect(orientationFor(cornerPiece, UP, UP)).toBeNull();
    expect(orientationFor(cornerPiece, UP, DOWN)).toBeNull();
  });

  it('returns null for an object without exactly one in and one out port', () => {
    const rack: CatalogEntry = { ...single, ports: [{ side: 'N', offset: 0, dir: 'in' }] };
    expect(orientationFor(rack, UP, UP)).toBeNull();
    expect(orientationFor({ ...single, ports: [] }, UP, UP)).toBeNull();
  });
});

// A 1x3 conveyor: rotating it about its anchor would swing it a cell and a
// half away.
const long1x3: CatalogEntry = { ...wide, id: 'long', footprint: { w: 1, h: 3 } };

const long = (cell: { x: number; y: number }, rotation: Placement['rotation']): Placement => ({
  id: 'a', objectId: 'long', warehouse: 'main', floor: 0, cell, rotation, tier: 1,
});

describe('centreOf', () => {
  it('finds the middle cell of a 1x3', () => {
    expect(centreOf(long({ x: 5, y: 5 }, 0), long1x3.footprint)).toEqual({ x: 5, y: 6 });
  });

  it('follows the footprint round when the object is turned', () => {
    // Turned a quarter, it is 3 wide and 1 tall, so its middle moves along x.
    expect(centreOf(long({ x: 4, y: 6 }, 90), long1x3.footprint)).toEqual({ x: 5, y: 6 });
  });

  it('is exactly the inverse of centredAnchor', () => {
    // Centring on a cell and asking for the centre gives that cell back.
    for (const rotation of [0, 90, 180, 270] as const) {
      const anchor = centredAnchor({ x: 9, y: 4 }, long1x3.footprint, rotation);
      expect(centreOf(long(anchor, rotation), long1x3.footprint)).toEqual({ x: 9, y: 4 });
    }
  });

  it('is the anchor itself for a 1x1', () => {
    expect(centreOf({ ...long({ x: 7, y: 2 }, 0), objectId: 'single' }, single.footprint))
      .toEqual({ x: 7, y: 2 });
  });
});

describe('rotatedAboutCentre', () => {
  it('keeps a 1x3 on its own middle cell', () => {
    // Before: (5,5) (5,6) (5,7); after: (4,6) (5,6) (6,6). The middle cell
    // stays put.
    const before = long({ x: 5, y: 5 }, 0);
    const after = rotatedAboutCentre(before, long1x3.footprint, 90);
    expect(after.cell).toEqual({ x: 4, y: 6 });
    expect(coveredCells(after, long1x3)).toContainEqual({ x: 5, y: 6 });
  });

  it('leaves a 1x1 exactly where it is', () => {
    const before = { ...long({ x: 7, y: 2 }, 0), objectId: 'single' };
    expect(rotatedAboutCentre(before, single.footprint, 90).cell).toEqual({ x: 7, y: 2 });
  });

  it('returns an object to its starting cell after four quarter turns', () => {
    // Four quarter turns bring the object back where it started.
    for (const footprint of [long1x3.footprint, wide.footprint, single.footprint, rect3x2.footprint]) {
      let placement = long({ x: 8, y: 9 }, 0);
      for (let i = 0; i < 4; i++) {
        placement = rotatedAboutCentre(
          placement, footprint, ((placement.rotation + 90) % 360) as Placement['rotation'],
        );
      }
      expect(placement).toEqual(long({ x: 8, y: 9 }, 0));
    }
  });

  it('carries every other field through untouched', () => {
    const before = { ...long({ x: 5, y: 5 }, 0), mirrored: true, tier: 3 };
    const after = rotatedAboutCentre(before, long1x3.footprint, 180);
    expect(after).toMatchObject({ id: 'a', objectId: 'long', mirrored: true, tier: 3, rotation: 180 });
  });
});

describe('orientationFacing', () => {
  // The general form of orientationFor, which refuses a joiner (two in-ports)
  // through its arity guard and delegates its search here.
  const joiner: CatalogEntry = {
    ...single, id: 'joiner',
    // Flows upward like every port table: in from below (N) and from the
    // east, out through the top (S).
    ports: [
      { side: 'N', offset: 0, dir: 'in' },
      { side: 'E', offset: 0, dir: 'in' },
      { side: 'S', offset: 0, dir: 'out' },
    ],
  };

  const UP = { dx: 0, dy: -1 };
  const DOWN = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };

  it('finds the turn that puts every port where it is asked for', () => {
    // A line flowing up, joined from the left: out faces up, one in faces down
    // the line, the other faces left.
    const found = orientationFacing(joiner, [
      { dir: 'out', step: UP },
      { dir: 'in', step: DOWN },
      { dir: 'in', step: LEFT },
    ]);
    expect(found).not.toBeNull();
  });

  it('really does face them, checked back through placedPort', () => {
    // Checks the answer is right, not just that one was found.
    const asked = [
      { dir: 'out' as const, step: RIGHT },
      { dir: 'in' as const, step: LEFT },
      { dir: 'in' as const, step: UP },
    ];
    const found = orientationFacing(joiner, asked)!;
    const facings = joiner.ports.map((p) => ({
      dir: p.dir,
      step: SIDE_STEP[placedPort(p, found.rotation, found.mirrored, joiner.footprint).side],
    }));
    for (const want of asked) {
      expect(facings).toContainEqual({ dir: want.dir, step: want.step });
    }
  });

  it('refuses a set of directions the object cannot make', () => {
    // Its two ins are perpendicular, so it cannot take input from opposite
    // sides; a near-miss orientation would not connect.
    expect(orientationFacing(joiner, [
      { dir: 'in', step: LEFT },
      { dir: 'in', step: RIGHT },
      { dir: 'out', step: UP },
    ])).toBeNull();
  });

  it('will not use one port to satisfy two different asks', () => {
    const straight: CatalogEntry = { ...single, id: 'straight', ports: [
      { side: 'N', offset: 0, dir: 'in' },
      { side: 'S', offset: 0, dir: 'out' },
    ] };
    // Only one in-port exists, so two in-asks cannot both be met.
    expect(orientationFacing(straight, [
      { dir: 'in', step: UP },
      { dir: 'in', step: DOWN },
    ])).toBeNull();
  });

  it('still orients a plain corner, which is what orientationFor asks it', () => {
    const corner: CatalogEntry = { ...single, id: 'corner', ports: [
      { side: 'N', offset: 0, dir: 'in' },
      { side: 'W', offset: 0, dir: 'out' },
    ] };
    const viaGeneral = orientationFacing(corner, [
      { dir: 'in', step: DOWN },
      { dir: 'out', step: LEFT },
    ]);
    // Must agree with orientationFor, which negates the incoming step.
    expect(viaGeneral).toEqual(orientationFor(corner, UP, LEFT));
  });
});

describe('joinerOrientation', () => {
  // The replacement keeps every connection the existing object had and
  // accepts the new run, which covers belt -> joiner and joiner -> 3-way alike.
  const straight: CatalogEntry = { ...single, id: 'straight', ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'S', offset: 0, dir: 'out' },
  ] };
  const joiner: CatalogEntry = { ...single, id: 'joiner', ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'E', offset: 0, dir: 'in' },
    { side: 'S', offset: 0, dir: 'out' },
  ] };
  const threeWay: CatalogEntry = { ...single, id: 'threeWay', ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'E', offset: 0, dir: 'in' },
    { side: 'W', offset: 0, dir: 'in' },
    { side: 'S', offset: 0, dir: 'out' },
  ] };

  const UP = { dx: 0, dy: -1 };
  const DOWN = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };

  const facings = (entry: CatalogEntry, o: { rotation: 0 | 90 | 180 | 270; mirrored: boolean }) =>
    portFacings(entry, o.rotation, o.mirrored);

  /** A belt flowing up the screen, unrotated (S out faces -y). */
  const beltUp = { entry: straight, rotation: 0 as const, mirrored: false };

  it('turns a belt into a joiner that still flows the way the belt did', () => {
    // A join must not reverse the line it joined.
    const o = joinerOrientation(joiner, beltUp, LEFT)!;
    expect(facings(joiner, o)).toContainEqual({ dir: 'out', step: UP });
  });

  it('feeds that joiner from the line AND from the run that arrived', () => {
    const o = joinerOrientation(joiner, beltUp, LEFT)!;
    expect(facings(joiner, o)).toContainEqual({ dir: 'in', step: DOWN });
    expect(facings(joiner, o)).toContainEqual({ dir: 'in', step: RIGHT });
  });

  it('refuses a run arriving ALONG the line rather than across it', () => {
    // Head-on or from behind is the same line, not a junction: no object has
    // two ports facing back down the line.
    expect(joinerOrientation(joiner, beltUp, UP)).toBeNull();
    expect(joinerOrientation(joiner, beltUp, DOWN)).toBeNull();
  });

  it('upgrades a joiner to a three-way when a line arrives on its free side', () => {
    // The joiner is fed from below and the right; a run from the left keeps
    // both and adds itself.
    const asJoiner = joinerOrientation(joiner, beltUp, LEFT)!;
    const existing = { entry: joiner, ...asJoiner };
    const o = joinerOrientation(threeWay, existing, RIGHT)!;

    expect(o).not.toBeNull();
    const now = facings(threeWay, o);
    expect(now).toContainEqual({ dir: 'out', step: UP });
    expect(now).toContainEqual({ dir: 'in', step: DOWN });
    expect(now).toContainEqual({ dir: 'in', step: RIGHT });
    expect(now).toContainEqual({ dir: 'in', step: LEFT });
  });

  it('refuses to upgrade a joiner on a side it is already fed from', () => {
    // Arriving where the joiner already takes input is the same line, and a
    // three-way would leave a port dangling.
    const asJoiner = joinerOrientation(joiner, beltUp, LEFT)!;
    const existing = { entry: joiner, ...asJoiner };
    expect(joinerOrientation(threeWay, existing, LEFT)).toBeNull();
  });

  it('refuses a replacement that cannot keep every old connection', () => {
    // A plain belt has one in-port where the joiner needed two; accepting it
    // would drop a line.
    const asJoiner = joinerOrientation(joiner, beltUp, LEFT)!;
    expect(joinerOrientation(straight, { entry: joiner, ...asJoiner }, RIGHT)).toBeNull();
  });

  it('works for a line running any of the four ways', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const line = { entry: straight, rotation, mirrored: false };
      const flow = portFacings(straight, rotation, false).find((f) => f.dir === 'out')!.step;
      const across = flow.dx === 0 ? RIGHT : DOWN;
      const o = joinerOrientation(joiner, line, across);
      expect(o).not.toBeNull();
      expect(facings(joiner, o!)).toContainEqual({ dir: 'out', step: flow });
    }
  });
});

describe('splitterOrientation', () => {
  // The mirror image of joining, same rule: keep every connection and add one
  // output instead of an input.
  const straight: CatalogEntry = { ...single, id: 'straight', ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'S', offset: 0, dir: 'out' },
  ] };
  const splitter: CatalogEntry = { ...single, id: 'splitter', ports: [
    { side: 'N', offset: 0, dir: 'in' },
    { side: 'S', offset: 0, dir: 'out' },
    { side: 'E', offset: 0, dir: 'out' },
  ] };

  const UP = { dx: 0, dy: -1 };
  const DOWN = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };
  const beltUp = { entry: straight, rotation: 0 as const, mirrored: false };

  const facings = (e: CatalogEntry, o: { rotation: 0 | 90 | 180 | 270; mirrored: boolean }) =>
    portFacings(e, o.rotation, o.mirrored);

  it('keeps the line flowing as it did, and adds the new branch', () => {
    const o = splitterOrientation(splitter, beltUp, LEFT)!;
    expect(facings(splitter, o)).toContainEqual({ dir: 'out', step: UP });   // the line
    expect(facings(splitter, o)).toContainEqual({ dir: 'out', step: LEFT }); // the branch
    expect(facings(splitter, o)).toContainEqual({ dir: 'in', step: DOWN });  // still fed
  });

  it('branches to either side', () => {
    for (const side of [LEFT, RIGHT]) {
      const o = splitterOrientation(splitter, beltUp, side);
      expect(o).not.toBeNull();
      expect(facings(splitter, o!)).toContainEqual({ dir: 'out', step: side });
    }
  });

  it('refuses a run leaving ALONG the line rather than off it', () => {
    // Straight on is the same line: it would need two out-ports facing the
    // same way.
    expect(splitterOrientation(splitter, beltUp, UP)).toBeNull();
  });

  it('refuses a replacement with no second output to give', () => {
    expect(splitterOrientation(straight, beltUp, LEFT)).toBeNull();
  });

  it('is the join rule with an output instead of an input', () => {
    // If these ever disagree, one of them has grown its own arithmetic.
    const joiner: CatalogEntry = { ...single, id: 'joiner', ports: [
      { side: 'N', offset: 0, dir: 'in' },
      { side: 'E', offset: 0, dir: 'in' },
      { side: 'S', offset: 0, dir: 'out' },
    ] };
    expect(splitterOrientation(splitter, beltUp, LEFT))
      .toEqual(orientationFacing(splitter, [
        ...portFacings(straight, 0, false),
        { dir: 'out', step: LEFT },
      ]));
    expect(joinerOrientation(joiner, beltUp, LEFT))
      .toEqual(orientationFacing(joiner, [
        ...portFacings(straight, 0, false),
        { dir: 'in', step: RIGHT },
      ]));
  });
});

describe('a run arriving at a corner', () => {
  const catalogue = getCatalogue();
  const corner = catalogue.get('BP_ConveyorBelt_Corner_Tier1')!;
  const joiner = catalogue.get('BP_ConveyorBelt_Joiner')!;

  it('turns the corner into a joiner that keeps BOTH of its old connections', () => {
    // Drawing into a corner makes a joiner, as drawing into a straight belt
    // does. A corner at rotation 0 takes from (0,1) and puts out to (-1,0); the
    // new arm arrives stepping west, so its input faces east, (1,0).
    const existing = { entry: corner, rotation: 0 as const, mirrored: false };
    const turned = joinerOrientation(joiner, existing, { dx: -1, dy: 0 });

    expect(turned).not.toBeNull();
    const facings = portFacings(joiner, turned!.rotation, turned!.mirrored);
    const steps = (dir: 'in' | 'out') =>
      facings.filter((f) => f.dir === dir).map((f) => `${f.step.dx},${f.step.dy}`);
    expect(steps('in')).toContain('0,1');   // what the corner already took
    expect(steps('in')).toContain('1,0');   // and the arm that just arrived
    expect(steps('out')).toEqual(['-1,0']); // still leaving the way it did
  });

  it('refuses when the new arm cannot be added', () => {
    // A joiner's inputs are at right angles, so an arm arriving opposite the
    // existing one has nowhere to go and the corner is left alone.
    const existing = { entry: corner, rotation: 0 as const, mirrored: false };
    expect(joinerOrientation(joiner, existing, { dx: 0, dy: -1 })).toBeNull();
  });

  it('is listed as something a run can join into', () => {
    expect(JOINS_INTO['BP_ConveyorBelt_Corner_Tier1']).toBe('BP_ConveyorBelt_Joiner');
  });
});
