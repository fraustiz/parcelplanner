import { describe, it, expect } from 'vitest';
import { decodePlan, encodePlan, planFromJson, planToJson } from './serialize';
import type { Plan } from './types';

// The country each country door takes (Plan.doorCountries) must survive every way a plan
// travels: local storage and file export (JSON) and share links (the binary format).

const belt = { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'second' as const, floor: 0, cell: { x: 1, y: 2 }, rotation: 90 as const, tier: 1 };

const assigned: Plan = {
  gameVersion: 'UE5.3-2026-07',
  warehouse: 'second',
  placements: [belt],
  doorCountries: { 'second-country-0-a': 'Cristin', 'second-country-1-g': 'Yatdanica' },
};

/** Ids are fresh after a share link; everything else must match. */
const withoutIds = (plan: Plan) => ({ ...plan, placements: plan.placements.map(({ id, ...rest }) => rest) });

describe('door countries through JSON', () => {
  it('survive a round trip', () => {
    expect(planFromJson(planToJson(assigned))).toEqual(assigned);
  });

  it('are absent on a plan that predates them', () => {
    const { doorCountries, ...old } = assigned;
    expect('doorCountries' in planFromJson(planToJson(old))).toBe(false);
  });

  it('drop an unknown door, a display name and a non-string, keeping the rest of the plan', () => {
    const json = JSON.stringify({
      ...assigned,
      doorCountries: {
        'second-country-0-a': 'Cristin',
        'main-delivery-0': 'Impland',
        'second-country-0-b': 'France',
        'second-country-0-c': 3,
      },
    });
    expect(planFromJson(json).doorCountries).toEqual({ 'second-country-0-a': 'Cristin' });
  });

  it('drop the field entirely when nothing in it is usable', () => {
    const json = JSON.stringify({ ...assigned, doorCountries: { nowhere: 'Cristin' } });
    expect('doorCountries' in planFromJson(json)).toBe(false);
  });

  it('refuse a plan whose field is not a map', () => {
    expect(() => planFromJson(JSON.stringify({ ...assigned, doorCountries: ['Cristin'] }))).toThrow();
    expect(() => planFromJson(JSON.stringify({ ...assigned, doorCountries: 'Cristin' }))).toThrow();
  });
});

describe('door countries through a share link', () => {
  it('survive a round trip', async () => {
    expect(withoutIds(await decodePlan(await encodePlan(assigned)))).toEqual(withoutIds(assigned));
  });

  it('travel with notes, zones and the workshop without disturbing them', async () => {
    const full: Plan = {
      ...assigned,
      placements: [
        belt,
        { id: 'z', objectId: 'zone-3x2', warehouse: 'main', floor: 0, cell: { x: 5, y: 5 }, rotation: 0, label: 'buffer', tier: 1 },
        { id: 'w', objectId: 'BP_ConveyorBelt_Joiner', warehouse: 'workshop', floor: 0, cell: { x: 2, y: 2 }, rotation: 180, tier: 1 },
      ],
      notes: [{ id: 'n', warehouse: 'second', floor: 1, cell: { x: 3, y: 3 }, text: 'Pruania ici' }],
    };
    const back = await decodePlan(await encodePlan(full));
    expect(back.doorCountries).toEqual(full.doorCountries);
    expect(back.notes?.map((n) => n.text)).toEqual(['Pruania ici']);
    expect(back.placements.map((p) => p.objectId).sort()).toEqual(full.placements.map((p) => p.objectId).sort());
  });

  it('cost a few bytes for all twelve doors', async () => {
    const doors = [
      'second-country-0-a', 'second-country-0-b', 'second-country-0-c', 'second-country-0-d',
      'second-country-0-e', 'second-country-0-f', 'second-country-1-b', 'second-country-1-c',
      'second-country-1-d', 'second-country-1-e', 'second-country-1-f', 'second-country-1-g',
    ];
    const countries = ['Cristin', 'Impland', 'Jonathia', 'Kongradi', 'Ligbal', 'Mahteen', 'Molland', 'Pruania', 'Sowport', 'Strentom', 'Vocua', 'Yatdanica'];
    const all: Plan = { ...assigned, doorCountries: Object.fromEntries(doors.map((d, i) => [d, countries[11 - i]!])) };
    const { doorCountries, ...none } = all;
    const extra = (await encodePlan(all)).length - (await encodePlan(none)).length;
    expect(extra).toBeLessThan(40);
    expect((await decodePlan(await encodePlan(all))).doorCountries).toEqual(all.doorCountries);
  });

  it('leave a plan without them packing byte for byte as it did', async () => {
    // The same pinned output as serialize.test.ts ("without zones").
    const placements: Plan['placements'] = [belt];
    expect(await encodePlan({ gameVersion: 'test', warehouse: 'main', placements }))
      .toBe('Y2ZgYClJLS5hYGRgYeJkAAA');
  });

  it('reject a country index this app never wrote', async () => {
    const good = await encodePlan(assigned);
    const bytes = await inflate(Buffer.from(good, 'base64url'));
    // The last byte is the second pair's country index.
    bytes[bytes.length - 1] = 99;
    await expect(decodePlan(await deflate(bytes))).rejects.toThrow();
  });
});

async function inflate(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const source = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(source).arrayBuffer());
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const source = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return Buffer.from(await new Response(source).arrayBuffer()).toString('base64url');
}
