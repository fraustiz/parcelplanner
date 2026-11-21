// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  COUNTRIES, COUNTRY_DOORS, countryDoorAt, countryDoorNear, countryDoorNumber, countryFlag, countryFlags, countryName, isCountryDoor, REAL_COUNTRY_NAMES,
} from './countries';
import { KEEP_OWN_COLOURS } from './icons';
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

describe('the flags', () => {
  it('ship one image per country, from the game and from the RealCountries mod', () => {
    for (const id of COUNTRIES) {
      for (const real of [false, true]) {
        const path = countryFlag(id, real)!;
        // Small enough to load all twelve with the page: the exports are 64 px wide.
        expect(statSync(`public${path}`).size, path).toBeLessThan(4096);
      }
    }
  });

  it('have none for something that is not a country', () => {
    expect(countryFlag('France', false)).toBeUndefined();
    expect(countryFlags(true).size).toBe(COUNTRIES.length);
  });

  it('keep their own colours on the canvas instead of being blackened like glyphs', () => {
    expect(KEEP_OWN_COLOURS.has('/flags/Cristin.png')).toBe(true);
    expect(KEEP_OWN_COLOURS.has('/flags/real/Cristin.png')).toBe(true);
  });
});

describe('the RealCountries names', () => {
  it('give every game country a real name, and only those', () => {
    expect(Object.keys(REAL_COUNTRY_NAMES).sort()).toEqual([...COUNTRIES].sort());
    expect(new Set(Object.values(REAL_COUNTRY_NAMES)).size).toBe(COUNTRIES.length);
  });

  it("agree with the placeholder the game's own table already carries for Cristin", () => {
    // data/raw/dt-countries.json: the developers' own placeholder for Cristin is France.
    expect(countryName('Cristin', true)).toBe('France');
  });

  it('change only the display: off, the game name; anything else passes through', () => {
    expect(countryName('Cristin', false)).toBe('Cristin');
    expect(countryName('Road', true)).toBe('Road');
  });
});

describe('the country doors', () => {
  it('run ground floor first, then left to right', () => {
    expect(COUNTRY_DOORS.map((d) => d.id)).toEqual([
      'second-country-0-a', 'second-country-0-b', 'second-country-0-c',
      'second-country-0-d', 'second-country-0-e', 'second-country-0-f',
      'second-country-1-b', 'second-country-1-c', 'second-country-1-d',
      'second-country-1-e', 'second-country-1-f', 'second-country-1-g',
    ]);
    expect(isCountryDoor('second-country-0-a')).toBe(true);
    expect(isCountryDoor('second-export-reject-0')).toBe(false);
  });
});

describe('countryDoorAt', () => {
  // The first ground-floor country door stands on x 7, y 0, and faces S (-y): its bay is
  // the 3 x 3 cells above it, x 6 to 8, y -1 to -3.
  it('finds the door from any cell of its bay', () => {
    for (const x of [6, 7, 8]) {
      for (const y of [-1, -2, -3]) {
        expect(countryDoorAt('second', 0, { x, y })?.id).toBe('second-country-0-a');
      }
    }
  });

  it('finds nothing on the door cell itself, inside the walls, or beside the bay', () => {
    expect(countryDoorAt('second', 0, { x: 7, y: 0 })).toBeUndefined();
    expect(countryDoorAt('second', 0, { x: 5, y: -1 })).toBeUndefined();
    expect(countryDoorAt('second', 0, { x: 7, y: -4 })).toBeUndefined();
  });

  it('only on the door\'s own floor and warehouse', () => {
    expect(countryDoorAt('second', 1, { x: 7, y: -1 })).toBeUndefined();
    expect(countryDoorAt('main', 0, { x: 7, y: -1 })).toBeUndefined();
  });

  it('numbers doors per floor, from 1', () => {
    expect(countryDoorNumber(countryDoorAt('second', 0, { x: 7, y: -1 })!)).toBe(1);
    expect(countryDoorNumber(countryDoorAt('second', 1, { x: 27, y: -1 })!)).toBe(2);
  });
});

describe('countryDoorNear', () => {
  it('also finds a door from its own cell, where the keyboard cursor reaches', () => {
    expect(countryDoorNear('second', 0, { x: 7, y: 0 })?.id).toBe('second-country-0-a');
    expect(countryDoorNear('second', 0, { x: 7, y: -2 })?.id).toBe('second-country-0-a');
    expect(countryDoorNear('second', 0, { x: 8, y: 0 })).toBeUndefined();
  });
});
