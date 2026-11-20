import type { CatalogEntry, Plan } from './types';

/**
 * What a plan costs to build: only the objects placed on the grid. Management
 * upgrades, expansions and licences are left out by design, since they do not
 * change what can be built or where.
 *
 * When `unpricedObjectIds` is non-empty, `total` is a lower bound: those
 * objects count as 0, and a UI showing `total` must say so.
 */
export interface CostBreakdown {
  /** What the plan costs at each placement's own `tier`. */
  total: number;
  /** What it would cost with every placement at tier 1, the cheapest build. */
  atTierOne: number;
  /** What it would cost with every placement at its own `maxTier`. Equals
   * `atTierOne` when nothing is upgradable (racks, the country diverter). */
  atMaxTier: number;
  /** Objects placed whose price the game data did not expose. */
  unpricedObjectIds: string[];
}

/**
 * Cost of owning an object at `tier`: base price plus every upgrade step.
 *
 * The step doubles per tier (Lvl 3 is exactly 2x Lvl 2 for all 22 upgradable
 * objects in the community spreadsheet), so `2^(tier-1) - 1` steps in total.
 * `tier` is clamped to 1..`entry.maxTier`. An object with no base price costs
 * 0 even if it has an upgrade price.
 */
export function tierPrice(entry: CatalogEntry, tier: number): number {
  if (entry.price === null) return 0;
  const step = entry.upgradePrice ?? 0;
  const clamped = Math.min(Math.max(1, tier), Math.max(1, entry.maxTier));
  return entry.price + step * (2 ** (clamped - 1) - 1);
}

/**
 * Totals every placement in `plan.placements`, in both warehouses and whether
 * or not `validate` accepts it. A UI must show validation state next to the
 * cost, and filter `plan.placements` first for a single warehouse's figure.
 */
export function computeCost(
  plan: Plan,
  catalogue: Map<string, CatalogEntry>,
): CostBreakdown {
  let total = 0;
  let atTierOne = 0;
  let atMaxTier = 0;
  const unpriced = new Set<string>();

  for (const p of plan.placements) {
    const entry = catalogue.get(p.objectId);
    if (!entry) continue;
    if (entry.price === null) unpriced.add(entry.id);
    total += tierPrice(entry, p.tier);
    atTierOne += tierPrice(entry, 1);
    atMaxTier += tierPrice(entry, entry.maxTier);
  }

  return { total, atTierOne, atMaxTier, unpricedObjectIds: [...unpriced] };
}
