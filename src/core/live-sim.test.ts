import { describe, expect, it } from 'vitest';
import { EMPTY_SIM, stepSim, type Branch, type SimContext, type SimSource, type SimState, type Walk } from './live-sim';
import type { ParcelLabels } from './parcel-labels';
import type { RouteStep } from './simulate';

/** Cells along x, each its own node unless named. */
const line = (name: string, length: number, from = 0): RouteStep[] =>
  Array.from({ length }, (_, i) => ({
    x: from + i, y: 0, floor: 0, node: `${name}${i}`, slot: `${name}${i}`,
  }));

const labels: ParcelLabels = { valid: true, cargo: 'Road', sticker: null, country: null };

const door = (key: string, walk: () => Walk): SimSource => ({ key, slot: walk().cells[0]!.slot, walk });

const context = (over: Partial<SimContext>): SimContext => ({
  sources: [],
  capacity: new Map(),
  draw: () => ({ ...labels }),
  branches: () => null,
  misSorted: () => false,
  slideSeconds: () => 2,
  stopSeconds: () => 0,
  isClosed: () => false,
  unloadSeconds: 2.65,
  retrySeconds: 1,
  maxParcels: 4000,
  ...over,
});

/** Runs the preview for `seconds` in steps of `dt`. */
const run = (ctx: SimContext, seconds: number, dt = 0.25, from: SimState = EMPTY_SIM): SimState => {
  let state = from;
  for (let t = 0; t < seconds - 1e-9; t += dt) state = stepSim(state, ctx, dt);
  return state;
};

describe('the timed parcel preview', () => {
  it('delivers one parcel per cell-time down a free line', () => {
    const cells = line('a', 5);
    const ctx = context({ sources: [door('d', () => ({ cells, ending: 'delivered' }))] });
    const state = run(ctx, 120);
    // A cell takes 2 s, so a free line passes one parcel every 2 s.
    expect(state.delivered).toBeGreaterThanOrEqual(55);
    expect(state.delivered).toBeLessThanOrEqual(60);
    expect(state.fell).toBe(0);
  });

  it('keeps its pace whatever the step length', () => {
    const cells = line('a', 5);
    const ctx = context({ sources: [door('d', () => ({ cells, ending: 'delivered' }))] });
    const fine = run(ctx, 120, 0.1).delivered;
    const coarse = run(ctx, 120, 0.5).delivered;
    expect(Math.abs(fine - coarse)).toBeLessThanOrEqual(1);
  });

  it('slows the whole line to a scanner that stops each parcel', () => {
    const cells = line('a', 5);
    const ctx = context({
      sources: [door('d', () => ({ cells, ending: 'delivered' }))],
      stopSeconds: (cell) => (cell.node === 'a2' ? 10 : 0),
    });
    // 2 s to slide onto the scanner plus 10 s of scan: one parcel every 12 s.
    const state = run(ctx, 240);
    expect(state.delivered).toBeGreaterThanOrEqual(18);
    expect(state.delivered).toBeLessThanOrEqual(20);
  });

  it('holds parcels at a closed pauser without dropping any', () => {
    const cells = line('a', 6);
    const ctx = context({
      sources: [door('d', () => ({ cells, ending: 'delivered' }))],
      isClosed: (node) => node === 'a4',
    });
    const state = run(ctx, 300);
    expect(state.delivered).toBe(0);
    expect(state.fell).toBe(0);
    // The line up to the pauser fills, one parcel a cell; nothing gets past it.
    expect(state.parcels).toHaveLength(5);
  });

  it('fills a rack to its capacity, then queues in front of it', () => {
    const cells = [...line('a', 3), { x: 3, y: 0, floor: 0, node: 'rack', slot: 'rack' }];
    const ctx = context({
      sources: [door('d', () => ({ cells, ending: 'stored', endsAt: 'rack' }))],
      capacity: new Map([['rack', 16]]),
    });
    const state = run(ctx, 200);
    expect(state.racks.rack).toHaveLength(16);
    expect(state.fell).toBe(0);
    expect(state.parcels.length).toBeGreaterThanOrEqual(3);
  });

  it('empties a rack through an unloader at the unloader pace, with each parcel as stored', () => {
    const out = line('u', 3);
    const stored: ParcelLabels[] = Array.from({ length: 10 }, (_, i) => ({ ...labels, cargo: i % 2 ? 'Air' : 'Rail' }));
    const ctx = context({
      sources: [{ key: 'u', slot: out[0]!.slot, rack: 'rack', walk: () => ({ cells: out, ending: 'delivered' }) }],
      capacity: new Map([['rack', 16]]),
    });
    const state = run(ctx, 20, 0.25, { ...EMPTY_SIM, racks: { rack: stored } });
    // 2.65 s apart: about 7 out in 20 s, oldest first.
    const gone = 10 - state.racks.rack!.length;
    expect(gone).toBeGreaterThanOrEqual(7);
    expect(gone).toBeLessThanOrEqual(8);
    expect(state.parcels.map((p) => p.labels.cargo)[0]).toBe('Rail');
  });
});

describe('a delivery door in the timed preview', () => {
  it('brings a truckload, then waits for its timer before the next', () => {
    const cells = line('a', 3);
    const ctx = context({
      sources: [{ ...door('d', () => ({ cells, ending: 'delivered' })), truck: { parcels: 3, every: 40 } }],
    });
    // Three parcels 2 s apart, then nothing until the door reopens at 40 s.
    expect(run(ctx, 30).delivered).toBe(3);
    expect(run(ctx, 39).delivered).toBe(3);
    expect(run(ctx, 60).delivered).toBe(6);
  });

  it('opens late when the last truck is still unloading', () => {
    const cells = line('a', 3);
    const ctx = context({
      sources: [{ ...door('d', () => ({ cells, ending: 'delivered' })), truck: { parcels: 7, every: 10 } }],
    });
    // Seven parcels take 14 s to leave, longer than the 10 s timer: the line,
    // not the timer, sets the pace, one parcel every 2 s.
    const state = run(ctx, 100);
    expect(state.delivered).toBeGreaterThanOrEqual(45);
    expect(state.delivered).toBeLessThanOrEqual(50);
  });
});

describe('a smart splitter in the timed preview', () => {
  /** A door line into a splitter, which has two ways on, each to its own door. */
  const setup = (blocked?: string) => {
    const into = [...line('a', 3), { x: 3, y: 0, floor: 0, node: 'split', slot: 'split' }];
    const ways: Branch[] = ['left', 'right'].map((side) => {
      const cells = line(side, 4, 4);
      return { slot: cells[0]!.slot, walk: () => ({ cells, ending: 'delivered', endsAt: side }) };
    });
    return context({
      sources: [door('d', () => ({ cells: into, ending: 'pending', endsAt: 'split' }))],
      branches: () => ({ wanted: ways, fallback: [] }),
      isClosed: (node) => node === blocked,
    });
  };

  it('takes its ways in turn while both are free', () => {
    let state: SimState = EMPTY_SIM;
    const sent: string[] = [];
    const seen = new Set<object>();
    for (let t = 0; t < 60; t += 0.25) {
      state = stepSim(state, setup(), 0.25);
      for (const p of state.parcels) {
        if (p.ending !== 'pending' && !seen.has(p.labels)) { seen.add(p.labels); sent.push(p.endsAt!); }
      }
    }
    expect(sent.length).toBeGreaterThan(6);
    for (let i = 1; i < sent.length; i++) expect(sent[i]).not.toBe(sent[i - 1]);
  });

  it('sends everything the free way when the other is backed up', () => {
    // The right way's last cell holds parcels, so it fills and blocks.
    const state = run(setup('right3'), 300);
    expect(state.fell).toBe(0);
    // The left way keeps delivering long after the right one is full.
    expect(state.delivered).toBeGreaterThan(100);
  });
});
