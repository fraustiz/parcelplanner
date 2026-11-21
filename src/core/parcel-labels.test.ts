import { describe, expect, it } from 'vitest';
import { appliedSticker, cargoWeights, drawLabels, preStickerChance, sortingPort, type ParcelLabels } from './parcel-labels';

/** A random source that returns the given numbers in turn. */
const rolls = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const parcel = (over: Partial<ParcelLabels> = {}): ParcelLabels => ({
  valid: true, cargo: 'Road', sticker: null, ...over,
});

describe('drawing a new parcel', () => {
  it('is valid half the time', () => {
    expect(drawLabels(rolls(0.49, 0.9, 0, 0.99), 0).valid).toBe(true);
    expect(drawLabels(rolls(0.5, 0.9, 0, 0, 0.99), 0).valid).toBe(false);
  });

  it('gives a valid parcel no failed criterion', () => {
    expect(drawLabels(rolls(0.1, 0.9, 0, 0.99), 0).invalid).toBeUndefined();
  });

  it('fails an invalid parcel on exactly one criterion, picked evenly', () => {
    // valid roll, openable roll, criterion roll, cargo roll, sticker roll
    expect(drawLabels(rolls(0.9, 0.9, 0.0, 0, 0.99), 0).invalid).toBe('country');
    expect(drawLabels(rolls(0.9, 0.9, 0.99, 0, 0.99), 0).invalid).toBe('stamp');
  });

  it('can fail an openable parcel on its prohibited contents', () => {
    // openable (roll under 10 %), then the coin between closed and openable
    expect(drawLabels(rolls(0.9, 0.05, 0.0, 0.2, 0, 0.99), 0).invalid).toBe('prohibited');
    expect(drawLabels(rolls(0.9, 0.05, 0.0, 0.7, 0, 0.99), 0).invalid).toBe('country');
  });

  it('fails a parcel only on what is unlocked', () => {
    const early = new Set<never>();
    // The criterion roll at its top end lands on the last criterion that applies.
    expect(drawLabels(rolls(0.9, 0.9, 0.99, 0, 0.99), 0, early).invalid).toBe('weight');
    expect(drawLabels(rolls(0.9, 0.9, 0.99, 0, 0.99), 0).invalid).toBe('stamp');
  });

  it('makes no parcel openable before prohibited contents is unlocked', () => {
    expect(drawLabels(rolls(0.9, 0.05, 0.0, 0.2, 0, 0.99), 0, new Set(['serial'] as const)).invalid).toBe('country');
  });

  it('draws only Road and Rail before the first expansion', () => {
    expect(cargoWeights(0).map(([type]) => type)).toEqual(['Road', 'Rail']);
    expect(drawLabels(rolls(0.1, 0.9, 0.99, 0.99), 0).cargo).toBe('Rail');
  });

  it('adds Maritime, rarest, from tier 4', () => {
    expect(cargoWeights(4)).toEqual([['Road', 4], ['Rail', 4], ['Air', 2], ['Maritime', 1]]);
    expect(drawLabels(rolls(0.1, 0.9, 0.95, 0.99), 4).cargo).toBe('Maritime');
  });

  it('sometimes arrives with the right sticker already on', () => {
    expect(preStickerChance(0)).toBeCloseTo(0.198, 3);
    expect(preStickerChance(10)).toBeCloseTo(0.45, 3);
    expect(drawLabels(rolls(0.1, 0.9, 0, 0.01), 0).sticker).toBe('approve');
    expect(drawLabels(rolls(0.9, 0.9, 0, 0, 0.01), 0).sticker).toBe('deny');
    expect(drawLabels(rolls(0.1, 0.9, 0, 0.99), 0).sticker).toBeNull();
  });
});

describe('where a sorting machine sends a parcel', () => {
  it('sends a parcel left at the scanner for the criterion it fails', () => {
    const failsWeight = parcel({ valid: false, invalid: 'weight' });
    expect(sortingPort('BP_ConveyorBelt_CriteriaScanner_Weight', failsWeight)).toBe(2);
    expect(sortingPort('BP_ConveyorBelt_CriteriaScanner_Country', failsWeight)).toBe(1);
  });

  it('never fails anyone on cargo type', () => {
    expect(sortingPort('BP_ConveyorBelt_CriteriaScanner_CargoType', parcel({ valid: false, invalid: 'stamp' }))).toBe(1);
  });

  it('reads the sticker at the sticker verifier', () => {
    const verifier = 'BP_ConveyorBelt_Scanner2_Tier1';
    expect(sortingPort(verifier, parcel({ sticker: 'approve' }))).toBe(2);
    expect(sortingPort(verifier, parcel({ sticker: 'deny' }))).toBe(3);
    expect(sortingPort(verifier, parcel())).toBe(1);
  });

  it('leaves splitters and diverters to the caller', () => {
    expect(sortingPort('BP_ConveyorBelt_Splitter', parcel())).toBeUndefined();
  });

  it('knows which sticker each applier puts on', () => {
    expect(appliedSticker('BP_ConveyorBelt_StickerApplier_Approve')).toBe('approve');
    expect(appliedSticker('BP_ConveyorBelt_StickerApplier_Deny')).toBe('deny');
    expect(appliedSticker('BP_ConveyorBelt_Straight_Tier1')).toBeUndefined();
  });
});
