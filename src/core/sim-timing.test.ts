import { describe, expect, it } from 'vitest';
import { loadSeconds, scanSeconds, secondsPerCell, UNLOAD_SECONDS } from './sim-timing';

describe('how long things take in the game', () => {
  it('crosses a tier 1 belt cell in 2 s, faster once upgraded', () => {
    expect(secondsPerCell('BP_ConveyorBelt_Straight_Tier1', 1)).toBe(2);
    expect(secondsPerCell('BP_ConveyorBelt_Straight_Tier1', 2)).toBeCloseTo(4 / 3);
    expect(secondsPerCell('BP_ConveyorBelt_Straight_Tier1', 3)).toBe(1);
  });

  it('runs the speedway four times faster', () => {
    expect(secondsPerCell('BP_ConveyorBelt_Speedway', 1)).toBe(0.5);
  });

  it('stops a parcel 10 s at a tier 1 scanner, 1 s at tier 3', () => {
    expect(scanSeconds('BP_ConveyorBelt_CriteriaScanner_Country', 1)).toBe(10);
    expect(scanSeconds('BP_ConveyorBelt_Scanner2_Tier1', 2)).toBe(5);
    expect(scanSeconds('BP_ConveyorBelt_CriteriaScanner_Weight', 3)).toBe(1);
    expect(scanSeconds('BP_ConveyorBelt_Straight_Tier1', 1)).toBe(0);
  });

  it('loads a rack faster as the loader is upgraded', () => {
    expect(loadSeconds(1)).toBeCloseTo(0.5 + 4 / 3);
    expect(loadSeconds(3)).toBe(0.5);
  });

  it('takes a parcel out of a rack every 2.65 s on average', () => {
    expect(UNLOAD_SECONDS).toBeCloseTo(2.65);
  });
});
