import type { Cell } from './types';

/**
 * One step of a conveyor: every parcel moves on one cell unless something is
 * in the way.
 *
 * A cell holds one parcel, whatever route brought it, so parcels from
 * different arms of a joiner cannot pass through each other. A whole queue
 * moves up in one step, as a belt does. Pure: returns new indexes.
 */
export interface MovingParcel {
  /** The cells this parcel follows, in order. A cell with a `slot` is told
   * apart by it instead of its position (see RouteStep in simulate.ts). */
  cells: readonly (Cell & { slot?: string })[];
  /** Where it is now, as an index into `cells`. */
  index: number;
  /**
   * For a looping route: the index the parcel rejoins after the last cell,
   * instead of stopping there.
   */
  wrapTo?: number;
  /** Steps it has already waited. At a merge the longer wait goes first, so
   * neither arm of a joiner is starved. */
  heldFor?: number;
}

const key = (cell: Cell & { slot?: string }): string => cell.slot ?? `${cell.x},${cell.y}`;

export function advanceOneCell(parcels: readonly MovingParcel[]): number[] {
  const next = parcels.map((p) => (
    p.index < p.cells.length - 1 ? p.index + 1 : p.wrapTo ?? p.index
  ));

  // Then take moves away until consistent. Repeated because blocking travels
  // backwards along a queue.
  for (let settling = true; settling;) {
    settling = false;

    const taken = new Map<string, number>();
    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i]!;
      const at = key(parcel.cells[next[i]!]!);
      const already = taken.get(at);
      if (already === undefined) {
        taken.set(at, i);
        continue;
      }
      // Two parcels want the same cell: the one standing on it keeps it (so a
      // parked parcel holds a crossing). Otherwise the one that has waited
      // longer goes, so a merge takes from each arm in turn; on a tie the
      // later one in the list, as before.
      const standing = (k: number) => parcels[k]!.index === next[k];
      const waited = (k: number) => parcels[k]!.heldFor ?? 0;
      const stays = standing(already) ? already
        : standing(i) ? i
          : waited(already) > waited(i) ? already : i;
      const gives = stays === already ? i : already;
      taken.set(at, stays);
      if (next[gives] !== parcels[gives]!.index) {
        next[gives] = parcels[gives]!.index;
        settling = true;
      }
    }

  }

  return next;
}

/**
 * Whether a parcel is still on the belt at the end of a step. It leaves when
 * `arrived` (export door or rack), or when stuck too long anywhere on the
 * belt, so loops cannot jam the belts permanently. The threshold sits well
 * above an honest wait at a merge.
 */
export function stillOnTheBelt(
  parcel: { arrived: boolean; moving: boolean; heldFor: number },
  hold: number,
): boolean {
  if (parcel.arrived) return false;
  if (parcel.moving) return true;
  return parcel.heldFor < hold;
}

/**
 * Whether a parcel is on the floor, the failure marked in red. Position alone
 * is not enough: a parcel reaching a door or rack also stands on its route's
 * last cell for one step. Only the reason tells them apart.
 */
export function isOnTheFloor(
  parcel: { index: number; lastIndex: number; arrived: boolean },
): boolean {
  return parcel.index >= parcel.lastIndex && !parcel.arrived;
}
