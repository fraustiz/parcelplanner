import { describe, it, expect } from 'vitest';
import { displayColumn, displayRow, warehouseDimensions } from '@/core/grid';
import { STAIRS } from './stairs';
import { WAREHOUSES } from './warehouses';

/**
 * Where the flights sit, checked in the rows the rulers display rather than in internal
 * coordinates. Internal y counts down from the top and the ruler counts up from the bottom,
 * so a conversion mistake looks fine in the source.
 */
const dims = warehouseDimensions('second', WAREHOUSES);

const west = STAIRS.find((s) => s.id === 'second-stairs-west')!;
const east = STAIRS.find((s) => s.id === 'second-stairs-east')!;

describe('the Regional warehouse staircases', () => {
  it('has one flight at each end of the ground floor', () => {
    expect(STAIRS).toHaveLength(2);
    expect(STAIRS.every((s) => s.warehouse === 'second' && s.floor === 0)).toBe(true);
  });

  it('starts both flights on displayed row 25', () => {
    expect(displayRow(west.cell.y, dims)).toBe(25);
    expect(displayRow(east.cell.y, dims)).toBe(25);
  });

  it('reaches down to row 24, a flight being 2.2 cells deep', () => {
    // A flight covers rows 25 and 24 and a fifth of 23: a drawing bound, not occupancy.
    expect(displayRow(west.cell.y + west.h, dims)).toBeCloseTo(22.8);
  });

  it('puts the west flight against the west wall, from column 1', () => {
    expect(west.cell.x).toBe(0);
    expect(displayColumn(west.cell.x)).toBe(1);
  });

  it('puts the east flight against the east wall rather than at a fixed column', () => {
    // Each flight hugs its own wall, so the eastern one's right edge is the wall.
    expect(east.cell.x + east.w).toBe(dims.w);
  });

  it('gives both flights the same measured size', () => {
    expect(west.w).toBe(east.w);
    expect(west.h).toBe(east.h);
    // Fractional on purpose: a flight is 1.4 by 2.2 cells.
    expect(Number.isInteger(west.w)).toBe(false);
    expect(Number.isInteger(west.h)).toBe(false);
  });
});
