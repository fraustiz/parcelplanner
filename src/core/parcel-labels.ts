/**
 * What a parcel carries, drawn the way the game draws it, and what each sorting
 * machine does with it. Every rule here is read from the game's Blueprints
 * (UE 5.7.4, see docs/game-data/extraction.md); the source of each is named.
 *
 * Pure: the caller passes the random numbers, so tests can pin every outcome.
 */

/** The criteria a parcel can fail, by the name the scanners check them under. */
export type Criterion = 'country' | 'weight' | 'serial' | 'contents' | 'stamp' | 'prohibited';

export type CargoType = 'Road' | 'Rail' | 'Air' | 'Maritime';

export interface ParcelLabels {
  /** 50 % of parcels (`BP_Parcel.ValidChance`). */
  valid: boolean;
  /** The one criterion an invalid parcel fails; absent on a valid parcel. */
  invalid?: Criterion;
  cargo: CargoType;
  /** The inspection sticker on it, if any: put on at spawn or by an applier. */
  sticker: 'approve' | 'deny' | null;
}

/**
 * The criteria that can be failed, in the game's order (`OrderedCriteria`),
 * all unlocked: the planner shows a working warehouse, not the first days.
 * Contents (prohibited) only applies to the 10 % of parcels that can be
 * opened (`OpenableSpawnChance`).
 */
const CLOSED_CRITERIA: readonly Criterion[] = ['country', 'weight', 'serial', 'contents', 'stamp'];
const OPENABLE_CHANCE = 0.1;

/**
 * Chance a parcel arrives with the right sticker already on
 * (`BP_Parcel.RandomlyTryPreAttachInspectionSticker`): 20 % at warehouse tier 0,
 * rising slowly to 45 % at tier 10.
 */
export function preStickerChance(warehouseTier: number): number {
  return (Math.log(Math.max(0, warehouseTier) + 2) / Math.log(12) * 35 + 10) / 100;
}

/**
 * The cargo weights for a warehouse tier
 * (`AC_CriteriaManager.GetRandomWeightedValidCargoType`).
 */
export function cargoWeights(warehouseTier: number): readonly (readonly [CargoType, number])[] {
  if (warehouseTier <= 0) return [['Road', 2], ['Rail', 2]];
  if (warehouseTier <= 3) return [['Road', 2], ['Rail', 2], ['Air', 1]];
  return [['Road', 4], ['Rail', 4], ['Air', 2], ['Maritime', 1]];
}

const pick = <T>(items: readonly T[], roll: number): T =>
  items[Math.min(items.length - 1, Math.floor(roll * items.length))]!;

/**
 * Draws a new parcel's labels. `random` returns numbers in [0, 1), like
 * Math.random.
 *
 * An invalid parcel fails exactly one criterion, picked evenly among those that
 * apply (`GetUnlockedCriteriaAndRandomInvalid`). For a parcel that can be
 * opened, the game first picks one closed and one openable criterion, then
 * one of the two.
 */
export function drawLabels(random: () => number, warehouseTier: number): ParcelLabels {
  const valid = random() < 0.5;
  const openable = random() < OPENABLE_CHANCE;

  let invalid: Criterion | undefined;
  if (!valid) {
    const closed = pick(CLOSED_CRITERIA, random());
    invalid = openable && random() < 0.5 ? 'prohibited' : closed;
  }

  const weights = cargoWeights(warehouseTier);
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  let cargo: CargoType = weights[0]![0];
  for (const [type, w] of weights) {
    if (roll < w) { cargo = type; break; }
    roll -= w;
  }

  const sticker = random() < preStickerChance(warehouseTier) ? (valid ? 'approve' : 'deny') : null;
  return { valid, ...(invalid ? { invalid } : {}), cargo, sticker };
}

/** The criterion each scanner checks (`CriteriaToCheck`). The cargo type is
 * never one a parcel fails, so that scanner always says it passes. */
const SCANNED: Readonly<Record<string, Criterion | 'cargo'>> = {
  BP_ConveyorBelt_CriteriaScanner_Country: 'country',
  BP_ConveyorBelt_CriteriaScanner_Weight: 'weight',
  BP_ConveyorBelt_CriteriaScanner_SerialNumber: 'serial',
  BP_ConveyorBelt_CriteriaScanner_Stamp: 'stamp',
  BP_ConveyorBelt_CriteriaScanner_ContentsProhibited: 'prohibited',
  BP_ConveyorBelt_CriteriaScanner_CargoType: 'cargo',
};

const STICKER_VERIFIER = 'BP_ConveyorBelt_Scanner2_Tier1';

/**
 * Which out port a sorting machine sends this parcel through, as an index into
 * the object's own port list (src/data/ports.ts), or `undefined` where the
 * object does not decide from the labels (splitters, diverters set up in game).
 *
 * - A criteria scanner sends a parcel left (port 2) when the criterion it
 *   checks is the one the parcel fails, else right (port 1).
 * - The sticker verifier sends an approved sticker right (port 2), a refused
 *   one left (port 3) and a parcel without one straight on (port 1).
 */
export function sortingPort(objectId: string, labels: ParcelLabels): number | undefined {
  const scanned = SCANNED[objectId];
  if (scanned !== undefined) return labels.invalid === scanned ? 2 : 1;
  if (objectId === STICKER_VERIFIER) {
    return labels.sticker === 'approve' ? 2 : labels.sticker === 'deny' ? 3 : 1;
  }
  return undefined;
}

/** The sticker an applier puts on, replacing any already there. */
export function appliedSticker(objectId: string): 'approve' | 'deny' | undefined {
  if (objectId === 'BP_ConveyorBelt_StickerApplier_Approve') return 'approve';
  if (objectId === 'BP_ConveyorBelt_StickerApplier_Deny') return 'deny';
  return undefined;
}
