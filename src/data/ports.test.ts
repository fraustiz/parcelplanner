import { describe, it, expect } from 'vitest';
import { PORTS } from './ports';

const CRITERIA = Object.keys(PORTS).filter((id) => id.includes('CriteriaScanner'));

describe('criteria scanners', () => {
  it('are all listed', () => {
    expect(CRITERIA).toHaveLength(6);
  });

  it('sort to the right and to the left, with nothing straight ahead', () => {
    // A real layout feeds a belt on each side of every one and none in front;
    // treating them as straight belts dropped every parcel at the first one.
    for (const id of CRITERIA) {
      const ports = PORTS[id]!;
      expect(ports.filter((p) => p.dir === 'in').map((p) => p.side)).toEqual(['N']);
      expect(ports.filter((p) => p.dir === 'out').map((p) => p.side).sort()).toEqual(['E', 'W']);
    }
  });
});

describe('racks', () => {
  it('take a loader at either short end, or at any cell of either long side', () => {
    for (const id of ['BP_StorageRack_Medium', 'BP_StorageRack_Large', 'BP_StorageRack_ExtraLarge']) {
      const ins = PORTS[id]!.filter((p) => p.dir === 'in');
      expect(ins.filter((p) => p.side === 'N' || p.side === 'S').map((p) => p.side).sort()).toEqual(['N', 'S']);
      expect(ins.filter((p) => p.side === 'E').map((p) => p.offset)).toEqual([0, 1, 2]);
      expect(ins.filter((p) => p.side === 'W').map((p) => p.offset)).toEqual([0, 1, 2]);
      expect(PORTS[id]!.some((p) => p.dir === 'out')).toBe(false);
    }
  });
});

describe('the country diverter', () => {
  it('has a side exit on both sides of each of its three cells, and one straight on', () => {
    const outs = PORTS.BP_ConveyorBelt_CountryDiverter2!.filter((p) => p.dir === 'out');
    expect(outs.filter((p) => p.side === 'E').map((p) => p.offset)).toEqual([0, 1, 2]);
    expect(outs.filter((p) => p.side === 'W').map((p) => p.offset)).toEqual([0, 1, 2]);
    expect(outs.filter((p) => p.side === 'S')).toHaveLength(1);
  });
});
