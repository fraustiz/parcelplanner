/**
 * What a delivery door brings in, per day. Every number here is reported, not derived:
 *   - parcels per truck and the two Delivery Size levels: `DT_TieredUpgrades` in the game export.
 *   - trucks per day and the 30-second unload (community, unverified):
 *     https://steamcommunity.com/app/2424010/discussions/0/591775079081291008/
 *
 * The day is the unit: trucks stop arriving when the working day ends, so output is capped per day.
 */

/** Parcels a truck carries, by Delivery Size level. Base 3, +2 an upgrade, two
 * upgrades available. */
export const PARCELS_PER_TRUCK: readonly number[] = [3, 5, 7];

/**
 * Seconds a working day lasts for deliveries. Not reported directly: it reconciles three reported
 * counts. The gap between trucks starts at 40 s, minus 10 s per Delivery Speed level, and a door
 * receives 11, 15 and 26 trucks a day (the 26 from a community count of 10,000 parcels).
 * A 468-second day gives all three exactly, with the gap flooring at 18 s.
 */
const WORKING_DAY_SECONDS = 468;

/** The shortest a truck's turnaround gets, however much speed is bought. */
const FASTEST_GAP_SECONDS = 18;

/** Trucks a door receives in a day, by Delivery Speed level. It keeps climbing past the first level. */
export const trucksPerDay = (speedLevel: number): number => {
  const gap = Math.max(FASTEST_GAP_SECONDS, 40 - 10 * Math.max(0, speedLevel));
  return Math.floor(WORKING_DAY_SECONDS / gap);
};

/** Parcels one door brings in per day. `sizeLevel` is 0-based into
 * PARCELS_PER_TRUCK. */
export function dailyIntakePerDoor(sizeLevel: number, speedLevel: number): number {
  const clamped = Math.min(Math.max(0, sizeLevel), PARCELS_PER_TRUCK.length - 1);
  return trucksPerDay(speedLevel) * PARCELS_PER_TRUCK[clamped]!;
}

/**
 * How a day's parcels split between the four cargo types. Not in the exported data (it appears
 * hardcoded); measured by a community player over 10,000 parcels, excluding other cargo types:
 * 22/60 Road, 22/60 Rail, 11/60 Air, 5/60 Maritime.
 */
export const CARGO_SHARE: Readonly<Record<string, number>> = {
  Road: 22 / 60,
  Rail: 22 / 60,
  Air: 11 / 60,
  Maritime: 5 / 60,
};

/**
 * The share of arriving parcels that are valid and must be stored until their day.
 * The rest fail a scanner and leave through a reject door the same day.
 *
 * The game splits 50/50. The guide's 55/45 already removes unusable cargo types, which the
 * shares above exclude too, so using 55 here would deduct them twice.
 */
export const VALID_SHARE = 0.5;
