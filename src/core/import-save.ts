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
 * in silence. It also carries the diverters' screens, the countries of the
 * export doors, the expansions bought and the paint of every belt and rack.
 */

import { centredAnchor, isBuildable, rotatedFootprint, type WarehouseGeometry } from './grid';
import type { GvasSave, GvasStruct, GvasValue } from './gvas';
import type { ImportReport, ImportResult } from './import-plan';
import { CARGO_DIVERTER, COUNTRY_DIVERTER, COUNTRY_DIVERTER_CELLS } from './diverters';
import type { CargoChoice, CatalogEntry, Cell, DiverterSides, Placement, Plan, Rotation, WarehouseId } from './types';

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
  /** Expansion tier, by the name a save lists it under. */
  tiers: Readonly<Record<string, number>>;
  /** Door id here, by the game's `UniqueDoorID` of a country export door. */
  countryDoors: Readonly<Record<number, string>>;
  isCountry: (value: unknown) => value is string;
  /** Screen setting, by `E_CargoType` value; anything else is "any". */
  cargo: Readonly<Record<string, CargoChoice>>;
  /** Colour here for each of the game's conveyor paints, by hue shift; null is the artwork's own. */
  paints: readonly { amount: number; colour: string | null }[];
  /** Colour here for each rack colour, by its class suffix. */
  rackColours: Readonly<Record<string, string | null>>;
  /** Whether a colour can be put on this object (see `repaintableColourOf`). */
  canPaint: (entry: CatalogEntry) => boolean;
  /** The `E_TieredUpgrade` values of the door upgrades, and how many levels each has. */
  deliveryUpgrades: {
    size: string; speed: string; sizeLevels: number; speedLevels: number;
    exportSize: string; exportLevels: number; automaticExports: string;
  };
}

/**
 * How upgraded the player's delivery doors are, 0-based like the preview's
 * settings (src/store/sim-stats.ts). Not part of the plan: it describes the
 * save, not the layout.
 */
export interface SaveDelivery {
  sizeLevel: number;
  speedLevel: number;
  /** Export Size level, 0-based like the preview's settings. */
  exportLevel: number;
  /** Whether the Automatic Exports upgrade is bought. */
  automaticExports: boolean;
}

export interface SaveImportResult extends ImportResult {
  /** Absent when the save does not list its upgrades. */
  delivery?: SaveDelivery;
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
 * catalogue holds once; the colour is returned apart.
 */
function objectIdOf(classPath: string, catalogue: ReadonlyMap<string, CatalogEntry>): { id: string; suffix?: string } {
  const id = (classPath.split('.').pop() ?? '').replace(/_C$/, '');
  if (catalogue.has(id) || !id.startsWith('BP_StorageRack_')) return { id };
  const parts = id.split('_');
  const plain = parts.slice(0, 3).join('_');
  return catalogue.has(plain) ? { id: plain, suffix: parts.slice(3).join('_') } : { id };
}

/** One pair of diverter screens, turned into this app's left and right. */
function sides<T>(struct: GvasValue | undefined, read: (v: GvasValue | undefined) => T | undefined, mirrored: boolean): DiverterSides<T> {
  if (!isStruct(struct)) return {};
  let left = read(field(struct, 'Left'));
  let right = read(field(struct, 'Right'));
  // A screen is fixed to the model: mirrored, the game's left is on the side
  // the planner calls right. No mirrored diverter was in any save checked.
  if (mirrored) [left, right] = [right, left];
  return { ...(left !== undefined ? { left } : {}), ...(right !== undefined ? { right } : {}) };
}

/** Screens set on a country or cargo diverter, as this app stores them; none for any other object. */
function diverterSettings(
  objectId: string,
  guid: GvasValue | undefined,
  mirrored: boolean,
  saved: { country: Map<GvasValue, GvasValue>; cargo: Map<GvasValue, GvasValue> },
  tables: SaveTables,
): Pick<Placement, 'diverterCountries' | 'diverterCargo'> {
  if (objectId === COUNTRY_DIVERTER) {
    const screens = saved.country.get(guid ?? null);
    if (!isStruct(screens)) return {};
    const country = (v: GvasValue | undefined) => (tables.isCountry(v) ? v : undefined);
    // Screens A, B and C, from the entry onward. Checked on a real save: 36 of
    // the 48 set screens lead to the door of their country, the other 12 to
    // no belt at all. Read any other way, at most 12 do.
    const cells = ['ScreensA', 'ScreensB', 'ScreensC'].slice(0, COUNTRY_DIVERTER_CELLS)
      .map((name) => sides(field(screens, name), country, mirrored));
    return cells.some((c) => Object.keys(c).length > 0) ? { diverterCountries: cells } : {};
  }
  if (objectId === CARGO_DIVERTER) {
    const screens = saved.cargo.get(guid ?? null);
    if (!isStruct(screens)) return {};
    const choice = (v: GvasValue | undefined) => (typeof v === 'string' ? tables.cargo[v] : undefined);
    const forward = choice(field(screens, 'Forward'));
    const set = { ...sides(screens, choice, mirrored), ...(forward !== undefined ? { forward } : {}) };
    return Object.keys(set).length > 0 ? { diverterCargo: set } : {};
  }
  return {};
}

/** The planner colour for an object's paint, or undefined to keep its own. */
function colourOf(
  entry: CatalogEntry,
  suffix: string | undefined,
  hue: GvasValue | undefined,
  tables: SaveTables,
): string | undefined {
  if (!tables.canPaint(entry)) return undefined;
  if (suffix !== undefined) return tables.rackColours[suffix] ?? undefined;
  if (typeof hue !== 'number') return undefined;
  const paint = tables.paints.find((p) => Math.abs(p.amount - hue) < 0.005);
  return paint?.colour ?? undefined;
}

/** The expansions bought, if the save lists them; names it does not know are skipped. */
function ownedTiers(save: GvasSave, tables: SaveTables): number[] | undefined {
  const names = save.properties.UnlockedTileObjectNames;
  if (!Array.isArray(names)) return undefined;
  const tiers = names.flatMap((n) => (typeof n === 'string' && tables.tiers[n] !== undefined ? [tables.tiers[n]!] : []));
  return [...new Set(tiers)].sort((a, b) => a - b);
}

/**
 * The delivery door upgrades bought (`TieredUpgrades`, upgrade to how many
 * levels bought). One not listed is not bought.
 */
function delivery(save: GvasSave, tables: SaveTables): SaveDelivery | undefined {
  const upgrades = save.properties.TieredUpgrades;
  if (!Array.isArray(upgrades)) return undefined;
  const bought = new Map(pairs(upgrades));
  const level = (key: string, levels: number) => {
    const n = bought.get(key);
    return typeof n === 'number' ? Math.min(Math.max(0, Math.round(n)), levels - 1) : 0;
  };
  const u = tables.deliveryUpgrades;
  return {
    sizeLevel: level(u.size, u.sizeLevels),
    speedLevel: level(u.speed, u.speedLevels),
    exportLevel: level(u.exportSize, u.exportLevels),
    automaticExports: level(u.automaticExports, 2) > 0,
  };
}

/** The country each export door takes, as the player set it. */
function doorCountries(save: GvasSave, tables: SaveTables): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [id, country] of pairs(save.properties.CountryExportDoorIdToSelectedCountry)) {
    const door = typeof id === 'number' ? tables.countryDoors[id] : undefined;
    if (door !== undefined && tables.isCountry(country)) out[door] = country;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * A placement id from the game's own GUID for the object, so importing the
 * same save twice gives the same ids. Anything not 32 hex digits gets a fresh
 * id: ids only have to be unique.
 */
function idOf(guid: GvasValue | undefined, used: Set<string>): string {
  const hex = typeof guid === 'string' && /^[0-9a-f]{32}$/.test(guid) ? guid : null;
  const id = hex
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : crypto.randomUUID();
  if (used.has(id)) return crypto.randomUUID();
  used.add(id);
  return id;
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

export function planFromSave(save: GvasSave, tables: SaveTables, gameVersion = ''): SaveImportResult {
  const report: ImportReport = {
    placed: 0, byWarehouse: [], unknown: [], dropped: [], ignored: 0, rotationUnknown: 0,
  };
  const gridOf = new Map<GvasValue, GvasValue>(pairs(save.properties.InteractableGuidToGridManagerId));
  const tierOf = new Map<GvasValue, GvasValue>(pairs(save.properties.InteractableGuidToUpgradeTier));
  const hueOf = new Map<GvasValue, GvasValue>(pairs(save.properties.ConveyorGuidToHueShiftColour));
  const screens = {
    country: new Map<GvasValue, GvasValue>(pairs(save.properties.DiverterGuidToCountryScreens)),
    cargo: new Map<GvasValue, GvasValue>(pairs(save.properties.DiverterGuidToCargoTypes)),
  };
  const byWarehouse = new Map<WarehouseId, Placement[]>();
  const usedIds = new Set<string>();

  for (const object of savedObjects(save)) {
    const classPath = field(object, 'InteractableClass');
    const guid = field(object, 'InteractableGUID');
    const transform = field(object, 'Transform');
    if (typeof classPath !== 'string' || !isStruct(transform)) continue;

    // Not on a building grid: furniture, pallets, something in the player's
    // hands. Not part of a layout.
    const gridId = gridOf.get(guid ?? null);
    const grid = typeof gridId === 'string' ? tables.grids[gridId] : undefined;
    const { id: objectId, suffix } = objectIdOf(classPath, tables.catalogue);
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
    const colour = colourOf(entry, suffix, hueOf.get(guid ?? null), tables);
    const list = byWarehouse.get(grid.warehouse) ?? [];
    list.push({
      id: idOf(guid, usedIds),
      objectId,
      warehouse: grid.warehouse,
      floor: grid.floor,
      cell,
      rotation,
      ...(mirrored ? { mirrored: true } : {}),
      ...(colour !== undefined ? { colour } : {}),
      ...diverterSettings(objectId, guid, mirrored, screens, tables),
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
  const plan: Plan = { gameVersion, warehouse, placements };
  const tiers = ownedTiers(save, tables);
  if (tiers !== undefined) plan.ownedTiers = tiers;
  const doors = doorCountries(save, tables);
  if (doors !== undefined) plan.doorCountries = doors;
  const levels = delivery(save, tables);
  return { plan, report, ...(levels !== undefined ? { delivery: levels } : {}) };
}
