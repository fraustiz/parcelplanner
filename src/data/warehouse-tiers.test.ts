import { describe, it, expect } from 'vitest';
import { isBuildable } from '@/core/grid';
import { costOfMissingTiers, ownedGeometry, ownedTiersOf, STARTING_BLOCKS, WAREHOUSE_TIERS } from './warehouse-tiers';
import { WAREHOUSES } from './warehouses';

describe('WAREHOUSE_TIERS', () => {
  it('has 18 tiers numbered 1..18 without a gap or a repeat', () => {
    expect(WAREHOUSE_TIERS).toHaveLength(18);
    expect(WAREHOUSE_TIERS.map((t) => t.tier)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  it('splits 14 tiers to the main warehouse and 4 to the second', () => {
    // Matches the level: 14 BP_WarehouseTier, 3 BP_WarehouseTier_Large, plus the building itself.
    expect(WAREHOUSE_TIERS.filter((t) => t.warehouse === 'main')).toHaveLength(14);
    expect(WAREHOUSE_TIERS.filter((t) => t.warehouse === 'second')).toHaveLength(4);
  });

  it('marks exactly one tier as buying the building rather than expanding it', () => {
    const buys = WAREHOUSE_TIERS.filter((t) => t.buysTheBuilding);
    expect(buys.map((t) => t.tier)).toEqual([15]);
    // Priced like a building, not an expansion.
    expect(buys[0]?.price).toBe(500000);
  });

  it('steps the main warehouse\'s tiers by 300 from 700, totalling 37100', () => {
    // The spreadsheet's Management table, checked as a progression so one mistyped figure stands out.
    const main = WAREHOUSE_TIERS.filter((t) => t.warehouse === 'main');
    main.forEach((t, i) => expect(t.price).toBe(700 + 300 * i));
    expect(main.reduce((s, t) => s + t.price, 0)).toBe(37100);
  });

  it('totals the second warehouse at 516500', () => {
    const second = WAREHOUSE_TIERS.filter((t) => t.warehouse === 'second');
    expect(second.reduce((s, t) => s + t.price, 0)).toBe(516500);
  });
});

describe('costOfMissingTiers', () => {
  const tiers = WAREHOUSE_TIERS.filter((t) => t.warehouse === 'main');

  it('charges for everything when nothing is owned', () => {
    expect(costOfMissingTiers(tiers, new Set())).toBe(37100);
  });

  it('charges nothing when everything is owned', () => {
    expect(costOfMissingTiers(tiers, new Set(tiers.map((t) => t.tier)))).toBe(0);
  });

  it('charges only for the tiers not ticked', () => {
    expect(costOfMissingTiers(tiers, new Set([1, 2]))).toBe(37100 - 700 - 1000);
  });

  it('ignores an owned tier that belongs to the other warehouse', () => {
    // Tier 15 is the second warehouse's; ticking it must not discount main's.
    expect(costOfMissingTiers(tiers, new Set([15]))).toBe(37100);
  });
});

describe('tier extents', () => {
  const area = (blocks: readonly { w: number; h: number }[]) =>
    blocks.reduce((s, b) => s + b.w * b.h, 0);

  it('tiles the main warehouse exactly: starting area plus all 14 tiers, no gap, no overlap', () => {
    // Makes snapping the spreadsheet anchors to a 10-cell lattice safe: checked cell by cell
    // against the real geometry.
    const covered = new Map<string, number>();
    const add = (b: { x: number; y: number; w: number; h: number }) => {
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          covered.set(`${x},${y}`, (covered.get(`${x},${y}`) ?? 0) + 1);
        }
      }
    };
    STARTING_BLOCKS.main[0]!.forEach(add);
    for (const t of WAREHOUSE_TIERS.filter((t) => t.warehouse === 'main')) t.blocks[0]!.forEach(add);

    expect([...covered.values()].filter((n) => n > 1)).toEqual([]); // no overlap
    for (const [key, ] of covered) {
      const [x, y] = key.split(',').map(Number);
      expect(isBuildable('main', 0, { x: x!, y: y! }, WAREHOUSES), key).toBe(true);
    }
    // And nothing buildable is left uncovered.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 50; x++) {
        if (!isBuildable('main', 0, { x, y }, WAREHOUSES)) continue;
        expect(covered.has(`${x},${y}`), `${x},${y} belongs to no tier`).toBe(true);
      }
    }
    expect(covered.size).toBe(1600);
  });

  it('tiles both floors of the second warehouse with its four strips', () => {
    const second = WAREHOUSE_TIERS.filter((t) => t.warehouse === 'second');
    // Ground: four strips spanning the full 70 width and 60 depth.
    expect(area(second.flatMap((t) => t.blocks[0]!))).toBe(70 * 60);
    // Mezzanine: the same strips, half the depth.
    expect(area(second.flatMap((t) => t.blocks[1]!))).toBe(70 * 30);
    // Contiguous across the width, and in the widths the game uses.
    const spans = second.flatMap((t) => t.blocks[0]!).sort((a, b) => a.x - b.x);
    expect(spans.map((b) => [b.x, b.w])).toEqual([[0, 20], [20, 15], [35, 20], [55, 15]]);
  });
});

describe('the workshop', () => {
  it('is all there from the start, with nothing to buy', () => {
    // Not a game building, so nothing is locked.
    expect(WAREHOUSES.workshop[0]).toHaveLength(1);
    expect(ownedGeometry(new Set()).workshop).toEqual(WAREHOUSES.workshop);
    expect(WAREHOUSE_TIERS.some((tier) => tier.warehouse === 'workshop')).toBe(false);
  });
});

describe('ownedGeometry', () => {
  it('gives a player who owns nothing just the starting area', () => {
    const g = ownedGeometry(new Set());
    expect(g.main[0]).toEqual([{ x: 0, y: 0, w: 10, h: 20 }]);
    expect(isBuildable('main', 0, { x: 5, y: 5 }, g)).toBe(true);
    expect(isBuildable('main', 0, { x: 15, y: 5 }, g)).toBe(false); // tier 1, unowned
  });

  it('opens exactly the tier that was bought and nothing else', () => {
    const g = ownedGeometry(new Set([1]));
    expect(isBuildable('main', 0, { x: 15, y: 5 }, g)).toBe(true);  // tier 1's tile
    expect(isBuildable('main', 0, { x: 15, y: 15 }, g)).toBe(false); // tier 2's
  });

  it('leaves the second warehouse entirely unbuildable until its building is bought', () => {
    // (5,30) is inside tier 15's strip, the leftmost one: the expansions run left to right.
    const g = ownedGeometry(new Set());
    expect(isBuildable('second', 0, { x: 5, y: 30 }, g)).toBe(false);
    const bought = ownedGeometry(new Set([15]));
    expect(isBuildable('second', 0, { x: 5, y: 30 }, bought)).toBe(true);
    // Buying the building alone does not open the far side.
    expect(isBuildable('second', 0, { x: 60, y: 30 }, bought)).toBe(false);
  });

  it('reproduces the full geometry once every tier is owned', () => {
    const all = ownedGeometry(new Set(WAREHOUSE_TIERS.map((t) => t.tier)));
    for (const [warehouse, floors] of Object.entries(WAREHOUSES)) {
      floors.forEach((blocks, floor) => {
        for (const b of blocks) {
          for (let y = b.y; y < b.y + b.h; y += 7) {
            for (let x = b.x; x < b.x + b.w; x += 7) {
              const w = warehouse as 'main' | 'second';
              expect(isBuildable(w, floor, { x, y }, all), `${w} ${floor} ${x},${y}`).toBe(true);
            }
          }
        }
      });
    }
  });
});

describe('the second warehouse expands left to right', () => {
  const second = () => WAREHOUSE_TIERS
    .filter((t) => t.warehouse === 'second')
    .sort((a, b) => a.tier - b.tier);

  it('starts at the left edge and works right, tier by tier', () => {
    // In game the expansions unlock left to right.
    expect(second().map((t) => t.blocks[0]![0]!.x)).toEqual([0, 20, 35, 55]);
  });

  it('gives tier 15, the purchase of the building, the leftmost strip', () => {
    const [first] = second();
    expect(first!.tier).toBe(15);
    expect(first!.buysTheBuilding).toBe(true);
    expect(first!.blocks[0]![0]).toMatchObject({ x: 0, w: 20 });
  });

  it('has the widths the game actually uses: 20, 15, 20, 15', () => {
    // Widths as in game: 20, 15, 20, 15. Unlike the doors, the strips are not mirrored.
    expect(second().map((t) => t.blocks[0]![0]!.w)).toEqual([20, 15, 20, 15]);
  });

  it('leaves no gap between one strip and the next', () => {
    // The direction can only be got right if the strips still abut: each one
    // has to start exactly where the previous ended.
    const strips = second().map((t) => t.blocks[0]![0]!);
    for (let i = 1; i < strips.length; i++) {
      expect(strips[i]!.x).toBe(strips[i - 1]!.x + strips[i - 1]!.w);
    }
    const last = strips.at(-1)!;
    expect(last.x + last.w).toBe(70);
  });

  it('expands both floors together, since the strips are full-height', () => {
    for (const tier of second()) {
      expect(tier.blocks[0]![0]!.x).toBe(tier.blocks[1]![0]!.x);
      expect(tier.blocks[0]![0]!.w).toBe(tier.blocks[1]![0]!.w);
    }
  });
});

describe('tiers that cannot be given up', () => {
  it('counts the building purchase as owned even when a plan leaves it out', () => {
    // Tier 15 buys the Regional Sorting Centre itself, so it is always owned, even for a plan
    // whose tier list omits it.
    expect(ownedTiersOf({ ownedTiers: [16, 17] }).has(15)).toBe(true);
  });

  it('still honours the tiers a plan really did untick', () => {
    const owned = ownedTiersOf({ ownedTiers: [16] });
    expect(owned.has(16)).toBe(true);
    expect(owned.has(17)).toBe(false);
    expect(owned.has(18)).toBe(false);
  });

  it('never charges for it in what is left to buy', () => {
    const second = WAREHOUSE_TIERS.filter((t) => t.warehouse === 'second');
    const owned = ownedTiersOf({ ownedTiers: [] });
    // 16 + 17 + 18 = 5200 + 5500 + 5800. The 500000 is not in there.
    expect(costOfMissingTiers(second, owned)).toBe(16500);
  });

  it('leaves the main warehouse untouched by any of this', () => {
    expect(ownedTiersOf({ ownedTiers: [] }).has(1)).toBe(false);
  });
});
