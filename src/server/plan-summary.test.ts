import { describe, it, expect } from 'vitest';
import { summarise } from './plan-summary';
import type { Placement, Plan } from '@/core/types';

const belt = (id: string, warehouse: 'main' | 'second'): Placement => ({
  id, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse,
  floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1,
});

const plan = (placements: Placement[]): Plan => ({
  gameVersion: 'test', warehouse: 'main', placements,
});

describe('summarise', () => {
  it('counts every object and prices them', () => {
    const s = summarise(plan([belt('a', 'main'), belt('b', 'main')]));
    expect(s.objects).toBe(2);
    expect(s.cost).toBeGreaterThan(0);
  });

  it('does not count a reserved zone as an object', () => {
    // A zone is reserved floor, not a bought object, so it is not counted.
    const zone: Placement = { ...belt('z', 'main'), objectId: 'zone-3x2', cell: { x: 5, y: 5 } };
    expect(summarise(plan([belt('a', 'main'), zone])).objects).toBe(1);
  });

  it('leaves the workshop out, since nothing on it is built', () => {
    const bench: Placement = { ...belt('w', 'main'), warehouse: 'workshop' };
    const s = summarise(plan([belt('a', 'main'), bench]));
    expect(s.objects).toBe(1);
    expect(s.warehouses).toEqual(['main']);
    expect(s.cost).toBe(summarise(plan([belt('a', 'main')])).cost);
  });

  it('names only the buildings actually used', () => {
    expect(summarise(plan([belt('a', 'main')])).warehouses).toEqual(['main']);
    expect(summarise(plan([belt('a', 'second')])).warehouses).toEqual(['second']);
  });

  it('names both when a plan spans them', () => {
    expect(summarise(plan([belt('a', 'main'), belt('b', 'second')])).warehouses)
      .toEqual(['main', 'second']);
  });

  it('picks the busiest building, which is the one worth showing', () => {
    // A card frames one warehouse, so it picks the one with more in it.
    const lopsided = plan([belt('a', 'main'), belt('b', 'second'), belt('c', 'second')]);
    expect(summarise(lopsided).busiest).toBe('second');
  });

  it('breaks a tie towards the main warehouse, where most plans live', () => {
    expect(summarise(plan([belt('a', 'main'), belt('b', 'second')])).busiest).toBe('main');
  });

  it('handles an empty plan without inventing anything', () => {
    const s = summarise(plan([]));
    expect(s).toMatchObject({ objects: 0, cost: 0, warehouses: [], busiest: 'main' });
  });
});
