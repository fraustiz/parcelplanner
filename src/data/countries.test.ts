// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COUNTRIES } from './countries';
import { DOORS } from './doors';

describe('the country list', () => {
  it('is exactly what the game ships, not a list somebody typed', () => {
    // Pinned against the game's DT_Countries.
    const table = JSON.parse(
      readFileSync('data/raw/dt-countries.json', 'utf8').replace(/^\uFEFF/, ''),
    ) as [{ Rows: Record<string, unknown> }];
    expect([...COUNTRIES].sort()).toEqual(Object.keys(table[0]!.Rows).sort());
  });

  it('has one country per country door in the second warehouse', () => {
    // The second warehouse has one export door per country; a new country without a door fails here.
    const doors = DOORS.filter((d) => d.kind === 'country-export');
    expect(doors).toHaveLength(COUNTRIES.length);
    expect(doors.every((d) => d.warehouse === 'second')).toBe(true);
  });
});
