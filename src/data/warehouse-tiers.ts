import type { WarehouseId } from '@/core/types';

/**
 * The game's 18 warehouse expansion tiers and their prices, numbered across both buildings as the
 * community spreadsheet does: 1..14 expand main, 15 buys the Regional Sorting Centre, 16..18 expand it.
 *
 * Prices are the game's: `BP_WarehouseExpansion` charges `BasePrice` 700 plus 300 per tier already
 * owned, and `BP_Warehouse_2_Expansion` costs 500,000. They agree with the community spreadsheet's
 * Management tables. The count matches the level: 14 `BP_WarehouseTier`, 3 `BP_WarehouseTier_Large`,
 * plus the building.
 *
 * Extents come from floating shapes anchored over the spreadsheet grid (xl/drawings/*.xml,
 * `oneCellAnchor` plus an EMU extent), not from cells. Anchors land a cell short in places, so they
 * are snapped to a 10-cell lattice; `warehouse-tiers.test.ts` checks the main tiers plus the starting
 * area tile all 1600 cells exactly. The unclaimed tiles (0,0) and (0,10) are the starting area.
 */
/** A rectangle of cells, same shape as `Block` in src/data/warehouses.ts, declared locally. */
export interface TierBlock { x: number; y: number; w: number; h: number }

export interface WarehouseTier {
  /** 1..18, the spreadsheet's continuous numbering across both buildings. */
  tier: number;
  warehouse: WarehouseId;
  price: number;
  /** True for tier 15, which buys the Regional Sorting Centre itself. */
  buysTheBuilding?: boolean;
  /**
   * The cells this tier unlocks, per floor (`blocks[floor]`, as in WAREHOUSES). The second
   * warehouse's tiers are strips through both levels, so they have two entries.
   */
  blocks: readonly (readonly TierBlock[])[];
}

/** A 10x10 tile of the main warehouse, the size every one of its tiers is. */
const tile = (x: number, y: number): readonly (readonly TierBlock[])[] =>
  [[{ x, y, w: 10, h: 10 }]];

/**
 * A vertical strip of the second warehouse, spanning both floors. The strips run 0-19, 20-34,
 * 35-54, 55-69 left to right and are bought in that order, tier 15 first.
 * Unlike the doors, the strips already read left to right in this orientation: do not mirror them.
 */
const strip = (x: number, w: number): readonly (readonly TierBlock[])[] =>
  [[{ x, y: 0, w, h: 60 }], [{ x, y: 0, w, h: 30 }]];

export const WAREHOUSE_TIERS: readonly WarehouseTier[] = [
  // main: 14 expansions, +300 each step from 700.
  { blocks: tile(10, 0), tier: 1, warehouse: 'main', price: 700 },
  { blocks: tile(10, 10), tier: 2, warehouse: 'main', price: 1000 },
  { blocks: tile(20, 10), tier: 3, warehouse: 'main', price: 1300 },
  { blocks: tile(20, 0), tier: 4, warehouse: 'main', price: 1600 },
  { blocks: tile(20, 20), tier: 5, warehouse: 'main', price: 1900 },
  { blocks: tile(20, 30), tier: 6, warehouse: 'main', price: 2200 },
  { blocks: tile(30, 0), tier: 7, warehouse: 'main', price: 2500 },
  { blocks: tile(30, 10), tier: 8, warehouse: 'main', price: 2800 },
  { blocks: tile(30, 20), tier: 9, warehouse: 'main', price: 3100 },
  { blocks: tile(30, 30), tier: 10, warehouse: 'main', price: 3400 },
  { blocks: tile(40, 0), tier: 11, warehouse: 'main', price: 3700 },
  { blocks: tile(40, 10), tier: 12, warehouse: 'main', price: 4000 },
  { blocks: tile(40, 20), tier: 13, warehouse: 'main', price: 4300 },
  { blocks: tile(40, 30), tier: 14, warehouse: 'main', price: 4600 },

  // second: the building itself, then its 3 interior expansions.
  { blocks: strip(0, 20), tier: 15, warehouse: 'second', price: 500000, buysTheBuilding: true },
  { blocks: strip(20, 15), tier: 16, warehouse: 'second', price: 5200 },
  { blocks: strip(35, 20), tier: 17, warehouse: 'second', price: 5500 },
  { blocks: strip(55, 15), tier: 18, warehouse: 'second', price: 5800 },
];

/** Total cost of the tiers in `tiers` that are not in `owned`. */
export function costOfMissingTiers(
  tiers: readonly WarehouseTier[],
  owned: ReadonlySet<number>,
): number {
  return tiers.reduce((sum, t) => (owned.has(t.tier) ? sum : sum + t.price), 0);
}

/**
 * Cells owned before any tier: the main warehouse's top-left 10x20. The second warehouse has none,
 * since tier 15 buys the building.
 */
export const STARTING_BLOCKS: Readonly<Record<WarehouseId, readonly (readonly TierBlock[])[]>> = {
  main: [[{ x: 0, y: 0, w: 10, h: 20 }]],
  second: [[], []],
  // The workshop is not in the game, so all of it is available from the start (see WAREHOUSES).
  workshop: [[{ x: 0, y: 0, w: 60, h: 60 }]],
};

/**
 * The buildable geometry for `ownedTiers`: the starting cells plus every owned tier, in the same
 * shape as `WAREHOUSES`, so consumers need not know what a tier is.
 * Do not pass it to `warehouseDimensions`: rulers and camera describe the whole building.
 */
export function ownedGeometry(
  ownedTiers: ReadonlySet<number>,
): Readonly<Record<WarehouseId, readonly (readonly TierBlock[])[]>> {
  const out = {} as Record<WarehouseId, (readonly TierBlock[])[]>;
  for (const warehouse of ['main', 'second', 'workshop'] as const) {
    const floors = STARTING_BLOCKS[warehouse].map((blocks) => [...blocks]);
    for (const tier of WAREHOUSE_TIERS) {
      if (tier.warehouse !== warehouse || !ownedTiers.has(tier.tier)) continue;
      tier.blocks.forEach((blocks, floor) => {
        while (floors.length <= floor) floors.push([]);
        floors[floor]!.push(...blocks);
      });
    }
    out[warehouse] = floors;
  }
  return out;
}

/** Every tier number, for the "absent means all owned" default; see
 * `Plan.ownedTiers`. */
export const ALL_TIERS: ReadonlySet<number> = new Set(WAREHOUSE_TIERS.map((t) => t.tier));

/** Tiers that are always owned: without the building purchase the whole building would be greyed out. */
export const MANDATORY_TIERS: ReadonlySet<number> = new Set(
  WAREHOUSE_TIERS.filter((t) => t.buysTheBuilding).map((t) => t.tier),
);

/** The tiers a plan owns, resolving the absent-means-all default in one place.
 * MANDATORY_TIERS are always added, whatever the plan says. */
export function ownedTiersOf(plan: { ownedTiers?: number[] }): ReadonlySet<number> {
  if (plan.ownedTiers === undefined) return ALL_TIERS;
  return new Set([...plan.ownedTiers, ...MANDATORY_TIERS]);
}
