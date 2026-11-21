/**
 * What a delivery door brings in, per day. Read from the game's Blueprints (Parcel Simulator on
 * UE 5.7.4, see docs/game-data/extraction.md) unless a line says otherwise:
 *   - parcels per truck: `AC_MoneyManager.GetUpgradeNumberParcelsToSpawn`;
 *   - the door's timer between trucks: `AC_MoneyManager.GetUpgradeDeliverySpeed`;
 *   - the working day: `BP_ParcelGameInstance` adds one game minute per real second, and
 *     `BP_DeliveryManager` delivers from 9:00 while the hour is below 17:00;
 *   - the cargo weights: `AC_CriteriaManager.GetRandomWeightedValidCargoType`.
 *
 * The day is the unit: trucks stop arriving when the working day ends, so output is capped per day.
 */

/** Parcels a truck carries, by Delivery Size level (`MaxTier` 2). The game also lists 10 for a
 * third level that cannot be bought. */
export const PARCELS_PER_TRUCK: readonly number[] = [3, 5, 7];

/** Seconds on the door's timer between trucks, by Delivery Speed level (`MaxTier` 3). */
export const DOOR_TIMER_SECONDS: readonly number[] = [40, 30, 20, 10];

/** Seconds a working day lasts for deliveries: 9:00 to 17:00 at one game minute a second. */
const WORKING_DAY_SECONDS = 480;

/**
 * The shortest a truck's turnaround gets, however much speed is bought. Measured, not read: the
 * door only reopens once the last truck's parcels have left it, so the 10 s timer of the top level
 * is never what limits it. A community count of 26 trucks a day fully upgraded gives 18 s.
 */
const FASTEST_GAP_SECONDS = 18;

/**
 * Trucks a door receives in a day, by Delivery Speed level. The first truck comes one full gap
 * after 9:00 and none comes at 17:00 itself, so a 40 s gap gives 11 trucks, not 12. This matches
 * the 11 and 15 a day players counted at the first two levels.
 */
export const trucksPerDay = (speedLevel: number): number => {
  const level = Math.min(Math.max(0, speedLevel), DOOR_TIMER_SECONDS.length - 1);
  const gap = Math.max(FASTEST_GAP_SECONDS, DOOR_TIMER_SECONDS[level]!);
  return Math.ceil(WORKING_DAY_SECONDS / gap) - 1;
};

/** Parcels one door brings in per day. `sizeLevel` is 0-based into
 * PARCELS_PER_TRUCK. */
export function dailyIntakePerDoor(sizeLevel: number, speedLevel: number): number {
  const clamped = Math.min(Math.max(0, sizeLevel), PARCELS_PER_TRUCK.length - 1);
  return trucksPerDay(speedLevel) * PARCELS_PER_TRUCK[clamped]!;
}

/** The four cargo types, as the game names them. */
export const CARGO_TYPES = ['Road', 'Rail', 'Air', 'Maritime'] as const;

/**
 * How a day's parcels split between the cargo types. The game draws each parcel's type from a
 * weighted list that grows with the warehouse tier (the number of expansions bought): Road and
 * Rail from the start, Air from tier 1, Maritime from tier 4. A type not yet drawn gets no share.
 */
export function cargoShare(warehouseTier: number): ReadonlyMap<string, number> {
  const weights: Record<string, number> = warehouseTier <= 0
    ? { Road: 2, Rail: 2 }
    : warehouseTier <= 3
      ? { Road: 2, Rail: 2, Air: 1 }
      : { Road: 4, Rail: 4, Air: 2, Maritime: 1 };
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return new Map(CARGO_TYPES.map((type) => [type, (weights[type] ?? 0) / total]));
}

/**
 * The share of arriving parcels that are valid and must be stored until their day.
 * The rest fail a scanner and leave through a reject door the same day.
 *
 * The game splits 50/50 (`BP_Parcel.ValidChance`; only the first three parcels of a save are
 * scripted). The guide's 55/45 already removes unusable cargo types, so using 55 here would
 * deduct them twice.
 */
export const VALID_SHARE = 0.5;
