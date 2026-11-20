import { describe, it, expect } from 'vitest';
import { isBuildable } from '@/core/grid';
import { canPlace } from '@/core/occupancy';
import { getCatalogue } from './catalogue';
import { DOORS } from './doors';
import { WAREHOUSES } from './warehouses';

describe('DOORS', () => {
  it('leaves every door cell free to build a conveyor on', () => {
    // A door is an opening, not an obstacle: a chain can only meet a door's port on the door's
    // own cell (see buildGraph), so that cell must stay placeable. Checked on the real tables.
    const catalogue = getCatalogue();
    const plan = {
      gameVersion: 'test', warehouse: 'main' as const, placements: [],
    };
    for (const door of DOORS.filter((d) => d.warehouse === 'main' && d.floor === 0)) {
      const candidate = {
        id: 'probe', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main' as const,
        floor: 0, cell: door.cell, rotation: 0 as const, tier: 1,
      };
      expect(canPlace(plan, candidate, catalogue, WAREHOUSES), door.id).toBeNull();
    }
  });

  it('has all 33 fixed doors: 11 delivery, 10 cargo-side export, 12 country export', () => {
    expect(DOORS).toHaveLength(33);
    expect(DOORS.filter((d) => d.kind === 'delivery')).toHaveLength(11);
    expect(DOORS.filter((d) => d.kind === 'export')).toHaveLength(10);
    expect(DOORS.filter((d) => d.kind === 'country-export')).toHaveLength(12);
  });

  it('gives the second warehouse the exits it actually has, on both levels', () => {
    // Cell x values agree with both the level's world coordinates (Secondary origin -4000, /100)
    // and the community spreadsheet's door markers.
    const exits = DOORS.filter((d) => d.warehouse === 'second' && d.kind === 'country-export');
    const xs = (floor: number) => exits.filter((d) => d.floor === floor).map((d) => d.cell.x).sort((a, b) => a - b);
    expect(xs(0)).toEqual([7, 12, 17, 52, 57, 62]);
    // The mezzanine's end doors (x=7 and x=62) are reject bins: the spreadsheet flags only the middle six.
    expect(xs(1)).toEqual([22, 27, 32, 37, 42, 47]);
    // All on the same y=0 wall, the one opposite the express delivery doors.
    for (const d of exits) {
      expect(d.cell.y).toBe(0);
      expect(d.side).toBe('S');
    }
  });

  it('puts the second warehouse\'s deliveries and exits on opposite walls', () => {
    // The building is stored rotated 180 degrees (see warehouses.ts); either way, parcels enter
    // at one end and leave at the other.
    const second = DOORS.filter((d) => d.warehouse === 'second');
    const deliveries = second.filter((d) => d.kind === 'delivery');
    const exits = second.filter((d) => d.kind === 'country-export');
    expect(deliveries.every((d) => d.cell.y === 59 && d.side === 'N')).toBe(true);
    expect(exits.every((d) => d.cell.y === 0 && d.side === 'S')).toBe(true);
    // The delivery x values match the spreadsheet only in this orientation.
    expect(deliveries.map((d) => d.cell.x).sort((a, b) => a - b))
      .toEqual([12, 22, 32, 42, 52, 62]);
  });

  it('never gives a country door a cargo type, which would make it a cargo exit', () => {
    for (const d of DOORS.filter((d) => d.kind === 'country-export')) {
      expect(d.cargoTypes).toBeUndefined();
    }
  });

  it('places every door cell inside a buildable block of its own warehouse/floor', () => {
    // A door on a non-buildable cell means a transcription error in the hand-converted table.
    for (const door of DOORS) {
      expect(isBuildable(door.warehouse, door.floor, door.cell, WAREHOUSES)).toBe(true);
    }
  });

  it('leaves room outside every door for its 3-wide, 2-deep loading bay', () => {
    // A door's bay (doorBayRect in src/render/renderer.ts) is painted opaque, so it must never
    // cover a buildable cell. The bay is three cells wide and could wrap an inner corner.
    const OUT: Record<string, { dx: number; dy: number }> = {
      N: { dx: 0, dy: 1 }, S: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 },
    };
    for (const door of DOORS) {
      const out = OUT[door.side]!;
      // The wall-parallel axis is whichever one the bay does not grow along.
      const along = { dx: out.dy === 0 ? 0 : 1, dy: out.dx === 0 ? 0 : 1 };
      for (let depth = 1; depth <= 2; depth++) {
        for (const offset of [-1, 0, 1]) {
          const cell = {
            x: door.cell.x + out.dx * depth + along.dx * offset,
            y: door.cell.y + out.dy * depth + along.dy * offset,
          };
          expect(
            isBuildable(door.warehouse, door.floor, cell, WAREHOUSES),
            `${door.id}'s bay would cover buildable cell (${cell.x}, ${cell.y})`,
          ).toBe(false);
        }
      }
    }
  });

  it('has unique ids', () => {
    const ids = DOORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never assigns a country to an export door', () => {
    // The game exposes no country per export door, so none may be modelled.
    for (const door of DOORS) {
      if (door.kind !== 'export') continue;
      for (const type of door.cargoTypes ?? []) {
        expect(['Road', 'Rail', 'Air', 'Maritime']).toContain(type);
      }
    }
  });

  it('puts a reject bin at each end of the mezzanine', () => {
    const bins = DOORS.filter(
      (d) => d.warehouse === 'second' && d.floor === 1 && d.kind === 'export',
    );
    expect(bins.map((d) => d.cell.x).sort((a, b) => a - b)).toEqual([7, 62]);
    // A reject bin takes anything, so it must carry no cargo type at all.
    for (const d of bins) expect(d.cargoTypes).toBeUndefined();
  });

  it('marks exactly four export doors as reject bins (no cargoTypes)', () => {
    // Scoped to kind 'export': a country door also has no cargo types but is not a reject bin.
    const rejectBins = DOORS.filter((d) => d.kind === 'export' && (d.cargoTypes ?? []).length === 0);
    expect(rejectBins).toHaveLength(4); // 2 on main, 2 on the second's mezzanine
  });

  it('marks the always-unlocked main delivery door at (47, 39)', () => {
    const door = DOORS.find((d) => d.warehouse === 'main' && d.cell.x === 47 && d.cell.y === 39);
    expect(door?.kind).toBe('delivery');
  });
});
