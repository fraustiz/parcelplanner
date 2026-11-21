/**
 * How much storage a delivery schedule demands: a cargo type refused on some
 * days piles up, so racks must hold its daily volume times the longest run of
 * refused days. Daily intake comes from `src/data/deliveries.ts`, the schedule
 * from the player.
 */

/**
 * The most consecutive days a cargo type is not accepted, wrapping around the
 * end of the week (a weekend closure spans the join). Capped at the week's
 * length, which is also the answer for a type never accepted.
 */
export function longestClosedRun(accepted: ReadonlySet<number>, weekLength: number): number {
  let longest = 0;
  let run = 0;
  // Twice round the week, so a run straddling the join is seen whole.
  for (let i = 0; i < weekLength * 2; i++) {
    run = accepted.has(i % weekLength) ? 0 : run + 1;
    if (run > longest) longest = run;
    if (longest >= weekLength) return weekLength;
  }
  return longest;
}

export interface StorageNeed {
  /** Parcels of this type arriving each day. */
  perDay: number;
  /** The longest run of days it cannot be sent out. */
  closedRun: number;
  /** Parcels waiting by the end of that run: the pile to be stored. */
  parcels: number;
  /** How many racks of each size would hold that pile. */
  racks: { small: number; medium: number; large: number };
}

/** Parcels a rack holds, by the name the game shows. Kept here so `src/core/`
 * stays free of `src/data` (verified in src/data/storage.ts). */
const HOLDS = { small: 8, medium: 12, large: 16 };

export function storageNeeded(input: {
  /** Parcels arriving across all delivery doors each day. */
  dailyIntake: number;
  cargoTypes: readonly string[];
  /**
   * The share of a day's parcels of each type, the game's own weighting (see
   * cargoShare in src/data/deliveries.ts). A missing type falls back to an
   * even split, which is not a figure to rely on.
   */
  share?: ReadonlyMap<string, number>;
  /**
   * The share of parcels that are valid and need storing; the rest leave the
   * same day through a reject door. Defaults to 1.
   */
  validShare?: number;
  /** For each cargo type, the days it is accepted. A missing type counts as
   * accepted on no day. */
  accepted: ReadonlyMap<string, ReadonlySet<number>>;
  weekLength: number;
}): Map<string, StorageNeed> {
  const { dailyIntake, cargoTypes, accepted, weekLength, share, validShare = 1 } = input;
  const need = new Map<string, StorageNeed>();
  if (cargoTypes.length === 0) return need;

  // Only valid parcels need storing: failed ones leave through a reject door.
  const arriving = dailyIntake * validShare;

  for (const type of cargoTypes) {
    const perDay = arriving * (share?.get(type) ?? 1 / cargoTypes.length);
    // No schedule counts as never accepted: missing input must err toward more racks.
    const closedRun = longestClosedRun(accepted.get(type) ?? new Set(), weekLength);
    const parcels = perDay * closedRun;
    need.set(type, {
      perDay,
      closedRun,
      parcels,
      racks: {
        // Rounded up: half a rack holds nothing.
        small: Math.ceil(parcels / HOLDS.small),
        medium: Math.ceil(parcels / HOLDS.medium),
        large: Math.ceil(parcels / HOLDS.large),
      },
    });
  }

  return need;
}
