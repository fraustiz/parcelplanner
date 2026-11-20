import { describe, it, expect } from 'vitest';
import { getCatalogue } from './catalogue';
import { STORAGE_CAPACITY, storageCapacityOf } from './storage';

/**
 * Capacities are checked against the displayed name, not the catalogue id: the two are offset by
 * one (BP_StorageRack_Medium is displayed "Storage Rack (Small)").
 */
const catalogue = getCatalogue();

const displayedAs = (label: string) => {
  const found = [...catalogue.values()].filter((e) => e.displayName.en.includes(label));
  expect(found).toHaveLength(1);
  return found[0]!;
};

describe('storage rack capacity', () => {
  it('holds 8 in the rack the game calls Small', () => {
    expect(storageCapacityOf(displayedAs('Storage Rack (Small)').id)).toBe(8);
  });

  it('holds 12 in the one it calls Medium', () => {
    expect(storageCapacityOf(displayedAs('Storage Rack (Medium)').id)).toBe(12);
  });

  it('holds 16 in the one it calls Large', () => {
    expect(storageCapacityOf(displayedAs('Storage Rack (Large)').id)).toBe(16);
  });

  it('names only objects the catalogue actually has', () => {
    // A typo in an id would silently make that rack hold nothing.
    for (const id of Object.keys(STORAGE_CAPACITY)) {
      expect(catalogue.has(id)).toBe(true);
    }
  });

  it('covers every rack the catalogue offers, so none is quietly worth zero', () => {
    const racks = [...catalogue.values()].filter((e) => e.category === 'storage');
    expect(racks.length).toBeGreaterThan(0);
    for (const rack of racks) {
      expect(storageCapacityOf(rack.id)).toBeGreaterThan(0);
    }
  });

  it('holds nothing for anything that is not a rack', () => {
    expect(storageCapacityOf('BP_ConveyorBelt_Straight_Tier1')).toBe(0);
    expect(storageCapacityOf('nonsense')).toBe(0);
  });

  it('costs more per slot the bigger it gets, which is the sanity check', () => {
    // The dearer the rack, the more it holds.
    const perSlot = ['Small', 'Medium', 'Large'].map((label) => {
      const entry = displayedAs(`Storage Rack (${label})`);
      return entry.price! / storageCapacityOf(entry.id);
    });
    expect(perSlot[0]).toBeLessThan(perSlot[1]!);
    expect(perSlot[1]).toBeLessThan(perSlot[2]!);
  });
});
