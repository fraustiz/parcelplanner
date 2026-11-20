import { describe, it, expect } from 'vitest';
import { getCatalogue } from './catalogue';
import { WAREHOUSES } from './warehouses';
import { validate } from '@/core/validate';
import { planFromJson } from '@/core/serialize';
import { CATALOGUE_GAME_VERSION } from '@/core/version';

// The catalogue is scoped to conveyors and sorting: pallets, 'station' and 'decor' are excluded
// (see EXCLUDED_CATEGORIES / EXCLUDED_IDS in scripts/transform-catalogue.mjs).
const REMOVED_IDS = [
  'BP_Pallet', 'BP_PalletMedium', 'BP_PalletLarge',
  'BP_KillergramScales', 'BP_TableScales', 'BP_Keypad', 'BP_OpeningKit',
  'BP_SerialNumberScanner',
  'BP_InspectTable_ColourG', 'BP_InspectTable_ColourD',
  'BP_InspectTable_ColourE', 'BP_InspectTable_ColourF',
  'BP_Basketball', 'BP_BasketballHoop',
  'BP_DD_PlantA', 'BP_DD_PlantB', 'BP_DD_PlantC', 'BP_DD_PlantD',
  'BP_Wallpaper_Frame', 'BP_Wallpaper_Slate', 'BP_ConveyorPaint', 'BP_Divider',
];

describe('getCatalogue', () => {
  const catalogue = getCatalogue();

  it('holds the 28 kept objects, plus the T-Joiner the export predates', () => {
    // 50 shop objects minus 22 excluded, plus one added after the extraction (PENDING_EXTRACTION).
    expect(catalogue.size).toBe(29);
  });

  it('prices the straight conveyor at 100', () => {
    expect(catalogue.get('BP_ConveyorBelt_Straight_Tier1')?.price).toBe(100);
  });

  it('prices the auto pauser at 30000, which the game cut it to', () => {
    // The extraction in data/raw says 50000; the 2026-07-30 patch price comes from
    // scripts/object-base-prices.mjs until a re-extraction.
    expect(catalogue.get('BP_ConveyorBelt_AutoPauser')?.price).toBe(30000);
  });

  it('gives the elevator and the speedway three cells, not two', () => {
    // Confirmed from the blueprints (CONFIRMED_FOOTPRINTS in scripts/transform-catalogue.mjs).
    // Too small a footprint gives a layout that fits here but not in the game.
    expect(catalogue.get('BP_ConveyorBelt_Speedway')?.footprint).toEqual({ w: 1, h: 3 });
    expect(catalogue.get('BP_ConveyorBelt_Elevator')?.footprint).toEqual({ w: 1, h: 3 });
  });

  it('gives the storage racks three cells, measured from their own artwork', () => {
    // All three racks are viewBox 12x36, i.e. 1x3. No object uses a guessed footprint.
    for (const id of ['BP_StorageRack_Medium', 'BP_StorageRack_Large', 'BP_StorageRack_ExtraLarge']) {
      expect(catalogue.get(id)?.footprint).toEqual({ w: 1, h: 3 });
    }
  });

  it('marks the elevator as reaching up through the floor above, and nothing else', () => {
    const reaching = [...catalogue.values()].filter((e) => e.spansTheFloorAbove);
    expect(reaching.map((e) => e.id)).toEqual(['BP_ConveyorBelt_Elevator']);
  });

  it('makes every other object a single cell', () => {
    expect(catalogue.get('BP_ConveyorBelt_Straight_Tier1')?.footprint)
      .toEqual({ w: 1, h: 1 });
  });

  it('gives the elevator a port that climbs a floor', () => {
    const ports = catalogue.get('BP_ConveyorBelt_Elevator')?.ports ?? [];
    expect(ports.some((p) => p.dir === 'out' && p.floorDelta === 1)).toBe(true);
  });

  it('gives the sticker verification conveyor one input and three outputs, on N/S/E/W', () => {
    // The only sorting object: E = approved sticker, W = refused, S (straight on, flow runs up) = none.
    // The entry is N.
    const ports = catalogue.get('BP_ConveyorBelt_Scanner2_Tier1')?.ports ?? [];
    const ins = ports.filter((p) => p.dir === 'in');
    const outs = ports.filter((p) => p.dir === 'out');
    expect(ins).toHaveLength(1);
    expect(outs).toHaveLength(3);
    expect(ins[0]?.side).toBe('N');
    expect(outs.map((p) => p.side).sort()).toEqual(['E', 'S', 'W']);
  });

  it('resolves the sticker verifier\'s price from its Template parent rather than leaving it null', () => {
    // This CDO only overrides RequiredWarehouseTier and ShopImage; the price lives on the
    // BP_ConveyorBelt_Scanner2 CDO its "Template" points at, which Resolve-PurchaseInfo follows.
    const entry = catalogue.get('BP_ConveyorBelt_Scanner2_Tier1');
    expect(entry?.price).toBe(1200);
    expect(entry?.displayName.en).toBe('Sticker Checker Conveyor');
  });

  it('leaves no object in the trimmed catalogue unpriced', () => {
    const unpriced = [...catalogue.values()].filter((e) => e.price === null);
    expect(unpriced.map((e) => e.id)).toEqual([]);
  });

  it('contains no object in a removed category', () => {
    for (const entry of catalogue.values()) {
      expect(['station', 'decor']).not.toContain(entry.category);
    }
  });

  it('contains no pallet', () => {
    for (const id of REMOVED_IDS) {
      expect(catalogue.has(id)).toBe(false);
    }
  });

  it('keeps the storage racks, since validate\'s no-path-to-sink rule needs a sink to route to', () => {
    expect(catalogue.has('BP_StorageRack_Medium')).toBe(true);
    expect(catalogue.has('BP_StorageRack_Large')).toBe(true);
    expect(catalogue.has('BP_StorageRack_ExtraLarge')).toBe(true);
  });

  it('loads a plan referencing a removed object id and reports it as unknown-object rather than crashing', () => {
    // A plan may reference a removed object such as BP_Pallet: validate reports it, never throws.
    const json = JSON.stringify({
      gameVersion: CATALOGUE_GAME_VERSION,
      warehouse: 'main',
      placements: [
        { id: 'a', objectId: 'BP_Pallet', warehouse: 'main', floor: 0, cell: { x: 0, y: 0 }, rotation: 0, tier: 1 },
      ],
        });

    const plan = planFromJson(json);
    const issues = validate(plan, catalogue, WAREHOUSES);
    expect(issues.some((i) => i.code === 'unknown-object')).toBe(true);
  });
});

describe('base prices overridden since the extraction', () => {
  // data/raw is a snapshot; scripts/object-base-prices.mjs overrides prices changed since.
  // One test proves the override applies, the other fails once a re-extraction makes it redundant.
  const catalogue = getCatalogue();

  it('charges 30000 for the auto pauser, not the extracted 50000', () => {
    // Dev patch notes, 2026-07-30: "reduced their price to $30k".
    expect(catalogue.get('BP_ConveyorBelt_AutoPauser')?.price).toBe(30000);
  });

  it('keeps every override actually differing from the raw data', async () => {
    // An override equal to the extraction is dead weight.
    const { OBJECT_BASE_PRICES } = await import('../../scripts/object-base-prices.mjs');
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(
      readFileSync('data/raw/shop-items.json', 'utf8').replace(/^\uFEFF/, ''),
    );
    const items: { id: string; price?: number }[] = Array.isArray(raw) ? raw : (raw.items ?? []);
    const byId = new Map(items.map((o) => [o.id, o]));
    for (const [id, price] of Object.entries(OBJECT_BASE_PRICES)) {
      const extracted = byId.get(id)?.price;
      if (extracted === undefined) continue; // not in this extraction
      expect(`${id} still overrides`).toBe(extracted === price ? `${id} is now redundant` : `${id} still overrides`);
    }
  });
});

describe('reserved zones', () => {
  const catalogue = getCatalogue();

  it('answers for a zone of any size, with that size as its footprint', () => {
    expect(catalogue.get('zone-3x5')?.footprint).toEqual({ w: 3, h: 5 });
    expect(catalogue.has('zone-12x1')).toBe(true);
  });

  it('never lists one, so the palette and the counts see only game objects', () => {
    catalogue.get('zone-4x4');
    expect([...catalogue.values()].some((e) => e.category === 'zone')).toBe(false);
    expect(catalogue.size).toBe(29);
  });

  it('gives the same entry back for the same id', () => {
    // A memo keyed on the entry must not see a new one every render.
    expect(catalogue.get('zone-2x2')).toBe(catalogue.get('zone-2x2'));
  });

  it('is free, rather than unpriced', () => {
    // Nothing is bought; a null price would raise the "some prices are missing" warning.
    expect(catalogue.get('zone-2x2')?.price).toBe(0);
  });

  it('knows nothing of an id that only looks like a zone', () => {
    expect(catalogue.get('zone-0x2')).toBeUndefined();
    expect(catalogue.has('zone-999x2')).toBe(false);
  });

  it('keeps every object off its cells', () => {
    const plan = planFromJson(JSON.stringify({
      gameVersion: CATALOGUE_GAME_VERSION, warehouse: 'main',
      placements: [
        { id: 'z', objectId: 'zone-3x2', warehouse: 'main', floor: 0, cell: { x: 2, y: 2 }, rotation: 0, tier: 1 },
        { id: 'b', objectId: 'BP_ConveyorBelt_Straight_Tier1', warehouse: 'main', floor: 0, cell: { x: 3, y: 3 }, rotation: 0, tier: 1 },
      ],
    }));
    expect(validate(plan, catalogue, WAREHOUSES).map((i) => i.code)).toEqual(['overlap', 'overlap']);
  });
});

describe('the T-Joiner conveyor', () => {
  // Added by the 25 September 2026 game update, ahead of a re-extraction: id from the game's
  // package index, price from the in-game shop. See PENDING_EXTRACTION in transform-catalogue.mjs.
  const tJoiner = getCatalogue().get('BP_ConveyorBelt_Joiner_2WayT');

  it('is in the catalogue', () => {
    expect(tJoiner).toBeDefined();
  });

  it('costs 650 and upgrades to tier 3 in 50 steps, like the other joiners', () => {
    expect(tJoiner?.price).toBe(650);
    expect(tJoiner?.upgradePrice).toBe(50);
    expect(tJoiner?.maxTier).toBe(3);
  });

  it('takes a parcel in on two OPPOSITE sides and out on the third', () => {
    // Fed from both sides, so two belts meeting head-on can merge.
    expect(tJoiner?.ports).toEqual([
      { side: 'E', offset: 0, dir: 'in' },
      { side: 'W', offset: 0, dir: 'in' },
      { side: 'S', offset: 0, dir: 'out' },
    ]);
  });

  it('stands on a single cell', () => {
    expect(tJoiner?.footprint).toEqual({ w: 1, h: 1 });
  });
});
