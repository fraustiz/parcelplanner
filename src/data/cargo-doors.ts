import { isCargoDoor } from '@/core/door-cargo';
import { SIDE_STEP } from '@/core/grid';
import type { Cell, Door, WarehouseId } from '@/core/types';
import { DOORS } from './doors';

/** The export doors sorted by cargo type, whose types the player can set (`Plan.doorCargo`). */
export const CARGO_DOORS: readonly Door[] = DOORS.filter(isCargoDoor);

/**
 * The cargo door whose bay covers `cell`: the 3 x 3 cells drawn outside the wall in front of
 * it, as for a country door (see `countryDoorAt`), so clicking the door's glyphs opens its types.
 */
export function cargoDoorAt(warehouse: WarehouseId, floor: number, cell: Cell): Door | undefined {
  return CARGO_DOORS.find((door) => {
    if (door.warehouse !== warehouse || door.floor !== floor) return false;
    const out = SIDE_STEP[door.side];
    const dx = cell.x - door.cell.x;
    const dy = cell.y - door.cell.y;
    const depth = dx * out.dx + dy * out.dy;
    const along = out.dx === 0 ? dx : dy;
    return depth >= 1 && depth <= 3 && Math.abs(along) <= 1;
  });
}

/** The cargo door at `cell` for the right-click menu: its bay, or the door's own cell in the wall. */
export function cargoDoorNear(warehouse: WarehouseId, floor: number, cell: Cell): Door | undefined {
  return cargoDoorAt(warehouse, floor, cell) ?? CARGO_DOORS.find((door) =>
    door.warehouse === warehouse && door.floor === floor && door.cell.x === cell.x && door.cell.y === cell.y);
}
