import { describe, it, expect } from 'vitest';
import { CARGO_DIVERTER, cleanDiverterSettings, COUNTRY_DIVERTER, countryScreens, diverterChoice, exitWay, type Way } from './diverters';
import { buildGraph } from './graph';
import { getCatalogue } from '@/data/catalogue';
import { decodePlan, encodePlan, planFromJson, planToJson } from './serialize';
import type { Placement, Plan } from './types';

const place = (objectId: string, over: Partial<Placement> = {}): Placement => ({
  id: 'd', objectId, warehouse: 'second', floor: 0, cell: { x: 4, y: 7 }, rotation: 90, tier: 1, ...over,
});

/** The country diverter's wired exits: straight on, and both sides of each cell. */
const countryExits: { cell: number; way: Way }[] = [
  { cell: 2, way: 'forward' },
  { cell: 0, way: 'left' }, { cell: 0, way: 'right' },
  { cell: 1, way: 'left' }, { cell: 1, way: 'right' },
  { cell: 2, way: 'left' }, { cell: 2, way: 'right' },
];
const cargoExits: { cell: number; way: Way }[] = [
  { cell: 0, way: 'left' }, { cell: 0, way: 'forward' }, { cell: 0, way: 'right' },
];

describe('where a country diverter sends a parcel', () => {
  const diverter = place(COUNTRY_DIVERTER, {
    diverterCountries: [{ left: 'Cristin' }, { right: 'Molland' }, {}],
  });

  it('turns it off at the side whose screen shows its country', () => {
    expect(diverterChoice(diverter, countryExits, { country: 'Molland', cargo: 'Road' })).toEqual({ wanted: [4], fallback: [] });
    expect(diverterChoice(diverter, countryExits, { country: 'Cristin', cargo: 'Road' })).toEqual({ wanted: [1], fallback: [] });
  });

  it('lets it ride straight through when no screen shows its country', () => {
    expect(diverterChoice(diverter, countryExits, { country: 'Vocua', cargo: 'Road' })).toEqual({ wanted: [0], fallback: [] });
  });

  it('lets a parcel with a made-up country ride straight through', () => {
    expect(diverterChoice(diverter, countryExits, { country: null, cargo: 'Road' })).toEqual({ wanted: [0], fallback: [] });
  });
});

describe('where a cargo type diverter sends a parcel', () => {
  it('takes the ways set to its type, falling back on those left on any', () => {
    const diverter = place(CARGO_DIVERTER, { diverterCargo: { left: 'Air', right: 'Air' } });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Air' })).toEqual({ wanted: [0, 2], fallback: [1] });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Road' })).toEqual({ wanted: [], fallback: [1] });
  });

  it('sends a type no screen names to the way set to other', () => {
    const diverter = place(CARGO_DIVERTER, { diverterCargo: { left: 'Road', forward: 'Other', right: 'Rail' } });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Maritime' })).toEqual({ wanted: [1], fallback: [] });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Road' })).toEqual({ wanted: [0], fallback: [] });
  });

  it('sends nothing down a way set to none, not even as a fallback', () => {
    // The game's "None": the player closes a way.
    const diverter = place(CARGO_DIVERTER, { diverterCargo: { left: 'None', forward: 'Road' } });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Road' })).toEqual({ wanted: [1], fallback: [2] });
    expect(diverterChoice(diverter, cargoExits, { country: null, cargo: 'Air' })).toEqual({ wanted: [], fallback: [2] });
  });

  it('works like a smart splitter when nothing is set', () => {
    expect(diverterChoice(place(CARGO_DIVERTER), cargoExits, { country: null, cargo: 'Air' })).toEqual({ wanted: [], fallback: [0, 1, 2] });
  });

  it('says nothing about any other object', () => {
    expect(diverterChoice(place('BP_ConveyorBelt_Splitter'), cargoExits, { country: null, cargo: 'Air' })).toBeUndefined();
  });
});

describe('diverter settings read from a file or a link', () => {
  const isCountry = (v: unknown): v is string => v === 'Cristin' || v === 'Molland';

  it('keep known countries and cargo types on the right object only', () => {
    const country = cleanDiverterSettings(place(COUNTRY_DIVERTER, {
      diverterCountries: [{ left: 'Cristin', right: 'France' as string }, { right: 'Molland' }],
    }), isCountry);
    expect(country.diverterCountries).toEqual([{ left: 'Cristin' }, { right: 'Molland' }, {}]);
    const wrongObject = cleanDiverterSettings(place('BP_ConveyorBelt_Splitter', { diverterCountries: [{ left: 'Cristin' }] }), isCountry);
    expect('diverterCountries' in wrongObject).toBe(false);
    const cargo = cleanDiverterSettings(place(CARGO_DIVERTER, { diverterCargo: { left: 'Air', right: 'Boat' as 'Air' } }), isCountry);
    expect(cargo.diverterCargo).toEqual({ left: 'Air' });
  });

  it('drop the field when nothing in it is set', () => {
    expect('diverterCountries' in cleanDiverterSettings(place(COUNTRY_DIVERTER, { diverterCountries: [{}, {}, {}] }), isCountry)).toBe(false);
  });
});

describe('diverter settings travel with the plan', () => {
  const plan: Plan = {
    gameVersion: 'test',
    warehouse: 'second',
    placements: [
      place(COUNTRY_DIVERTER, { diverterCountries: [{ left: 'Cristin', right: 'Molland' }, {}, { right: 'Vocua' }] }),
      place(CARGO_DIVERTER, { id: 'c', cell: { x: 9, y: 3 }, diverterCargo: { left: 'Road', forward: 'Other', right: 'None' } }),
      place('BP_ConveyorBelt_Straight_Tier1', { id: 's', cell: { x: 1, y: 1 } }),
    ],
  };
  const settings = (p: Plan) => p.placements
    .map(({ objectId, diverterCountries, diverterCargo }) => ({ objectId, diverterCountries, diverterCargo }))
    .sort((a, b) => a.objectId.localeCompare(b.objectId));

  it('through JSON', () => {
    expect(settings(planFromJson(planToJson(plan)))).toEqual(settings(plan));
  });

  it('through a share link', async () => {
    expect(settings(await decodePlan(await encodePlan(plan)))).toEqual(settings(plan));
  });

  it('through a share link that also carries door countries', async () => {
    const both: Plan = { ...plan, doorCountries: { 'second-country-0-a': 'Cristin' } };
    const back = await decodePlan(await encodePlan(both));
    expect(back.doorCountries).toEqual(both.doorCountries);
    expect(settings(back)).toEqual(settings(both));
  });
});

describe("where a real country diverter's exits sit", () => {
  /** Every out port of a country diverter placed at `rotation`, as cell and way. */
  const exits = (rotation: Placement['rotation'], mirrored = false) => {
    const plan: Plan = {
      gameVersion: 'test', warehouse: 'second',
      placements: [place(COUNTRY_DIVERTER, { cell: { x: 10, y: 10 }, rotation, mirrored })],
    };
    const ports = buildGraph(plan, getCatalogue(), []).ports;
    const entry = ports.find((port) => port.dir === 'in');
    return ports.filter((port) => port.dir === 'out').map((out) => exitWay(entry, out))
      .sort((a, b) => a.cell - b.cell || a.way.localeCompare(b.way));
  };
  const expected = [
    { cell: 0, way: 'left' }, { cell: 0, way: 'right' },
    { cell: 1, way: 'left' }, { cell: 1, way: 'right' },
    { cell: 2, way: 'forward' }, { cell: 2, way: 'left' }, { cell: 2, way: 'right' },
  ];

  it('has a left and a right on each of its three cells, and straight on at the far end', () => {
    expect(exits(0)).toEqual(expected);
  });

  it('keeps that whichever way it is turned or flipped', () => {
    for (const rotation of [90, 180, 270] as const) expect(exits(rotation)).toEqual(expected);
    expect(exits(0, true)).toEqual(expected);
  });

  it('puts right on the right of travel: east for a parcel going up the screen', () => {
    // Going up the screen (y falling), the east side (x + 1) is on the right.
    const up = { placementId: 'd', cell: { x: 0, y: 1 }, floor: 0, side: 'N' as const, dir: 'in' as const, targetFloor: 0 };
    const east = { ...up, cell: { x: 0, y: 0 }, side: 'E' as const, dir: 'out' as const };
    expect(exitWay(up, east)).toEqual({ cell: 1, way: 'right' });
  });
});

describe('where a country diverter shows its flags', () => {
  const entry = getCatalogue().get(COUNTRY_DIVERTER)!;
  const plan = (placement: Placement): Plan => ({ gameVersion: 'test', warehouse: 'second', placements: [placement] });

  /** The exit a parcel for `country` actually takes, as the sim resolves it: its out port's cell and side. */
  const sortedTo = (placement: Placement, country: string) => {
    const ports = buildGraph(plan(placement), getCatalogue(), []).ports;
    const inPort = ports.find((port) => port.dir === 'in');
    const outs = ports.filter((port) => port.dir === 'out');
    const choice = diverterChoice(placement, outs.map((out) => exitWay(inPort, out)), { country, cargo: 'Road' })!;
    const out = outs[choice.wanted[0]!]!;
    return { cell: out.cell, side: out.side };
  };

  it('puts each flag on the side a parcel for that country leaves by, however it is turned', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const mirrored of [false, true]) {
        const diverter = place(COUNTRY_DIVERTER, {
          cell: { x: 10, y: 10 }, rotation, mirrored,
          diverterCountries: [{ left: 'Cristin' }, { right: 'Molland' }, { left: 'Vocua', right: 'Ligbal' }],
        });
        const screens = countryScreens(diverter, entry);
        expect(screens).toHaveLength(4);
        for (const screen of screens) {
          expect({ cell: screen.cell, side: screen.side }).toEqual(sortedTo(diverter, screen.country));
        }
      }
    }
  });

  it('shows nothing for screens left unset, or on any other object', () => {
    expect(countryScreens(place(COUNTRY_DIVERTER), entry)).toEqual([]);
    expect(countryScreens(place(CARGO_DIVERTER, { diverterCountries: [{ left: 'Cristin' }] }), entry)).toEqual([]);
  });
});
