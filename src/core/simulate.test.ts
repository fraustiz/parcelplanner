import { describe, it, expect } from 'vitest';
import { entryPoints, feedingDoors, mostlyStraight, parcelPath } from './simulate';
import type { Edge } from './graph';

/**
 * One parcel walked along the flow graph. Not a sorting simulation: scanner
 * verdicts are a coin toss (see src/core/simulate.ts).
 */
const edges = (...pairs: [string, string][]): Edge[] =>
  pairs.map(([from, to]) => ({ from, to }));

/** Always takes the first option, so tests assert the walk, not the dice. */
const first = (options: readonly string[]) => options[0]!;

describe('parcelPath', () => {
  it('follows a straight run to its end', () => {
    const r = parcelPath(edges(['a', 'b'], ['b', 'c']), 'a', first);
    expect(r.path).toEqual(['a', 'b', 'c']);
  });

  it('says the parcel DROPS when nothing carries it on', () => {
    // A line that stops in mid-air: parcels fall on the floor.
    const r = parcelPath(edges(['a', 'b']), 'a', first);
    expect(r.ending).toBe('dropped');
    expect(r.path.at(-1)).toBe('b');
  });

  it('says it LOOPS rather than walking for ever', () => {
    const r = parcelPath(edges(['a', 'b'], ['b', 'c'], ['c', 'a']), 'a', first);
    expect(r.ending).toBe('looped');
    // The repeated node is included once, so the ring is visible in the path.
    expect(r.path).toEqual(['a', 'b', 'c']);
  });

  it('asks the chooser at a branch, and takes what it says', () => {
    const seen: string[][] = [];
    const takeLast = (options: readonly string[]) => {
      seen.push([...options]);
      return options[options.length - 1]!;
    };
    const r = parcelPath(edges(['s', 'left'], ['s', 'right']), 's', takeLast);
    expect(seen).toEqual([['left', 'right']]);
    expect(r.path).toEqual(['s', 'right']);
  });

  it('does not ask the chooser where there is nothing to choose', () => {
    let asked = 0;
    parcelPath(edges(['a', 'b']), 'a', (o) => { asked++; return o[0]!; });
    expect(asked).toBe(0);
  });

  it('records which hops were a guess, so the app can say so', () => {
    // A branch taken on a coin toss must be distinguishable from a hop with
    // only one way out.
    const r = parcelPath(edges(['a', 'b'], ['b', 'x'], ['b', 'y']), 'a', first);
    expect(r.path).toEqual(['a', 'b', 'x']);
    expect(r.guessedAt).toEqual(['b']);
  });

  it('stops at a hop limit rather than trusting the graph', () => {
    // A malformed graph must not hang the editor.
    const long = Array.from({ length: 50 }, (_, i) => [`n${i}`, `n${i + 1}`] as [string, string]);
    const r = parcelPath(edges(...long), 'n0', first, { maxHops: 10 });
    expect(r.ending).toBe('exhausted');
    expect(r.path).toHaveLength(11);
  });

  it('goes nowhere from a node the graph does not know', () => {
    const r = parcelPath(edges(['a', 'b']), 'ghost', first);
    expect(r.path).toEqual(['ghost']);
    expect(r.ending).toBe('dropped');
  });
});

describe('entryPoints', () => {
  // Play sends a parcel in at every delivery door at once. Doors are not
  // placements, so the entry is the first object each one feeds.
  const edges2 = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

  it('gives the object each door feeds, not the door', () => {
    const found = entryPoints(
      edges2(['door:a', 'belt1'], ['belt1', 'belt2'], ['door:b', 'belt9']),
      new Set(['door:a', 'door:b']),
    );
    expect([...found].sort()).toEqual(['belt1', 'belt9']);
  });

  it('ignores a door that feeds nothing', () => {
    // Unwired doors are not a failure, just not an entry.
    const found = entryPoints(edges2(['door:a', 'belt1']), new Set(['door:a', 'door:idle']));
    expect([...found]).toEqual(['belt1']);
  });

  it('names each object once even when two doors feed it', () => {
    const found = entryPoints(
      edges2(['door:a', 'shared'], ['door:b', 'shared']),
      new Set(['door:a', 'door:b']),
    );
    expect([...found]).toEqual(['shared']);
  });

  it('never returns another door, even if one feeds another', () => {
    const found = entryPoints(edges2(['door:a', 'door:b']), new Set(['door:a', 'door:b']));
    expect([...found]).toEqual([]);
  });

  it('finds nothing on an empty plan rather than throwing', () => {
    expect([...entryPoints([], new Set(['door:a']))]).toEqual([]);
  });
});

describe('a parcel that reaches an exit', () => {
  const edges = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));
  const first = (o: readonly string[]) => o[0]!;

  it('is DELIVERED, not dropped', () => {
    // An export door has nothing leading out, so without the exits set a walk
    // ending there looks like a dead end.
    const r = parcelPath(edges(['a', 'b'], ['b', 'exit']), 'a', first, {
      exits: new Set(['exit']),
    });
    expect(r.ending).toBe('delivered');
  });

  it('still counts the exit as somewhere it went', () => {
    // The parcel enters the door before it disappears, so the door's node is
    // on the path.
    const r = parcelPath(edges(['a', 'exit']), 'a', first, { exits: new Set(['exit']) });
    expect(r.path).toEqual(['a', 'exit']);
  });

  it('drops when the line stops short of any exit', () => {
    const r = parcelPath(edges(['a', 'b']), 'a', first, { exits: new Set(['exit']) });
    expect(r.ending).toBe('dropped');
  });

  it('takes the hop limit as an option, not a position', () => {
    const long: [string, string][] = Array.from({ length: 30 }, (_, i) => [`n${i}`, `n${i + 1}`]);
    const r = parcelPath(edges(...long), 'n0', first, { maxHops: 10 });
    expect(r.ending).toBe('exhausted');
  });
});

describe('a parcel that reaches somewhere it belongs', () => {
  const edges = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));
  const first = (o: readonly string[]) => o[0]!;

  it('is STORED when it ends in a storage rack', () => {
    // A rack has an in port and no out port by design: it stores parcels and
    // is not a dead end.
    const r = parcelPath(edges(['a', 'rack']), 'a', first, { stores: new Set(['rack']) });
    expect(r.ending).toBe('stored');
  });

  it('tells a rack apart from an export door', () => {
    const r = parcelPath(edges(['a', 'exit']), 'a', first, {
      exits: new Set(['exit']),
      stores: new Set(['rack']),
    });
    expect(r.ending).toBe('delivered');
  });

  it('still drops when it ends at neither', () => {
    const r = parcelPath(edges(['a', 'b']), 'a', first, {
      exits: new Set(['exit']),
      stores: new Set(['rack']),
    });
    expect(r.ending).toBe('dropped');
  });
});

describe('choosing a branch at a checker', () => {
  const opts = ['straight', 'left', 'right'] as const;

  it('sends the parcel straight on nearly every time', () => {
    // A sticker checker has three outputs and only one is "carry on"; a fair
    // toss would send two parcels in three to a reject line.
    expect(mostlyStraight([...opts], 'straight', 0.5, 0.1)).toBe('straight');
    expect(mostlyStraight([...opts], 'straight', 0.11, 0.1)).toBe('straight');
  });

  it('still refuses some, and shares them between the reject lines', () => {
    expect(mostlyStraight([...opts], 'straight', 0.0, 0.1)).toBe('left');
    expect(mostlyStraight([...opts], 'straight', 0.09, 0.1)).toBe('right');
  });

  it('falls back to a fair pick when nothing lies straight ahead', () => {
    // The straight output leads nowhere, so every parcel goes sideways.
    expect(mostlyStraight(['left', 'right'], undefined, 0.0, 0.1)).toBe('left');
    expect(mostlyStraight(['left', 'right'], undefined, 0.9, 0.1)).toBe('right');
  });

  it('sends everything straight when that is the only way out', () => {
    expect(mostlyStraight(['straight'], 'straight', 0.0, 0.1)).toBe('straight');
  });
});

describe('where a loop closes', () => {
  const edges = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));
  const first = (o: readonly string[]) => o[0]!;

  it('says which step the route comes back to', () => {
    // A loop is not a failure: the walk says where it rejoins so the parcel can
    // go round again.
    const r = parcelPath(edges(['a', 'b'], ['b', 'c'], ['c', 'b']), 'a', first);
    expect(r.ending).toBe('looped');
    expect(r.path).toEqual(['a', 'b', 'c']);
    expect(r.loopsBackTo).toBe(1); // back to 'b'
  });

  it('says nothing about rejoining when the walk did not loop', () => {
    expect(parcelPath(edges(['a', 'b']), 'a', first).loopsBackTo).toBeUndefined();
  });

  it('handles a loop that closes on the very first step', () => {
    const r = parcelPath(edges(['a', 'b'], ['b', 'a']), 'a', first);
    expect(r.loopsBackTo).toBe(0);
  });
});

describe('which doors are actually wired up', () => {
  const edges = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

  it('counts only the doors that feed something', () => {
    // The storage planner counts only doors that feed something: two wired of
    // five must not ask for the racks of five.
    const doors = new Set(['d1', 'd2', 'd3']);
    const fed = feedingDoors(edges(['d1', 'belt'], ['d3', 'other']), doors);
    expect([...fed].sort()).toEqual(['d1', 'd3']);
  });

  it('ignores a door that only reaches another door', () => {
    const doors = new Set(['d1', 'd2']);
    expect(feedingDoors(edges(['d1', 'd2']), doors).size).toBe(0);
  });

  it('counts a door once however much it feeds', () => {
    const doors = new Set(['d1']);
    expect(feedingDoors(edges(['d1', 'a'], ['d1', 'b']), doors).size).toBe(1);
  });
});
