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
