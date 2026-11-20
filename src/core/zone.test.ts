import { describe, it, expect } from 'vitest';
import { isZone, MAX_ZONE_SIDE, zoneObjectId, zoneSize } from './zone';

describe('zone ids', () => {
  it('carries its size and gives it back', () => {
    expect(zoneSize(zoneObjectId(3, 5))).toEqual({ w: 3, h: 5 });
  });

  it('is not mistaken for a catalogue object', () => {
    expect(isZone('BP_ConveyorBelt_Straight_Tier1')).toBe(false);
    expect(isZone('zone')).toBe(false);
  });

  it('refuses a size no warehouse could hold', () => {
    // Ids come from strangers' links and zone cells are enumerated one by one,
    // so an absurd size is not a zone, or the tab would hang.
    expect(zoneSize(zoneObjectId(MAX_ZONE_SIDE, MAX_ZONE_SIDE))).not.toBeNull();
    expect(zoneSize(zoneObjectId(MAX_ZONE_SIDE + 1, 1))).toBeNull();
    expect(zoneSize('zone-99999999x99999999')).toBeNull();
  });

  it('refuses an empty or malformed size', () => {
    expect(zoneSize('zone-0x3')).toBeNull();
    expect(zoneSize('zone-3x')).toBeNull();
    expect(zoneSize('zone-03x3')).toBeNull();
    expect(zoneSize('zone-3x3 ')).toBeNull();
  });
});
