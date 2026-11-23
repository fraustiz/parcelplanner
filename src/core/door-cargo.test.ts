import { describe, it, expect } from 'vitest';
import { DOORS } from '@/data/doors';
import { SHARE_CARGO_DOOR_IDS } from '@/data/share-object-ids';
import { cargoOf, cleanDoorCargo, doorsOf, isCargoDoor } from './door-cargo';
import { decodePlan, encodePlan, planFromJson, planToJson } from './serialize';
import type { Plan } from './types';

const air = DOORS.find((d) => d.id === 'main-export-air-0')!;
const reject = DOORS.find((d) => d.id === 'main-export-reject-0')!;

const belt = { id: 'a', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main' as const, floor: 0, cell: { x: 1, y: 2 }, rotation: 90 as const, tier: 1 };
const set: Plan = {
  gameVersion: 'UE5.3-2026-07',
  warehouse: 'main',
  placements: [belt],
  doorCargo: { 'main-export-air-0': ['Road', 'Maritime'], 'main-export-air-maritime-0': ['Rail'] },
};
const withoutIds = (plan: Plan) => ({ ...plan, placements: plan.placements.map(({ id, ...rest }) => rest) });

describe('the cargo types of an export door', () => {
  it("are the game's until the player sets them", () => {
    expect(cargoOf(air, {})).toEqual(['Air']);
    expect(cargoOf(air, set)).toEqual(['Road', 'Maritime']);
  });

  it('never change a reject bin or a country door', () => {
    expect(isCargoDoor(reject)).toBe(false);
    expect(cargoOf(reject, { doorCargo: { [reject.id]: ['Road'] } })).toEqual([]);
  });

  it('reach every door of the plan, and leave the list alone when nothing is set', () => {
    expect(doorsOf(DOORS, {})).toBe(DOORS);
    expect(doorsOf(DOORS, set).find((d) => d.id === air.id)?.cargoTypes).toEqual(['Road', 'Maritime']);
  });

  it('keep only known cargo doors, known types and sets other than the game\'s', () => {
    expect(cleanDoorCargo({
      'main-export-air-0': ['Maritime', 'Road', 'Road', 'Boat'],
      'main-export-reject-0': ['Road'],
      'main-export-rail-0': ['Rail'],
      'main-export-road-0': [],
      nowhere: ['Air'],
    }, DOORS)).toEqual({ 'main-export-air-0': ['Road', 'Maritime'] });
    expect(cleanDoorCargo({ nowhere: ['Air'] }, DOORS)).toBeUndefined();
  });

  it('have a share index for every cargo door', () => {
    expect([...SHARE_CARGO_DOOR_IDS].sort()).toEqual(DOORS.filter(isCargoDoor).map((d) => d.id).sort());
  });
});

describe('cargo door settings through JSON and share links', () => {
  it('survive a JSON round trip', () => {
    expect(planFromJson(planToJson(set))).toEqual(set);
  });

  it('refuse a field that is not a map', () => {
    expect(() => planFromJson(JSON.stringify({ ...set, doorCargo: ['Air'] }))).toThrow();
  });

  it('survive a share link, alone or after door countries and diverters', async () => {
    expect(withoutIds(await decodePlan(await encodePlan(set)))).toEqual(withoutIds(set));
    const full: Plan = {
      ...set,
      placements: [belt, { id: 'd', objectId: 'BP_ConveyorBelt_Diverter', warehouse: 'main', floor: 0, cell: { x: 5, y: 5 }, rotation: 0, tier: 1, diverterCargo: { left: 'Rail' } }],
      doorCountries: { 'second-country-0-a': 'Cristin' },
    };
    const back = await decodePlan(await encodePlan(full));
    expect(back.doorCargo).toEqual(full.doorCargo);
    expect(back.doorCountries).toEqual(full.doorCountries);
    expect(back.placements.find((p) => p.objectId === 'BP_ConveyorBelt_Diverter')?.diverterCargo).toEqual({ left: 'Rail' });
  });

  it('leave a link without them as it was', async () => {
    const { doorCargo, ...plain } = set;
    expect('doorCargo' in await decodePlan(await encodePlan(plain))).toBe(false);
  });
});
