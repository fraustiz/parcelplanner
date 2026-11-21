/**
 * How long things take in the game, in game seconds (one game minute passes
 * each real second, so these are also real seconds at normal speed). Read from
 * the Blueprints, UE 5.7.4 (see docs/game-data/extraction.md).
 */

/** A straight belt's spline is 100 units long: one cell is one metre. */
const CELL_CM = 100;

/** Belt speed at tier 1, in cm/s (`BaseSpeed`). Everything not listed runs at
 * the conveyor default. */
const BASE_SPEED: Readonly<Record<string, number>> = {
  BP_ConveyorBelt_Speedway: 200,
  // Not a conveyor itself: it carries parcels on `CountryDiverter_Headless`
  // belts, which run at 100.
  BP_ConveyorBelt_CountryDiverter2: 100,
};
const DEFAULT_BASE_SPEED = 50;

/** An upgrade multiplies `BaseSpeed` by 1.5 at tier 2 and by 2 at tier 3
 * (`BP_ConveyorBelt.UpgradeInteractable`). */
const TIER_SPEED = [1, 1, 1.5, 2] as const;

/** Seconds a parcel takes to cross one cell of `objectId` at `tier`. */
export function secondsPerCell(objectId: string, tier: number): number {
  const base = BASE_SPEED[objectId] ?? DEFAULT_BASE_SPEED;
  const factor = TIER_SPEED[Math.min(Math.max(1, tier), 3)]!;
  return CELL_CM / (base * factor);
}

const SCANNERS = new Set([
  'BP_ConveyorBelt_Scanner2_Tier1',
  'BP_ConveyorBelt_CriteriaScanner_Weight',
  'BP_ConveyorBelt_CriteriaScanner_SerialNumber',
  'BP_ConveyorBelt_CriteriaScanner_Country',
  'BP_ConveyorBelt_CriteriaScanner_CargoType',
  'BP_ConveyorBelt_CriteriaScanner_Stamp',
  'BP_ConveyorBelt_CriteriaScanner_ContentsProhibited',
]);

/** A scanner stops each parcel for `ScanSpeed` seconds: 10, then 5 and 1
 * once upgraded. Anything else stops nobody. */
export function scanSeconds(objectId: string, tier: number): number {
  if (!SCANNERS.has(objectId)) return 0;
  return tier >= 3 ? 1 : tier === 2 ? 5 : 10;
}

/**
 * How long a loader takes to put a parcel in its rack: it checks once a
 * second (half a second on average), then waits a delay that falls from 2 s
 * towards 0 with its tier (`Lerp(2, 0, tier / 3)`).
 */
export function loadSeconds(loaderTier: number): number {
  const tier = Math.min(Math.max(1, loaderTier), 3);
  return 0.5 + 2 * (1 - tier / 3);
}

/**
 * How often an unloader takes a parcel out of its rack: it checks once a
 * second, waits 1.7 to 2.1 s, then plays a 0.25 s animation.
 */
export const UNLOAD_SECONDS = 0.5 + 1.9 + 0.25;

/** How often a smart splitter with every way blocked looks again. */
export const SPLITTER_RETRY_SECONDS = 1;
