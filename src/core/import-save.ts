/**
 * Turning a Parcel Simulator save (read by `readGvas`) into a Plan.
 *
 * Pure and free of data imports like the rest of src/core: the grids, the
 * per-object turns and the catalogue arrive as parameters (real values in
 * src/data/save-format.ts, catalogue.ts and warehouses.ts).
 *
 * A save states every object's exact position, facing, mirroring and tier,
 * so unlike the spreadsheet import nothing is guessed. What it cannot place
 * (off the grid, tilted, unknown to the catalogue) is reported, not dropped
 * in silence.
 */

import { centredAnchor, isBuildable, rotatedFootprint, type WarehouseGeometry } from './grid';
import type { GvasSave, GvasStruct, GvasValue } from './gvas';
import type { ImportReport, ImportResult } from './import-plan';
import type { CatalogEntry, Cell, Placement, Rotation, WarehouseId } from './types';

/** One of the game's building grids, as a save refers to it. */
export interface SaveGrid {
  warehouse: WarehouseId;
  floor: number;
  /** World position of the centre of cell (0,0), before any turn. */
  origin: { x: number; y: number };
  /** Cells across and down, used to turn the grid. */
  size: { w: number; h: number };
  /** Stored turned 180 degrees from the world. */
  turned: boolean;
}

export interface SaveTables {
  catalogue: ReadonlyMap<string, CatalogEntry>;
  geometry: WarehouseGeometry;
  /** By `E_GridManagerID` value. */
  grids: Readonly<Record<string, SaveGrid>>;
  /** Degrees added to the in-game yaw, by object id; `defaultTurn` otherwise. */
  turns: Readonly<Record<string, number>>;
  defaultTurn: number;
}

/** World units to a cell. */
const CELL = 100;
/** How far from a cell centre or a quarter turn still counts as on it. */
const POSITION_SLACK = 0.01;
const ANGLE_SLACK = 1;

const isStruct = (v: GvasValue | undefined): v is GvasStruct =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A field of a Blueprint struct. Their names carry a suffix the editor adds
 * (`InteractableClass_2_49D7…`), so the stable prefix is matched.
 */
function field(struct: GvasStruct, name: string): GvasValue | undefined {
  if (Object.hasOwn(struct, name)) return struct[name];
  const key = Object.keys(struct).find((k) => k.startsWith(`${name}_`));
  return key === undefined ? undefined : struct[key];
}

const numbers = (v: GvasValue | undefined, n: number): number[] | null =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number') ? v as number[] : null;

/** A map property as [key, value] pairs; anything else as none. */
function pairs(v: GvasValue | undefined): [GvasValue, GvasValue][] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is [GvasValue, GvasValue] => Array.isArray(p) && p.length === 2);
}

/**
 * `/Game/…/BP_ConveyorBelt_Loader.BP_ConveyorBelt_Loader_C` to the catalogue
 * id. Racks come in colours (`BP_StorageRack_ExtraLarge_Blue`) that the
 * catalogue holds once.
 */
function objectIdOf(classPath: string, catalogue: ReadonlyMap<string, CatalogEntry>): string {
  const id = (classPath.split('.').pop() ?? '').replace(/_C$/, '');
  if (catalogue.has(id) || !id.startsWith('BP_StorageRack_')) return id;
  const plain = id.split('_').slice(0, 3).join('_');
  return catalogue.has(plain) ? plain : id;
}

const quarter = (deg: number): Rotation => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;

/** Every placed object a save holds: loose ones and the racks. */
function savedObjects(save: GvasSave): GvasStruct[] {
  const p = save.properties;
  const loose = Array.isArray(p.InteractablesToSpawn) ? p.InteractablesToSpawn.filter(isStruct) : [];
  const racks = Array.isArray(p.StorageRacksAndParcels)
    ? p.StorageRacksAndParcels.filter(isStruct).map((r) => field(r, 'InteractableToSaveInfo')).filter(isStruct)
    : [];
  return [...loose, ...racks];
}

export function planFromSave(save: GvasSave, tables: SaveTables, gameVersion = ''): ImportResult {
  const report: ImportReport = {
    placed: 0, byWarehouse: [], unknown: [], dropped: [], ignored: 0, rotationUnknown: 0,
  };
  const gridOf = new Map<GvasValue, GvasValue>(pairs(save.properties.InteractableGuidToGridManagerId));
  const tierOf = new Map<GvasValue, GvasValue>(pairs(save.properties.InteractableGuidToUpgradeTier));
  const byWarehouse = new Map<WarehouseId, Placement[]>();

  for (const object of savedObjects(save)) {
    const classPath = field(object, 'InteractableClass');
    const guid = field(object, 'InteractableGUID');
    const transform = field(object, 'Transform');
    if (typeof classPath !== 'string' || !isStruct(transform)) continue;

    // Not on a building grid: furniture, pallets, something in the player's
    // hands. Not part of a layout.
    const gridId = gridOf.get(guid ?? null);
    const grid = typeof gridId === 'string' ? tables.grids[gridId] : undefined;
    const objectId = objectIdOf(classPath, tables.catalogue);
    const sheet = grid ? `${grid.warehouse}/${grid.floor}` : String(gridId ?? '');
    if (gridId === undefined) {
      report.ignored++;
      continue;
    }

    const translation = numbers(field(transform, 'Translation'), 3);
    const quat = numbers(field(transform, 'Rotation'), 4);
    const scale = numbers(field(transform, 'Scale3D'), 3) ?? [1, 1, 1];
    if (!grid || !translation || !quat) {
      report.dropped.push({ sheet, cell: { x: 0, y: 0 }, value: objectId });
      continue;
    }

    let x = (translation[0]! - grid.origin.x) / CELL;
    let y = (translation[1]! - grid.origin.y) / CELL;
    const rough: Cell = { x: Math.round(x), y: Math.round(y) };

    const entry = tables.catalogue.get(objectId);
    if (!entry) {
      report.unknown.push({ sheet, cell: rough, value: objectId });
      continue;
    }

    // Upright objects only: a pure turn about the vertical has no x or y part.
    const [qx, qy, qz, qw] = quat as [number, number, number, number];
    let yaw = (2 * Math.atan2(qz, qw) * 180) / Math.PI;
    const tilted = Math.abs(qx) > 1e-3 || Math.abs(qy) > 1e-3;
    const offGrid = Math.abs(x - rough.x) > POSITION_SLACK || Math.abs(y - rough.y) > POSITION_SLACK;
    const offQuarter = Math.abs(yaw - Math.round(yaw / 90) * 90) > ANGLE_SLACK;
    if (tilted || offGrid || offQuarter) {
      report.dropped.push({ sheet, cell: rough, value: objectId });
      continue;
    }
    x = rough.x;
    y = rough.y;

    // The game mirrors along the model's own Y. A mirror along X is that
    // mirror and a half turn, and both at once is just a half turn.
    let [sx, sy] = scale as [number, number, number];
    if (sx < 0) { sx = -sx; sy = -sy; yaw += 180; }
    const mirrored = sy < 0;
    // Its Y is this app's flip plus a half turn (`placedPort` mirrors E-W).
    let turn = yaw + (tables.turns[objectId] ?? tables.defaultTurn) + (mirrored ? 180 : 0);
    if (grid.turned) {
      x = grid.size.w - 1 - x;
      y = grid.size.h - 1 - y;
      turn += 180;
    }
    const rotation = quarter(turn);
    const cell = centredAnchor({ x, y }, entry.footprint, rotation);

    const { w, h } = rotatedFootprint(entry.footprint, rotation);
    let fits = true;
    for (let dy = 0; dy < h && fits; dy++) {
      for (let dx = 0; dx < w && fits; dx++) {
        fits = isBuildable(grid.warehouse, grid.floor, { x: cell.x + dx, y: cell.y + dy }, tables.geometry);
      }
    }
    if (!fits) {
      report.dropped.push({ sheet, cell: { x, y }, value: objectId });
      continue;
    }

    const savedTier = tierOf.get(guid ?? null);
    const tier = typeof savedTier === 'number'
      ? Math.min(Math.max(1, Math.round(savedTier)), Math.max(1, entry.maxTier))
      : 1;

    report.placed++;
    const list = byWarehouse.get(grid.warehouse) ?? [];
    list.push({
      id: crypto.randomUUID(),
      objectId,
      warehouse: grid.warehouse,
      floor: grid.floor,
      cell,
      rotation,
      ...(mirrored ? { mirrored: true } : {}),
      tier,
    });
    byWarehouse.set(grid.warehouse, list);
  }

  const order: WarehouseId[] = ['main', 'second'];
  for (const warehouse of order) {
    const placed = byWarehouse.get(warehouse)?.length ?? 0;
    if (placed > 0) report.byWarehouse.push({ warehouse, placed });
  }
  const warehouse = report.byWarehouse[0]?.warehouse ?? 'main';
  const placements = order.flatMap((id) => byWarehouse.get(id) ?? []);
  // `ownedTiers` is absent, meaning all owned (see Plan): which save tiles
  // match which expansion is not mapped yet.
  return { plan: { gameVersion, warehouse, placements }, report };
}
