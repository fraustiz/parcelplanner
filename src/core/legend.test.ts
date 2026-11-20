import { describe, it, expect } from 'vitest';
import { legendOf } from './legend';
import type { CatalogEntry, Door, Placement, Plan } from './types';

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: null, maxTier: 3, ports: [],
};
const scanner: CatalogEntry = { ...belt, id: 'scanner', category: 'scanner' };
const lift: CatalogEntry = { ...belt, id: 'lift', spansTheFloorAbove: true };
const zone: CatalogEntry = { ...belt, id: 'zone-2x2', category: 'zone', footprint: { w: 2, h: 2 }, price: 0 };
const catalogue = new Map([belt, scanner, lift, zone].map((e) => [e.id, e]));

const put = (id: string, objectId: string, over: Partial<Placement> = {}): Placement => ({
  id, objectId, warehouse: 'second', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1, ...over,
});
const plan = (placements: Placement[]): Plan => ({ gameVersion: 'test', warehouse: 'second', placements });
const door = (over: Partial<Door>): Door => ({
  id: 'd', warehouse: 'second', floor: 0, cell: { x: 0, y: 0 }, side: 'N', kind: 'delivery', ...over,
});

describe('legendOf', () => {
  it('counts each object on the floor, most numerous first', () => {
    const entries = legendOf(plan([put('a', 'scanner'), put('b', 'belt'), put('c', 'belt')]), 0, catalogue, []);
    expect(entries).toEqual([
      { kind: 'object', objectId: 'belt', count: 2 },
      { kind: 'object', objectId: 'scanner', count: 1 },
    ]);
  });

  it('explains only what is on the picture: this floor, this building', () => {
    const entries = legendOf(plan([
      put('a', 'belt', { floor: 1 }),
      put('b', 'scanner', { warehouse: 'main' }),
    ]), 0, catalogue, []);
    expect(entries).toEqual([]);
  });

  it('counts the elevator upstairs too, where it is drawn', () => {
    const entries = legendOf(plan([put('l', 'lift')]), 1, catalogue, []);
    expect(entries).toEqual([{ kind: 'object', objectId: 'lift', count: 1 }]);
  });

  it('gives zones of one name and colour a single row, apart from the objects', () => {
    const entries = legendOf(plan([
      put('z1', 'zone-2x2', { label: 'Walkway' }),
      put('z2', 'zone-2x2', { label: 'Walkway', cell: { x: 5, y: 5 } }),
      put('z3', 'zone-2x2', { label: 'Desk', colour: '#75bb59', cell: { x: 9, y: 9 } }),
      put('z4', 'zone-2x2', { cell: { x: 12, y: 12 } }),
    ]), 0, catalogue, []);
    expect(entries).toEqual([
      { kind: 'zone', label: 'Walkway', count: 2 },
      { kind: 'zone', count: 1 },
      { kind: 'zone', label: 'Desk', colour: '#75bb59', count: 1 },
    ]);
  });

  it('says what each door colour on this floor means, and the logos on them', () => {
    const entries = legendOf(plan([]), 0, catalogue, [
      door({ kind: 'export', cargoTypes: ['Air', 'Maritime'] }),
      door({ kind: 'delivery' }),
      door({ kind: 'export', cargoTypes: [] }),
      door({ kind: 'export', cargoTypes: ['Road', 'Air'] }),
      door({ kind: 'country-export' }),
      door({ kind: 'delivery', floor: 1 }),
      door({ kind: 'export', warehouse: 'main', cargoTypes: ['Rail'] }),
    ]);
    expect(entries).toEqual([
      { kind: 'door', look: 'delivery' },
      { kind: 'door', look: 'exit' },
      { kind: 'door', look: 'reject' },
      { kind: 'cargo', type: 'Air' },
      { kind: 'cargo', type: 'Maritime' },
      { kind: 'cargo', type: 'Road' },
      { kind: 'country' },
    ]);
  });
});
