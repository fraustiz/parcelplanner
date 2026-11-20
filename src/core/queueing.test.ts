import { describe, it, expect } from 'vitest';
import { advanceOneCell, isOnTheFloor, stillOnTheBelt } from './queueing';

/** Compact way to write a route: 'a1 a2 a3' -> cells along x. */
const route = (spec: string) =>
  spec.split(' ').map((s) => ({ x: s.charCodeAt(0) - 97, y: Number(s.slice(1)) }));

describe('parcels stepping one cell at a time', () => {
  it('moves a parcel forward when the way is clear', () => {
    expect(advanceOneCell([{ cells: route('a0 a1 a2'), index: 0 }])).toEqual([1]);
  });

  it('stops at the end of its own route', () => {
    expect(advanceOneCell([{ cells: route('a0 a1'), index: 1 }])).toEqual([1]);
  });

  it('lets a whole queue shift up in ONE step', () => {
    // They all move at once, as parcels on a running belt do.
    const cells = route('a0 a1 a2 a3');
    expect(advanceOneCell([
      { cells, index: 2 },
      { cells, index: 1 },
      { cells, index: 0 },
    ])).toEqual([3, 2, 1]);
  });

  it('holds everyone behind a parcel that cannot move', () => {
    const cells = route('a0 a1 a2');
    expect(advanceOneCell([
      { cells, index: 2 }, // at the end, going nowhere
      { cells, index: 1 },
      { cells, index: 0 },
    ])).toEqual([2, 1, 0]);
  });

  it('BLOCKS AT A CROSSING, where two routes meet', () => {
    // On a multi-joiner, parcels from different arms must not pass through
    // each other: a cell holds one parcel.
    const west = [...route('a5 b5'), ...route('c5 d5')];
    const north = [...route('c3 c4'), ...route('c5 d5')];
    const moved = advanceOneCell([
      { cells: west, index: 1 },  // about to step onto c5
      { cells: north, index: 1 }, // also about to step onto c5
    ]);
    expect(moved.filter((m, i) => m !== [1, 1][i]).length).toBe(1);
  });

  it('lets the second one through once the crossing clears', () => {
    const west = [...route('a5 b5'), ...route('c5 d5')];
    const north = [...route('c3 c4'), ...route('c5 d5')];
    // West is already on the crossing and moving off it; north may follow.
    expect(advanceOneCell([
      { cells: west, index: 2 },
      { cells: north, index: 1 },
    ])).toEqual([3, 2]);
  });

  it('will not step onto a cell another route is PARKED on', () => {
    // A parcel from another arm sits on the joiner going nowhere; stepping
    // onto it would put two parcels in one cell.
    const west = [...route('a5 b5'), ...route('c5')];   // ends on the crossing
    const north = [...route('c3 c4'), ...route('c5 d5')];
    expect(advanceOneCell([
      { cells: west, index: 2 },  // stuck at the end of its own line
      { cells: north, index: 1 }, // wants to step onto c5
    ])).toEqual([2, 1]);
  });

  it('never puts two parcels on one cell', () => {
    const cells = route('a0 a1 a2 a3 a4');
    const moved = advanceOneCell([
      { cells, index: 4 },
      { cells, index: 3 },
      { cells, index: 2 },
    ]);
    expect(new Set(moved).size).toBe(moved.length);
  });
});

describe('a parcel that cannot move', () => {
  const stalled = (held: number) => ({ arrived: false, moving: false, heldFor: held });

  it('waits its turn without being thrown away', () => {
    // Queueing at a merge is normal: a waiting parcel is working, not failing.
    expect(stillOnTheBelt(stalled(0), 12)).toBe(true);
    expect(stillOnTheBelt(stalled(11), 12)).toBe(true);
  });

  it('falls off once it has been stuck far too long', () => {
    // Anywhere on the belt, not only at a route's end, or a loop that drains
    // slower than doors feed it would jam for good.
    expect(stillOnTheBelt(stalled(12), 12)).toBe(false);
  });

  it('leaves a moving parcel alone whatever its count says', () => {
    expect(stillOnTheBelt({ arrived: false, moving: true, heldFor: 99 }, 12)).toBe(true);
  });

  it('removes an arrival at once — it went through the door', () => {
    expect(stillOnTheBelt({ arrived: true, moving: false, heldFor: 0 }, 12)).toBe(false);
  });
});

describe('telling a failure apart from an arrival', () => {
  it('rings a parcel that ran out of belt', () => {
    expect(isOnTheFloor({ index: 3, lastIndex: 3, arrived: false })).toBe(true);
  });

  it('does NOT ring one that reached a door or a rack', () => {
    // It sits on that last cell for a step before removal, so position alone
    // would mark every delivery red.
    expect(isOnTheFloor({ index: 3, lastIndex: 3, arrived: true })).toBe(false);
  });

  it('leaves a travelling parcel alone', () => {
    expect(isOnTheFloor({ index: 1, lastIndex: 3, arrived: false })).toBe(false);
  });
});

describe('a route that loops', () => {
  it('sends the parcel round again instead of stopping it dead', () => {
    // A loop is not a broken line: the parcel goes round again.
    const cells = route('a0 a1 a2 a3');
    expect(advanceOneCell([{ cells, index: 3, wrapTo: 1 }])).toEqual([1]);
  });

  it('rejoins a cell being vacated in the same step', () => {
    // The whole belt moves at once, so the cell ahead being emptied this step
    // is enough.
    const cells = route('a0 a1 a2 a3');
    expect(advanceOneCell([
      { cells, index: 1 },
      { cells, index: 3, wrapTo: 1 },
    ])).toEqual([2, 1]);
  });

  it('waits when the cell it would rejoin is held by something parked', () => {
    const parked = route('a0 a1');            // ends there, going nowhere
    const looping = route('a0 a1 a2 a3');
    expect(advanceOneCell([
      { cells: parked, index: 1 },
      { cells: looping, index: 3, wrapTo: 1 },
    ])).toEqual([1, 3]);
  });

  it('still stops dead when the route does not loop', () => {
    const cells = route('a0 a1');
    expect(advanceOneCell([{ cells, index: 1 }])).toEqual([1]);
  });
});
