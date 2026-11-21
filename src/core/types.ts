export type Rotation = 0 | 90 | 180 | 270;
export type Side = 'N' | 'E' | 'S' | 'W';
/**
 * The game's two buildings, plus the workshop: an empty bench of this app's
 * own for laying out a module before copying it into a building. See
 * WAREHOUSES in src/data/warehouses.ts.
 */
export type WarehouseId = 'main' | 'second' | 'workshop';

/**
 * The catalogue covers the conveyor and sorting system only, by design. The
 * game's 'station' and 'decor' objects are filtered out by
 * scripts/transform-catalogue.mjs before they reach catalogue.json.
 */
export type Category =
  | 'conveyor' | 'scanner' | 'router' | 'storage'
  /** A reserved area the player drew, never a game object (see src/core/zone.ts). */
  | 'zone';

/**
 * A grid cell: x grows eastward, y southward. A positive `Rotation` turns
 * clockwise on screen. `Side` labels are inverted (`N` faces increasing y, see
 * src/data/ports.ts), so the screen-clockwise cycle is N → W → S → E.
 */
export interface Cell { x: number; y: number }

export interface Port {
  side: Side;
  /** Cell index along `side`, 0-based, for footprints wider than one cell. */
  offset: number;
  dir: 'in' | 'out';
  /** Floor the port opens onto, relative to the placement. Default 0. */
  floorDelta?: number;
  /**
   * The piece can run the other way: when a belt feeds one of its `out`
   * ports, every side a belt feeds takes parcels in and every other side
   * sends them out (see buildGraph). A splitter then merges, a straight piece
   * runs backwards. Set on every port of such a piece.
   */
  reversible?: boolean;
}

export interface CatalogEntry {
  id: string;
  displayName: { en: string; fr: string };
  category: Category;
  footprint: { w: number; h: number };
  /** null when the game data did not expose a price for this object. */
  price: number | null;
  /**
   * Cost of the first upgrade step; it doubles each tier after that (see
   * `tierPrice`). null when the object cannot be upgraded. Only three figures
   * come from game data; for the rest see scripts/object-upgrade-prices.mjs.
   */
  upgradePrice: number | null;
  /** Highest tier: 3 for anything upgradable (the game's global
   * BP_ConveyorBelt.MaxUpgradeTier), 1 for storage racks and the country diverter. */
  maxTier: number;
  ports: Port[];
  /**
   * Cells this object passes over rather than stands on, as offsets into its
   * unrotated footprint (the bridge conveyor's raised middle). `canPlace` lets
   * such a cell hold one ground and one raised occupant.
   */
  bridgedCells?: readonly Cell[];
  /**
   * Stands on its floor and reaches through the one above (the vertical
   * elevator). `canPlace` allows it on floor 0 only, and never under a floor.
   */
  spansTheFloorAbove?: boolean;
  /** Extracted but unused in v1. Never read it. */
  speed?: number;
}

export interface Placement {
  id: string;
  objectId: string;
  /** Which building this placement belongs to; buildings never share a layout. */
  warehouse: WarehouseId;
  floor: number;
  cell: Cell;
  rotation: Rotation;
  /**
   * Flipped horizontally in the object's own authoring frame, before
   * `rotation`. Together they give all eight orientations from one drawing and
   * one port list. Mirror-then-rotate is shared by `placedPort` and
   * `drawShapeGroup`; reversing it in one place breaks the flow graph.
   * `undefined` means not mirrored.
   */
  mirrored?: boolean;
  /**
   * A colour the player chose for this object, or absent for its own.
   * Applied at draw time by substituting one colour of the artwork; see
   * src/data/colours.ts.
   */
  colour?: string;
  /**
   * What a reserved zone stands for ("Sorting station", "Walkway"). Only zones
   * carry one. Absent means unnamed.
   */
  label?: string;
  tier: number;
}

/**
 * A note left on the grid. It belongs to the plan, so it survives a reload,
 * travels in a share link and comes back out of an export.
 */
export interface PlanNote {
  id: string;
  warehouse: WarehouseId;
  floor: number;
  cell: Cell;
  text: string;
}

export interface Plan {
  gameVersion: string;
  warehouse: WarehouseId;
  placements: Placement[];
  /** Notes left on the grid. Absent means none, and must not be rejected. */
  notes?: PlanNote[];
  /**
   * Warehouse expansion tiers the player owns, numbered 1..18 as in
   * src/data/warehouse-tiers.ts. Absent means all owned: defaulting to none
   * would grey out all but a 10x20 corner.
   */
  ownedTiers?: number[];
}

/**
 * A door built into a warehouse's walls by the game. Never a `Placement`: not
 * movable, deletable or costed. Real values live in `DOORS` in
 * src/data/doors.ts and are passed in, so `src/core/` stays free of data imports.
 *
 * `side` is the side of the door's cell that touches the outer wall (checked in
 * doors.test.ts). Rendering uses it as is, but `buildGraph` must use
 * `OPPOSITE[side]`, the door's interior neighbour.
 */
export interface Door {
  /** An id invented for this app, e.g. 'main-delivery-0'. The game's
   * DeliveryDoorID/UniqueDoorID values are hash-like, not stable ids. */
  id: string;
  warehouse: WarehouseId;
  floor: number;
  cell: Cell;
  side: Side;
  /**
   * 'delivery': a permanent `out` port where parcels enter the network.
   * 'export': a permanent `in` port sorted by cargo type (see `cargoTypes`).
   * 'country-export': a permanent `in` port sorted by destination country. Kept
   * separate because an 'export' door with no cargo types is a reject bin. The
   * country each one serves is unknown, so none is modelled.
   */
  kind: 'delivery' | 'export' | 'country-export';
  /** Cargo types this 'export' door accepts; empty or absent means any (a
   * reject bin). Never set on other kinds. */
  cargoTypes?: readonly string[];
}

/**
 * One piece of an object's artwork (see assets/shapes/ and
 * scripts/build-shapes.mjs), drawn by src/render/renderer.ts.
 *
 * `rect` coordinates are in cell units (scaled at build time from 12 SVG units
 * per cell). `path` `d` strings stay in raw viewBox units; the renderer scales
 * its context by `1 / divisor` (see `ShapeSheet.divisor`) before drawing them.
 */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; belowDeck?: boolean }
  | { kind: 'path'; d: string; fill: string; upright?: boolean; belowDeck?: boolean }
  | {
      kind: 'path';
      d: string;
      stroke: string;
      cap?: 'round' | 'butt';
      /**
       * Not flipped when the placement is mirrored: a painted symbol (the
       * sticker checker's tick and cross) that reads wrong backwards. Set from
       * scripts/upright-shapes.mjs.
       */
      upright?: boolean;
      /**
       * Part of the object below the floor being viewed, drawn at half opacity
       * (the vertical elevator's shaft). Set from BELOW_DECK in scripts/build-shapes.mjs.
       */
      belowDeck?: boolean;
      /**
       * SVG `stroke-width` in viewBox units, 1 when the source has none. Set
       * explicitly so the stroke never inherits the canvas context's lineWidth.
       */
      strokeWidth: number;
    };
