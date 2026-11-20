import { describe, it, expect } from 'vitest';
import { CATALOGUE_GAME_VERSION } from '@/core/version';
import { getCatalogue } from './catalogue';
import { SHARE_GAME_VERSIONS, SHARE_OBJECT_IDS, shareIndexOf } from './share-object-ids';

describe('SHARE_OBJECT_IDS', () => {
  it('covers every object in the catalogue, and nothing that is not there', () => {
    // A missing id encodes as -1 and silently drops the object from a shared layout.
    expect([...SHARE_OBJECT_IDS].sort()).toEqual([...getCatalogue().keys()].sort());
  });

  it('lists each id exactly once', () => {
    expect(new Set(SHARE_OBJECT_IDS).size).toBe(SHARE_OBJECT_IDS.length);
  });

  it('has not been reordered', () => {
    // Only this test catches a reorder, which would silently change every shared layout.
    // These positions are frozen; append new objects at the end.
    expect(SHARE_OBJECT_IDS[0]).toBe('BP_ConveyorBelt_Straight_Tier1');
    expect(SHARE_OBJECT_IDS[1]).toBe('BP_ConveyorBelt_Corner_Tier1');
    expect(SHARE_OBJECT_IDS[11]).toBe('BP_ConveyorBelt_Elevator');
    expect(SHARE_OBJECT_IDS[19]).toBe('BP_ConveyorBelt_Diverter');
    expect(SHARE_OBJECT_IDS[27]).toBe('BP_StorageRack_ExtraLarge');
  });

  it('does not depend on the catalogue\'s own order', () => {
    // The catalogue follows the game's shopOrder, which a patch can change; this list must not.
    expect(shareIndexOf('BP_ConveyorBelt_Straight_Tier1')).toBe(0);
    expect(shareIndexOf('BP_NotAnObject')).toBe(-1);
  });
});

describe('SHARE_GAME_VERSIONS', () => {
  it('knows the version the catalogue is currently built from', () => {
    // An unlisted version travels spelt out, costing 14 bytes per link. Append it on re-extraction.
    expect(SHARE_GAME_VERSIONS).toContain(CATALOGUE_GAME_VERSION);
  });

  it('has not been reordered', () => {
    // Same contract as the object list: an index must keep meaning the same build.
    expect(SHARE_GAME_VERSIONS[0]).toBe('UE5.3-2026-07');
    expect(new Set(SHARE_GAME_VERSIONS).size).toBe(SHARE_GAME_VERSIONS.length);
  });
});
