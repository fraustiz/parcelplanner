import { describe, it, expect } from 'vitest';
import { computeCost, tierPrice } from './cost';
import type { CatalogEntry, Placement, Plan } from './types';

// `computeCost` prices placed objects only: management upgrades, expansions
// and licences do not change what can be built. An object's own tier still
// counts (see tierPrice).

const belt: CatalogEntry = {
  id: 'belt', displayName: { en: 'Belt', fr: 'Tapis' }, category: 'conveyor',
  footprint: { w: 1, h: 1 }, price: 100, upgradePrice: 50, maxTier: 3, ports: [],
};
const scales: CatalogEntry = { ...belt, id: 'scales', price: null, upgradePrice: null };
const scalesWithUpgradePrice: CatalogEntry = {
  ...belt, id: 'scalesUpgraded', price: null, upgradePrice: 50,
};
const free: CatalogEntry = { ...belt, id: 'free', price: 0, upgradePrice: null };

const catalogue = new Map([
  [belt.id, belt],
  [scales.id, scales],
  [scalesWithUpgradePrice.id, scalesWithUpgradePrice],
  [free.id, free],
]);

const plan = (over: Partial<Plan> = {}): Plan => ({
  gameVersion: 'test', warehouse: 'main', placements: [], ...over,
});

const place = (
  objectId: string, x: number, tier = 1, warehouse: 'main' | 'second' = 'main',
): Placement =>
  ({ id: `p${x}`, objectId, warehouse, floor: 0, cell: { x, y: 0 }, rotation: 0, tier });

describe('tierPrice', () => {
  it('charges the base price at tier 1', () => {
    expect(tierPrice(belt, 1)).toBe(100);
  });

  it('doubles the upgrade step each tier rather than repeating it', () => {
    // Lvl 3 is always 2x Lvl 2, so tier 3 costs step + 2*step on top of the
    // base: 250 here.
    expect(tierPrice(belt, 2)).toBe(100 + 50);
    expect(tierPrice(belt, 3)).toBe(100 + 50 + 100);
  });

  it('clamps to an object\'s own maxTier instead of inventing a price above it', () => {
    expect(tierPrice(belt, 99)).toBe(tierPrice(belt, 3));
    const rack: CatalogEntry = { ...belt, id: 'rack', upgradePrice: null, maxTier: 1 };
    expect(tierPrice(rack, 3)).toBe(100);
  });

  it('treats a tier below 1 as tier 1 rather than going negative', () => {
    expect(tierPrice(belt, 0)).toBe(100);
    expect(tierPrice(belt, -5)).toBe(100);
  });

  it('charges nothing for an object the game data never priced', () => {
    expect(tierPrice(scales, 1)).toBe(0);
    expect(tierPrice(scales, 4)).toBe(0);
  });

  it('still charges nothing for an unpriced object that DOES have an upgrade price', () => {
    // An object with no base price must not get a cost from its upgrade step.
    expect(tierPrice(scalesWithUpgradePrice, 3)).toBe(0);
  });

  it('distinguishes a genuinely free object from an unpriced one', () => {
    expect(tierPrice(free, 1)).toBe(0);
    expect(free.price).toBe(0);
    expect(scales.price).toBeNull();
  });
});

describe('computeCost', () => {
  it('costs an empty plan at nothing', () => {
    const r = computeCost(plan(), catalogue);
    expect(r.total).toBe(0);
    expect(r.unpricedObjectIds).toEqual([]);
  });

  it('sums every placement', () => {
    const r = computeCost(plan({ placements: [place('belt', 0), place('belt', 1)] }), catalogue);
    expect(r.total).toBe(200);
  });

  it('charges each placement at its own tier', () => {
    const r = computeCost(plan({ placements: [place('belt', 0, 1), place('belt', 1, 3)] }), catalogue);
    expect(r.total).toBe(100 + 250); // tier 1, then tier 3 (base + 50 + 100)
  });

  it('lists an unpriced object once, however many are placed', () => {
    const r = computeCost(plan({ placements: [place('scales', 0), place('scales', 1)] }), catalogue);
    expect(r.unpricedObjectIds).toEqual(['scales']);
    // The total is a lower bound while that array is non-empty: unpriced
    // objects count as 0.
    expect(r.total).toBe(0);
  });

  it('ignores a placement whose object is not in the catalogue at all', () => {
    const r = computeCost(plan({ placements: [place('BP_LongGone', 0)] }), catalogue);
    expect(r.total).toBe(0);
    expect(r.unpricedObjectIds).toEqual([]);
  });

  it('prices BOTH warehouses, because the player pays for both', () => {
    // Documented on computeCost: a caller wanting one building filters
    // plan.placements first.
    const r = computeCost(
      plan({ placements: [place('belt', 0, 1, 'main'), place('belt', 1, 1, 'second')] }),
      catalogue,
    );
    expect(r.total).toBe(200);
  });

  it('prices a placement the validator would reject, so the total is never quietly short', () => {
    const wayOutside = { ...place('belt', 0), cell: { x: 9999, y: 9999 } };
    expect(computeCost(plan({ placements: [wayOutside] }), catalogue).total).toBe(100);
  });

  describe('the tier-1 and max-tier bounds', () => {
    it('brackets the headline total', () => {
      // One belt at tier 2 sits between "all tier 1" and "all max tier".
      const r = computeCost(plan({ placements: [place('belt', 0, 2)] }), catalogue);
      expect(r.atTierOne).toBe(100);
      expect(r.total).toBe(150);
      expect(r.atMaxTier).toBe(250);
    });

    it('ignores the tier each placement actually has', () => {
      // Same two belts, opposite tiers: the bounds must not move.
      const a = computeCost(plan({ placements: [place('belt', 0, 1), place('belt', 1, 3)] }), catalogue);
      const b = computeCost(plan({ placements: [place('belt', 0, 3), place('belt', 1, 1)] }), catalogue);
      expect(a.atTierOne).toBe(b.atTierOne);
      expect(a.atMaxTier).toBe(b.atMaxTier);
      expect(a.atTierOne).toBe(200);
      expect(a.atMaxTier).toBe(500);
    });

    it('collapses both bounds onto the total for a layout nothing can upgrade', () => {
      const rack: CatalogEntry = { ...belt, id: 'rack', upgradePrice: null, maxTier: 1 };
      const r = computeCost(
        plan({ placements: [place('rack', 0)] }),
        new Map([[rack.id, rack]]),
      );
      expect(r.atTierOne).toBe(100);
      expect(r.total).toBe(100);
      expect(r.atMaxTier).toBe(100);
    });

    it('is zero on both bounds for an empty plan', () => {
      const r = computeCost(plan(), catalogue);
      expect(r.atTierOne).toBe(0);
      expect(r.atMaxTier).toBe(0);
    });
  });
});
