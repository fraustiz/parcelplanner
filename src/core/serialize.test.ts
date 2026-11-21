import { describe, it, expect } from 'vitest';
import { planToJson, planFromJson, encodePlan, decodePlan, MAX_DECODED_BYTES, MAX_FRAGMENT_LENGTH } from './serialize';
import type { Placement, Plan, WarehouseId } from './types';
import { WAREHOUSES } from '@/data/warehouses';

const plan: Plan = {
  gameVersion: 'UE5.3-2026-07',
  warehouse: 'second',
  placements: [
    { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'second', floor: 0, cell: { x: 1, y: 2 }, rotation: 90, tier: 1 },
    { id: 'b', objectId: 'BP_ConveyorBelt_Elevator', warehouse: 'main', floor: 0, cell: { x: 3, y: 4 }, rotation: 0, tier: 2 },
  ],
};

describe('json round trip', () => {
  it('returns an identical plan', () => {
    expect(planFromJson(planToJson(plan))).toEqual(plan);
  });

  it('rejects malformed json', () => {
    expect(() => planFromJson('{ not json')).toThrow();
  });

  it('rejects json that is not a plan', () => {
    expect(() => planFromJson('{"nope":1}')).toThrow();
  });

  it('rejects a plan with an invalid warehouse value', () => {
    expect(() => planFromJson(planToJson({ ...plan, warehouse: 'third' as Plan['warehouse'] }))).toThrow();
  });

  it('rejects a plan with an invalid placement rotation', () => {
    const bad = { ...plan, placements: [{ ...plan.placements[0], rotation: 45 }] };
    expect(() => planFromJson(JSON.stringify(bad))).toThrow();
  });

  it('rejects a plan with a malformed placement cell', () => {
    const bad = { ...plan, placements: [{ ...plan.placements[0], cell: { x: 'nope' } }] };
    expect(() => planFromJson(JSON.stringify(bad))).toThrow();
  });

  // No JSON literal parses to NaN, so that case cannot be tested.
  it('rejects a placement with Infinity (from 1e999) in cell.x', () => {
    const validJson = planToJson(plan);
    const badJson = validJson.replace('"x":1,', '"x":1e999,');
    expect(() => planFromJson(badJson)).toThrow();
  });

  it('rejects a placement with -Infinity (from -1e999) in cell.y', () => {
    const validJson = planToJson(plan);
    const badJson = validJson.replace('"y":2}', '"y":-1e999}');
    expect(() => planFromJson(badJson)).toThrow();
  });

  it('rejects a placement with Infinity (from 1e999) in tier', () => {
    const validJson = planToJson(plan);
    const badJson = validJson.replace('"tier":1', '"tier":1e999');
    expect(() => planFromJson(badJson)).toThrow();
  });

  it('rejects a plan with non-numeric upgrade values', () => {
    const bad = { ...plan, placements: 'not an array' };
    expect(() => planFromJson(JSON.stringify(bad))).toThrow();
  });

  it('defaults a placement with no warehouse field to \'main\' instead of rejecting the plan', () => {
    // Older plans have placements without `warehouse`. A plan is never
    // discarded for it: this must load, not throw.
    const legacy = {
      ...plan,
      placements: [
        { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', floor: 0, cell: { x: 1, y: 2 }, rotation: 90, tier: 1 },
      ],
    };
    const loaded = planFromJson(JSON.stringify(legacy));
    expect(loaded.placements).toEqual([
      { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main', floor: 0, cell: { x: 1, y: 2 }, rotation: 90, tier: 1 },
    ]);
  });

  it('loads a plan carrying a stale `expansions` field instead of rejecting it', () => {
    // Older plans may carry the removed `expansions` number; it must be
    // ignored, not block the load.
    const legacy = { ...plan, expansions: 3 };
    expect(() => planFromJson(JSON.stringify(legacy))).not.toThrow();
    const loaded = planFromJson(JSON.stringify(legacy));
    expect(loaded.warehouse).toBe(plan.warehouse);
    expect(loaded.placements).toEqual(plan.placements);
  });

  it('loads a plan carrying a stale `licences` array instead of rejecting it', () => {
    // Older plans may carry the removed `licences: string[]` field; it must be
    // ignored, not block the load.
    const legacy = { ...plan, licences: ['Weight', 'Stamp'] };
    expect(() => planFromJson(JSON.stringify(legacy))).not.toThrow();
    const loaded = planFromJson(JSON.stringify(legacy));
    expect(loaded.warehouse).toBe(plan.warehouse);
    expect(loaded.placements).toEqual(plan.placements);
  });
});

describe('encoded round trip', () => {
  it('returns the same layout, with fresh placement ids', async () => {
    // Ids are not carried across a share (see serialize.ts). Compared as a
    // set: the codec sorts placements by (warehouse, floor, y, x) for delta
    // positions, and nothing depends on the order.
    const back = await decodePlan(await encodePlan(plan));
    const asSet = (p: Plan) => p.placements
      .map(({ id, ...rest }) => JSON.stringify(rest)).sort();
    expect(asSet(back)).toEqual(asSet(plan));
    expect(back.warehouse).toBe(plan.warehouse);
    expect(back.gameVersion).toBe(plan.gameVersion);
  });

  it('produces a url-safe string', async () => {
    expect(await encodePlan(plan)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses better than raw json for a large plan', async () => {
    const big: Plan = {
      ...plan,
      placements: Array.from({ length: 400 }, (_, i) => ({
        id: `p${i}`, objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main' as const,
        floor: 0, cell: { x: i % 20, y: Math.floor(i / 20) }, rotation: 0 as const, tier: 1,
      })),
    };
    const encoded = await encodePlan(big);
    expect(encoded.length).toBeLessThan(planToJson(big).length / 2);
  });

  it('exposes a fragment length limit', () => {
    expect(MAX_FRAGMENT_LENGTH).toBeGreaterThan(1000);
  });
});

describe('notes on the plan', () => {
  const noted = (): Plan => ({
    gameVersion: 'test',
    warehouse: 'main',
    placements: [],
    notes: [
      { id: 'n1', warehouse: 'main', floor: 0, cell: { x: 4, y: 9 }, text: 'rail line goes here' },
      { id: 'n2', warehouse: 'second', floor: 1, cell: { x: 30, y: 2 }, text: 'ÉTAGÈRES → 20' },
    ],
  });

  it('survives a round trip through JSON', () => {
    expect(planFromJson(planToJson(noted())).notes).toEqual(noted().notes);
  });

  it('survives a round trip through a share link', async () => {
    // Notes must survive a share. Ids are not compared: a share regenerates
    // them, as for placements.
    const strip = (p: { notes?: { id: string }[] }) =>
      (p.notes ?? []).map(({ id, ...rest }) => rest);
    const back = await decodePlan(await encodePlan(noted()));
    expect(strip(back)).toEqual(strip(noted()));
    expect(back.notes?.every((n) => n.id.length > 0)).toBe(true);
  });

  it('keeps non-ASCII text intact', async () => {
    const back = await decodePlan(await encodePlan(noted()));
    expect(back.notes?.[1]?.text).toBe('ÉTAGÈRES → 20');
  });

  it('reads a plan that predates notes as having none', async () => {
    // Links without notes end before this column. That must read as "no
    // notes", never as a truncated payload.
    const old: Plan = { gameVersion: 'test', warehouse: 'main', placements: [] };
    const back = await decodePlan(await encodePlan(old));
    expect(back.notes ?? []).toEqual([]);
  });

  it('refuses a note that is not shaped like one', () => {
    const bad = JSON.stringify({
      gameVersion: 'test', warehouse: 'main', placements: [],
      notes: [{ id: 'n', cell: { x: 1 }, text: 'x' }],
    });
    expect(() => planFromJson(bad)).toThrow();
  });
});

describe('reserved zones on the plan', () => {
  // A zone is a placement whose object id carries its size (see
  // src/core/zone.ts). Two here: a painted, named one in the main warehouse
  // and a turned one on the second's mezzanine.
  const zoned = (): Plan => ({
    gameVersion: 'test',
    warehouse: 'main',
    placements: [
      { id: 'b', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main', floor: 0, cell: { x: 1, y: 2 }, rotation: 0, tier: 1 },
      { id: 'z1', objectId: 'zone-4x2', warehouse: 'main', floor: 0, cell: { x: 6, y: 3 }, rotation: 0, colour: '#75bb59', label: 'Poste de tri', tier: 1 },
      { id: 'z2', objectId: 'zone-1x3', warehouse: 'second', floor: 1, cell: { x: 30, y: 10 }, rotation: 0, label: 'Allée → quai', tier: 1 },
    ],
  });
  const asSet = (p: Plan) => p.placements.map(({ id, ...rest }) => JSON.stringify(rest)).sort();

  it('survives a round trip through JSON, name included', () => {
    expect(planFromJson(planToJson(zoned()))).toEqual(zoned());
  });

  it('survives a round trip through a share link', async () => {
    // Ids are regenerated, as they are for every placement.
    const back = await decodePlan(await encodePlan(zoned()));
    expect(asSet(back)).toEqual(asSet(zoned()));
  });

  it('keeps an accented name intact', async () => {
    const back = await decodePlan(await encodePlan(zoned()));
    expect(back.placements.map((p) => p.label).filter(Boolean).sort())
      .toEqual(['Allée → quai', 'Poste de tri']);
  });

  it('comes back covering the same cells after being turned', async () => {
    // A zone has no front: a 3x1 turned a quarter is a 1x3. The ground it
    // covers must survive.
    const turned: Plan = {
      gameVersion: 'test', warehouse: 'main',
      placements: [{ id: 'z', objectId: 'zone-3x1', warehouse: 'main', floor: 0, cell: { x: 5, y: 5 }, rotation: 90, mirrored: true, tier: 1 }],
    };
    const back = await decodePlan(await encodePlan(turned));
    expect(back.placements.map(({ id, ...rest }) => rest)).toEqual([
      { objectId: 'zone-1x3', warehouse: 'main', floor: 0, cell: { x: 5, y: 5 }, rotation: 0, tier: 1 },
    ]);
  });

  it('never travels as an object', async () => {
    // A zone id is not in SHARE_OBJECT_IDS; sent through the columns it would
    // come back as whichever object is first in the list.
    const back = await decodePlan(await encodePlan(zoned()));
    expect(back.placements.filter((p) => p.objectId.startsWith('zone-'))).toHaveLength(2);
    expect(back.placements).toHaveLength(3);
  });

  it('travels alongside notes, and without any', async () => {
    const both: Plan = {
      ...zoned(),
      notes: [{ id: 'n', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, text: 'ici' }],
    };
    const back = await decodePlan(await encodePlan(both));
    expect(asSet(back)).toEqual(asSet(both));
    expect(back.notes?.map((n) => n.text)).toEqual(['ici']);
    // With zones but no notes, no empty notes list appears.
    expect((await decodePlan(await encodePlan(zoned()))).notes).toBeUndefined();
  });

  it('leaves a plan without zones packing byte for byte as it did', async () => {
    // Pinned output of the format without zones: a plan with no zones must
    // encode to exactly the same characters.
    const placements: Plan['placements'] = [
      { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'second', floor: 0, cell: { x: 1, y: 2 }, rotation: 90, tier: 1 },
    ];
    const notes: Plan['notes'] = [
      { id: 'n1', warehouse: 'main', floor: 0, cell: { x: 4, y: 9 }, text: 'rail line goes here' },
    ];
    expect(await encodePlan({ gameVersion: 'test', warehouse: 'main', placements }))
      .toBe('Y2ZgYClJLS5hYGRgYeJkAAA');
    expect(await encodePlan({ gameVersion: 'test', warehouse: 'main', placements, notes }))
      .toBe('Y2ZgYClJLS5hYGRgYeJkYOQQYmAQLkrMzFHIycxLVUjPTy1WyEgtSgUA');
  });

  it('refuses a name that is not text', () => {
    const bad = JSON.parse(planToJson(zoned()));
    bad.placements[1].label = 42;
    expect(() => planFromJson(JSON.stringify(bad))).toThrow();
  });
});

describe('the workshop on the plan', () => {
  // The workshop bench holds everything a building can: objects turned,
  // mirrored, painted and upgraded, a zone, a note.
  const benched = (): Plan => ({
    gameVersion: 'test',
    warehouse: 'workshop',
    placements: [
      { id: 'b', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main', floor: 0, cell: { x: 1, y: 2 }, rotation: 0, tier: 1 },
      { id: 'w1', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'workshop', floor: 0, cell: { x: 3, y: 4 }, rotation: 90, mirrored: true, colour: '#cbc11b', tier: 2 },
      { id: 'w2', objectId: 'BP_ConveyorBelt_Elevator', warehouse: 'workshop', floor: 0, cell: { x: 10, y: 12 }, rotation: 0, tier: 1 },
      { id: 'wz', objectId: 'zone-3x2', warehouse: 'workshop', floor: 0, cell: { x: 20, y: 20 }, rotation: 0, label: 'Module A', tier: 1 },
    ],
    notes: [{ id: 'n', warehouse: 'workshop', floor: 0, cell: { x: 1, y: 1 }, text: 'à recopier' }],
  });
  const asSet = (p: Plan) => p.placements.map(({ id, ...rest }) => JSON.stringify(rest)).sort();

  it('survives a round trip through JSON', () => {
    expect(planFromJson(planToJson(benched()))).toEqual(benched());
  });

  it('survives a round trip through a share link, every field intact', async () => {
    const back = await decodePlan(await encodePlan(benched()));
    expect(asSet(back)).toEqual(asSet(benched()));
    expect(back.warehouse).toBe('workshop');
    expect(back.notes?.map((n) => [n.warehouse, n.text])).toEqual([['workshop', 'à recopier']]);
  });

  it('keeps its objects out of the buildings', async () => {
    // A placement's warehouse is one bit in the columns, so bench objects
    // travel in their own block.
    const back = await decodePlan(await encodePlan(benched()));
    expect(back.placements.filter((p) => p.warehouse === 'workshop')).toHaveLength(3);
    expect(back.placements.filter((p) => p.warehouse === 'main')).toHaveLength(1);
  });
});

describe('a shared plan that inflates past any real layout', () => {
  /**
   * 8000 characters of deflate-raw, the most the link store accepts, holding 1 230 795 identical
   * placement records: 6 153 982 bytes once inflated, which a server drawing its preview could not
   * survive. Built on 2026-11-21 by compressing the binary format's header and a run of zeros.
   */
  const HOSTILE = [
    '7MEBEQAABASwd-IJJ5hSimzrVG4nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMC3B4cEAAAAAIL-',
    'v_aGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAt',
  ].join('');

  /** Every cell of every building holding a 1x1 conveyor: the largest plan the game allows. */
  function everyCellFilled(): Plan {
    const placements: Placement[] = [];
    for (const warehouse of ['main', 'second', 'workshop'] as WarehouseId[]) {
      WAREHOUSES[warehouse].forEach((blocks, floor) => {
        for (const block of blocks) {
          for (let y = block.y; y < block.y + block.h; y++) {
            for (let x = block.x; x < block.x + block.w; x++) {
              placements.push({
                id: `${warehouse}-${floor}-${x}-${y}`, objectId: 'BP_ConveyorBelt_Straight_Tier1',
                warehouse, floor, cell: { x, y }, rotation: 0, tier: 1,
              });
            }
          }
        }
      });
    }
    return { gameVersion: 'UE5.3-2026-07', warehouse: 'main', placements };
  }

  it('is refused instead of being inflated whole', async () => {
    expect(HOSTILE).toHaveLength(MAX_FRAGMENT_LENGTH);
    await expect(decodePlan(HOSTILE)).rejects.toThrow('plan too large');
  });

  it('still lets the largest real plan through', async () => {
    const plan = everyCellFilled();
    const back = await decodePlan(await encodePlan(plan));
    expect(back.placements).toHaveLength(plan.placements.length);
    expect(back.placements.map((p) => `${p.warehouse}-${p.floor}-${p.cell.x}-${p.cell.y}`).sort())
      .toEqual(plan.placements.map((p) => p.id).sort());
  });

  it('still lets the largest plan in the old text format through', async () => {
    // The `2|` format spells out every placement; links in it still exist, and it inflates the most.
    const plan = everyCellFilled();
    const homes: WarehouseId[] = ['main', 'second', 'workshop'];
    let lastY = 0;
    let lastX = 0;
    const tokens = plan.placements.map((p) => {
      const token = `0.${p.cell.y - lastY}.${p.cell.x - lastX}.0.${p.floor}.1.0.${homes.indexOf(p.warehouse)}`;
      lastY = p.cell.y;
      lastX = p.cell.x;
      return token;
    });
    const text = new TextEncoder().encode(`2|UE5.3-2026-07|0||${tokens.join(';')}`);
    expect(text.length).toBeLessThan(MAX_DECODED_BYTES);

    const deflated = new Uint8Array(await new Response(
      new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer());
    let binary = '';
    for (const byte of deflated) binary += String.fromCharCode(byte);
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(encoded.length).toBeLessThanOrEqual(MAX_FRAGMENT_LENGTH);
    expect((await decodePlan(encoded)).placements).toHaveLength(plan.placements.length);
  });
});
