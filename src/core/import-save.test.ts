import { describe, expect, it } from 'vitest';
import { getCatalogue } from '@/data/catalogue';
import { SAVE_DEFAULT_TURN, SAVE_GRIDS, SAVE_TURNS } from '@/data/save-format';
import { WAREHOUSES } from '@/data/warehouses';
import type { GvasSave, GvasStruct } from './gvas';
import { planFromSave, type SaveTables } from './import-save';

const tables: SaveTables = {
  catalogue: getCatalogue(),
  geometry: WAREHOUSES,
  grids: SAVE_GRIDS,
  turns: SAVE_TURNS,
  defaultTurn: SAVE_DEFAULT_TURN,
};

const MAIN = 'E_GridManagerID::NewEnumerator0';
const SECOND = 'E_GridManagerID::NewEnumerator1';
const MEZZANINE = 'E_GridManagerID::NewEnumerator3';

interface Spec {
  guid: string;
  cls: string;
  at: [number, number];
  yaw?: number;
  scale?: [number, number, number];
  grid?: string;
  tier?: number;
  tilt?: boolean;
}

/** A yaw as the game stores it: a quaternion about the vertical. */
const quat = (deg: number, tilt = false) => {
  const half = (deg * Math.PI) / 360;
  return [tilt ? 0.2 : 0, 0, Math.sin(half), Math.cos(half)];
};

/** Field names carry the editor's suffixes, as in a real save. */
const object = (s: Spec): GvasStruct => ({
  InteractableClass_2_49D73276: `/Game/Core/Blueprints/Actors/${s.cls}.${s.cls}_C`,
  'IsPlaced?_5_8EC8D105': false,
  Transform_8_05415F44: {
    Rotation: quat(s.yaw ?? 0, s.tilt),
    Translation: [s.at[0], s.at[1], 0],
    Scale3D: s.scale ?? [1, 1, 1],
  },
  GridCellIdentifier_13_54D6E081: '1',
  InteractableGUID_16_A8C04C4D: s.guid,
});

function save(specs: Spec[], racks: Spec[] = []): GvasSave {
  const all = [...specs, ...racks];
  return {
    header: {
      saveGameVersion: 3, packageVersionUe4: 522, packageVersionUe5: 1009,
      engine: { major: 5, minor: 3, patch: 2, changelist: 0, branch: '' }, saveClass: '',
    },
    properties: {
      InteractablesToSpawn: specs.map(object),
      StorageRacksAndParcels: racks.map((r) => ({ InteractableToSaveInfo_2_146D0528: object(r), ParcelGuidToSceneIndex_16_C68: [] })),
      InteractableGuidToGridManagerId: all.filter((s) => s.grid !== 'none').map((s) => [s.guid, s.grid ?? MAIN]),
      InteractableGuidToUpgradeTier: all.filter((s) => s.tier !== undefined).map((s) => [s.guid, s.tier!]),
    },
  };
}

/** World position of the centre of main-warehouse cell (x, y). */
const main = (x: number, y: number): [number, number] => [7060 + 100 * x, -3450 + 100 * y];

describe('planFromSave', () => {
  it('places an object on the cell under its centre, half a turn from the game', () => {
    const { plan, report } = planFromSave(save([
      { guid: 'a', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(1, 12), yaw: 90, tier: 3 },
    ]), tables);
    expect(report.placed).toBe(1);
    expect(plan.placements[0]).toMatchObject({
      objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main', floor: 0,
      cell: { x: 1, y: 12 }, rotation: 270, tier: 3,
    });
    expect(plan.placements[0]!.mirrored).toBeUndefined();
  });

  it('reads a negative Y scale as a mirror, which is the app\'s flip and a half turn', () => {
    const { plan } = planFromSave(save([
      { guid: 'a', cls: 'BP_ConveyorBelt_Corner_Tier1', at: main(3, 3), yaw: 90, scale: [1, -1, 1] },
      { guid: 'b', cls: 'BP_ConveyorBelt_Corner_Tier1', at: main(5, 3), yaw: 90, scale: [-1, 1, 1] },
      { guid: 'c', cls: 'BP_ConveyorBelt_Corner_Tier1', at: main(7, 3), yaw: 90, scale: [-1, -1, 1] },
    ]), tables);
    const [y, x, both] = plan.placements;
    expect(y).toMatchObject({ mirrored: true, rotation: 90 });
    // Mirrored along X: the same mirror, turned half a turn further.
    expect(x).toMatchObject({ mirrored: true, rotation: 270 });
    // Both: no mirror at all, just a half turn.
    expect(both!.mirrored).toBeUndefined();
    expect(both!.rotation).toBe(90);
  });

  it('uses each object\'s own turn, and anchors a long one from its middle', () => {
    const { plan } = planFromSave(save([], [
      { guid: 'r', cls: 'BP_StorageRack_ExtraLarge_Blue', at: main(30, 10), yaw: 0 },
    ]), tables);
    // Colour variants are one catalogue entry; the rack turns 90, so it lies across.
    expect(plan.placements[0]).toMatchObject({
      objectId: 'BP_StorageRack_ExtraLarge', rotation: 90, cell: { x: 29, y: 10 },
    });
  });

  it('turns the second warehouse and its mezzanine 180 degrees', () => {
    const { plan, report } = planFromSave(save([
      { guid: 'g', cls: 'BP_ConveyorBelt_Straight_Tier1', at: [-3950 + 100 * 5, -2950 + 100 * 2], yaw: 0, grid: SECOND },
      { guid: 'm', cls: 'BP_ConveyorBelt_Straight_Tier1', at: [-3950 + 100 * 5, -2950 + 100 * 40], yaw: 0, grid: MEZZANINE },
    ]), tables);
    expect(plan.placements[0]).toMatchObject({ warehouse: 'second', floor: 0, cell: { x: 64, y: 57 }, rotation: 0 });
    expect(plan.placements[1]).toMatchObject({ warehouse: 'second', floor: 1, cell: { x: 64, y: 19 }, rotation: 0 });
    expect(report.byWarehouse).toEqual([{ warehouse: 'second', placed: 2 }]);
    expect(plan.warehouse).toBe('second');
  });

  it('reports what it could not place instead of dropping it silently', () => {
    const { plan, report } = planFromSave(save([
      { guid: 'ok', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(1, 1) },
      // Furniture: on no grid, not part of a layout.
      { guid: 'f', cls: 'BP_InspectTable', at: [100, 100], grid: 'none' },
      // On a grid, but not something the planner knows.
      { guid: 'u', cls: 'BP_SomethingNew', at: main(2, 2) },
      // Between cells, tilted, or in the L's empty corner.
      { guid: 'x', cls: 'BP_ConveyorBelt_Straight_Tier1', at: [main(3, 3)[0] + 37, main(3, 3)[1]] },
      { guid: 't', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(4, 4), tilt: true },
      { guid: 'o', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(5, 30) },
      // A grid this version does not know.
      { guid: 'n', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(6, 6), grid: 'E_GridManagerID::NewEnumerator9' },
    ]), tables);
    expect(plan.placements).toHaveLength(1);
    expect(report.placed).toBe(1);
    expect(report.ignored).toBe(1);
    expect(report.unknown.map((n) => n.value)).toEqual(['BP_SomethingNew']);
    expect(report.dropped).toHaveLength(4);
    expect(report.rotationUnknown).toBe(0);
  });

  it('keeps a tier inside what the object allows', () => {
    const { plan } = planFromSave(save([
      { guid: 'a', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(1, 1), tier: 9 },
      { guid: 'b', cls: 'BP_ConveyorBelt_Straight_Tier1', at: main(2, 1) },
    ]), tables);
    expect(plan.placements.map((p) => p.tier)).toEqual([3, 1]);
  });

  it('opens on the main warehouse and leaves expansions as all owned', () => {
    const { plan } = planFromSave(save([]), tables, 'v');
    expect(plan).toEqual({ gameVersion: 'v', warehouse: 'main', placements: [] });
  });
});
