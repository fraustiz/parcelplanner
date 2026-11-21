import { describe, expect, it } from 'vitest';
import { getCatalogue } from '@/data/catalogue';
import { DOORS } from '@/data/doors';
import { deadEnds } from './dead-ends';
import { buildGraph } from './graph';
import type { Placement, Plan } from './types';

const catalogue = getCatalogue();

/** A straight belt at rotation 0 runs up the screen: in from y+1, out to y-1. */
const put = (id: string, objectId: string, x: number, y: number, over: Partial<Placement> = {}): Placement => ({
  id, objectId, warehouse: 'main', floor: 0, cell: { x, y }, rotation: 0, tier: 1, ...over,
});
const ends = (placements: Placement[]) => {
  const plan: Plan = { gameVersion: 'test', warehouse: 'main', placements };
  return deadEnds(buildGraph(plan, catalogue, DOORS)).map((p) => p.placementId);
};
const BELT = 'BP_ConveyorBelt_Straight_Tier1';

describe('deadEnds', () => {
  it('finds the end of a line that stops in the middle of the floor', () => {
    expect(ends([put('a', BELT, 30, 12), put('b', BELT, 30, 11)])).toEqual(['b']);
  });

  it('says nothing of a line that ends in an export door', () => {
    // main-export-air-0 is at (17, 0), facing up; a belt on its cell feeds it.
    expect(ends([put('a', BELT, 17, 1), put('b', BELT, 17, 0)])).toEqual([]);
  });

  it('says nothing of a splitter with one arm left free, which the game never uses', () => {
    const splitter = put('s', 'BP_ConveyorBelt_Splitter', 30, 12);
    const onward = put('o', BELT, 30, 11);
    const end = put('e', BELT, 30, 10);
    // Only the line straight on is wired, and it leads on to the next belt.
    expect(ends([splitter, onward, end]).filter((id) => id !== 'e')).toEqual([]);
  });

  it('says nothing of a rack, which keeps what it gets', () => {
    expect(ends([put('r', 'BP_StorageRack_ExtraLarge', 30, 10)])).toEqual([]);
  });
});
