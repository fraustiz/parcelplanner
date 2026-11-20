import type { WarehouseId } from '@/core/types';

/**
 * The fixed staircases between a warehouse's floors, one at each end of the Regional warehouse:
 * displayed rows 24-25, columns 1-2 and 69-70. Internal y counts down from the top while the
 * rulers count up, hence `y: 35` for row 25 (see displayRow); stairs.test.ts pins displayed rows.
 *
 * Extents are fractional drawing bounds (1.4 by 2.2 cells), not occupancy: stairs do not block
 * building. Each flight hugs its own wall, so the eastern one is measured from the far edge.
 */
export interface Stairs {
  id: string;
  warehouse: WarehouseId;
  /** The floor you climb from. */
  floor: number;
  /** Top-left corner, in internal coordinates. Fractional, like the extents. */
  cell: { x: number; y: number };
  /** Width and depth in cells, fractional. */
  w: number;
  h: number;
}

/** The dimensions of one flight, in cells, measured in game. */
const FLIGHT_W = 1.4;
const FLIGHT_H = 2.2;
/** Full width of the Regional warehouse, for the flight against the far wall. */
const SECOND_WIDTH = 70;

/** Internal y of the flights' top edge (displayed row 25 in a 60-deep warehouse), shared by both. */
const FLIGHT_Y = 35;

export const STAIRS: readonly Stairs[] = [
  // Row 25 downward (y 35), each against its own wall.
  {
    id: 'second-stairs-west', warehouse: 'second', floor: 0,
    cell: { x: 0, y: FLIGHT_Y }, w: FLIGHT_W, h: FLIGHT_H,
  },
  {
    id: 'second-stairs-east', warehouse: 'second', floor: 0,
    cell: { x: SECOND_WIDTH - FLIGHT_W, y: FLIGHT_Y }, w: FLIGHT_W, h: FLIGHT_H,
  },
];
