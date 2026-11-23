import {
  coveredCells, displayColumn, displayRow, isBuildable, rotatedFootprint, SIDE_STEP,
  warehouseDimensions, type WarehouseGeometry,
} from '@/core/grid';
import { CARGO_DIVERTER, COUNTRY_DIVERTER, diverterScreens, screenBox, type DiverterScreen, type Way } from '@/core/diverters';
import type { LegendEntry } from '@/core/legend';
import type { CatalogEntry, Cell, Door, Placement, Plan, PlanNote, Rotation, Shape, Side } from '@/core/types';
import { CELL_PX, visibleCellRange, worldToScreen, type Camera } from './camera';

/**
 * Width over height of the parcel drawing (14×16), so it is never stretched.
 * A constant because the image may still be loading when a frame is drawn.
 */
const PARCEL_ART_ASPECT = 14 / 16;

/** The first line of a note, which is all that fits on one cell. */
const firstLineOf = (text: string): string => text.split(/\r?\n/)[0] ?? '';

export interface HighlightState {
  cells: Cell[];
  valid: boolean;
  /**
   * The pending placements, so their artwork and icons are previewed before the drop.
   * A list, because a paste is a whole shape. Optional for callers that only need the footprint tint.
   */
  preview?: {
    objectId: string;
    cell: Cell;
    rotation: Rotation;
    mirrored?: boolean;
    /** The colour the object is painted, so the preview matches the placed object. */
    colour?: string;
  }[];
}

/**
 * The only drawing operations the scene needs. A CanvasRenderingContext2D
 * satisfies this structurally; so does a recording stub in tests.
 */
export interface Draw2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  /** Only used by the coordinate rulers. */
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'top' | 'middle' | 'bottom';
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;

  /** Cap style for the next strokePath(), like SVG's `stroke-linecap` (see `Shape` in src/core/types.ts). */
  lineCap: 'round' | 'butt';
  /** 0..1 opacity for subsequent draws, as on a canvas. Used for parts below the viewed floor (`Shape.belowDeck`). */
  globalAlpha: number;
  /** Push/pop the transform, as on a canvas, so one object's transform never leaks into the next. */
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  /** Rotates the current transform clockwise on screen by `radians`, as on a canvas. */
  rotate(radians: number): void;
  /** Narrows subsequent drawing to this rectangle, until the next restore().
   * Shows a lower floor's objects only where no deck covers them. */
  clipRect(x: number, y: number, w: number, h: number): void;
  /** Fills/strokes an SVG path `d` string with the current styles. A raw string so a real
   * context can wrap it in `Path2D` and the test recorder can capture it. */
  fillPath(d: string): void;
  strokePath(d: string): void;
  /**
   * Draws the icon at `path` (an OBJECT_ICONS value) into `x, y, w, h` in local coordinates.
   * A path rather than an image keeps this file DOM-free; a missing or loading image draws nothing and never throws.
   */
  drawImage(path: string, x: number, y: number, w: number, h: number): void;
}

export interface DrawOptions {
  plan: Plan;
  /** Which palette to draw with. Defaults to the dark one. */
  palette?: ScenePalette;
  catalogue: Map<string, CatalogEntry>;
  camera: Camera;
  width: number;
  height: number;
  /** Floor being edited. Other floors draw faded. */
  floor: number;
  highlight: HighlightState | null;
  selectedIds: readonly string[];
  /** Real warehouse block geometry, e.g. `WAREHOUSES`, passed in so src/core stays free of data imports.
   * Cells outside every block (the L shape's notch, the narrower mezzanine) get no grid lines. */
  geometry: WarehouseGeometry;
  /** The part of `geometry` the player has unlocked (`ownedGeometry`). Only grid cells come from it;
   * rulers and camera use `geometry`, so ticking off an expansion greys cells instead of resizing the building. */
  unlocked: WarehouseGeometry;
  /** An object's artwork by catalogue id (`getShapes()`); an id with no entry draws the plain rectangle.
   * A function because the storage racks depend on the interface language and the elevator on
   * `floorOffset` (viewed floor minus its own), which the caller resolves so this file needs no src/data. */
  shapes: (id: string, floorOffset: number) => readonly Shape[] | undefined;
  /** SVG viewBox units per grid cell in `shapes` (`SHAPE_DIVISOR`). Only `path` needs it; `rect` is already in cells. */
  shapeDivisor: number;
  /** An object's icon by catalogue id (`OBJECT_ICONS`), drawn over the vector artwork, which cannot
   * carry the source SVGs' embedded raster icons. An id with no entry gets no icon. */
  icons: ReadonlyMap<string, string>;
  /** One icon per cargo type, keyed like a `Door`'s `cargoTypes` (`CARGO_TYPE_ICONS`), to label export door bays. */
  cargoIcons: ReadonlyMap<string, string>;
  /** The flag stamped on a country export door's bay, since those sort by destination. Undefined leaves it unlabelled. */
  countryIcon?: string;
  /**
   * Flag image by country id (`countryFlags()` in src/data/countries.ts). A country door the
   * plan assigns (`plan.doorCountries`) shows its country's flag in place of `countryIcon`.
   */
  countryFlags?: ReadonlyMap<string, string>;
  /** The country door under the pointer, lit up so it reads as something to click. */
  hoveredDoorId?: string;
  /** Marks country doors as clickable (the editor). Left off in exported images and previews. */
  doorChips?: boolean;
  /**
   * Marks diverter screens as clickable (the editor, with a mouse): an unset screen of a selected
   * or hovered diverter draws an empty frame to click. Left off in exported images and previews.
   */
  screenSlots?: boolean;
  /** The diverter screen under the pointer, outlined so it reads as something to click. */
  hoveredScreen?: { placementId: string; cell: number; way: Way };
  /** Notes on the grid (`plan.notes`). Only those on the drawn floor and warehouse appear. */
  notes?: readonly PlanNote[];
  /** The parcel drawing (`PARCEL_ICON`). Without it a parcel draws no sprite, never a substitute shape. */
  parcelIcon?: string;
  /** Fixed doors (`DOORS`), drawn as non-interactive fixtures; hit-testing only uses `plan.placements`. */
  doors: readonly Door[];
  /** The box selection being dragged, as two inclusive corner cells in either order, or null.
   * Drawn last, over even the drag/drop highlight. */
  marquee: { from: Cell; to: Cell } | null;
  /** The keyboard cursor's cell, or null when the canvas does not have
   * keyboard focus. Drawn as corner brackets so it never reads as a
   * selection outline. */
  cursor?: Cell | null;
  /**
   * The parcels of the live preview (see src/core/live-sim.ts) and where the oldest has been.
   * `at` is fractional, so a position of 4.5 draws halfway between cells and the parcel glides.
   */
  parcels?: readonly { at: Cell; dropped: boolean }[];
  trail?: readonly Cell[];
  /** How full each rack is during the preview, written in its bottom-right corner: `from` and
   * `to` are the corners of its footprint on the floor shown. */
  rackFill?: readonly { from: Cell; to: Cell; text: string }[];
  /** The artwork colour a chosen colour replaces, or null for a family that cannot be painted. */
  repaintableColourOf: (entry: CatalogEntry) => string | null;
  /**
   * Exits that lead nowhere (`deadEnds` in src/core/dead-ends.ts): the cell and side a parcel
   * would leave by and fall. Marked on the floor shown with a warning triangle pointing out.
   */
  deadEnds?: readonly { floor: number; cell: Cell; side: Side }[];
  /** Staircases between floors, from src/data/stairs.ts. */
  stairs: readonly {
    warehouse: Plan['warehouse'];
    floor: number;
    cell: Cell;
    w: number;
    h: number;
  }[];
  /** The door arrow from assets/ui/Flèche.svg. Points up in its own frame; drawDoors turns it. */
  doorArrow: readonly Shape[];
  doorArrowDivisor: number;
}

export const DARK_SCENE = {
  background: '#0f1115',
  /** The ruler hue at 50% alpha, visible without competing with the objects on top. */
  gridLine: 'rgba(125, 133, 144, 0.5)',
  outside: '#0a0b0e',
  object: '#5b8def',
  objectFaded: 'rgba(91, 141, 239, 0.18)',
  selected: '#f5c65b',
  highlightValid: 'rgba(86, 204, 128, 0.45)',
  highlightInvalid: 'rgba(232, 96, 76, 0.45)',
  /** Coordinate-ruler numbers, in the UI's muted tone so they read as chrome. */
  ruler: '#7d8590',
  /** Door colours: orange for delivery, green for export, red for the reject bin (drawn with an X).
   * More saturated than the translucent valid/invalid highlight, so the two never look alike. */
  doorDelivery: '#e08c3c',
  doorExport: '#3fa96a',
  doorReject: '#d94f3d',
  /** The door opening itself: a black square the arrow is cut out of, so
   * an opening reads as a hole in the wall rather than as more paint. */
  doorPortal: '#0b0d10',
  /** The arrow through the opening. A role of its own because the SVG is stroked white, the light
   * theme's portal colour; it must never equal `doorPortal`. */
  doorArrow: '#ffffff',
  /**
   * White strokes in the artwork: only the storage racks' letters, which sit in the gaps between
   * the rails, over the page. White fills (the elevator's caps, on its own dark rail) are not covered.
   */
  artworkLine: '#ffffff',
  /** The edge of the floor above, seen from below: the grid's hue, told apart by weight. */
  deckEdge: 'rgba(125, 133, 144, 0.8)',
  /** A staircase, see-through because a flight does not block building in the game. */
  stairs: 'rgba(141, 148, 158, 0.22)',
  stairsStep: 'rgba(141, 148, 158, 0.55)',
  /** A door bay's glyph, in the same black as the recoloured object icons (see blackenIcon). */
  doorGlyph: '#000000',
  /** The pick-a-country chip on a country door, and the wash over a door under the pointer. */
  doorChip: '#ffffff',
  doorHover: 'rgba(255, 255, 255, 0.22)',
  /** The box-selection marquee: the selection gold, with a faint fill. */
  marqueeFill: 'rgba(245, 198, 91, 0.12)',
  /** The keyboard cursor: the page's own accent, as on focused controls. */
  cursor: '#dba66d',
  /** An exit that leads nowhere: the UI's warning orange, so it reads as a caution, not an error. */
  deadEnd: '#f0a05a',
  /** A note on the plan, warm and paper-like so it reads as written on it. */
  note: '#e8c35c',
  noteInk: '#221a06',
  /** A reserved zone the player drew, until painted (see drawZone): the chrome's grey, a step
   * lighter. Kept equal to the zone's entry in src/data/colours.ts's REPAINTED. */
  zone: '#8d949e',
  /** A zone's name, written over its own wash and hatching. */
  zoneInk: '#e6e8eb',
  /** The words of an exported image's legend and title. Its counts and
   * headings use `ruler`, the chrome's muted tone. */
  legendInk: '#e6e8eb',
  /** A followed parcel, its trail, and a distinct colour where it dropped. */
  parcel: '#f2f4f7',
  parcelDropped: '#e8604c',
  parcelTrail: 'rgba(242, 244, 247, 0.22)',
  /** A rack's fill count during the preview: ink on a dark tab, readable over the red rack. */
  rackFillBg: 'rgba(11, 13, 16, 0.82)',
  rackFillInk: '#f2f4f7',
} as const;

/**
 * The same roles, chosen for a light page rather than inverted from the dark, so each thing keeps
 * its weight. `doorPortal` flips: the opening must contrast with its surroundings in both themes.
 */
export const LIGHT_SCENE: ScenePalette = {
  background: '#f6f7f9',
  gridLine: 'rgba(90, 98, 108, 0.32)',
  outside: '#e6e9ee',
  object: '#2d63c8',
  objectFaded: 'rgba(45, 99, 200, 0.20)',
  selected: '#b8790a',
  highlightValid: 'rgba(26, 127, 67, 0.35)',
  highlightInvalid: 'rgba(192, 52, 42, 0.35)',
  ruler: '#6a737d',
  doorDelivery: '#c2701f',
  doorExport: '#2b8a55',
  doorReject: '#c03a2a',
  doorPortal: '#ffffff',
  doorArrow: '#0b0d10',
  artworkLine: '#000000',
  note: '#d8a72c',
  noteInk: '#2b2205',
  zone: '#6a737d',
  zoneInk: '#1b2430',
  legendInk: '#1b2430',
  parcel: '#1b2430',
  parcelDropped: '#c0342a',
  parcelTrail: 'rgba(27, 36, 48, 0.20)',
  rackFillBg: 'rgba(255, 255, 255, 0.88)',
  rackFillInk: '#1b2430',
  deckEdge: 'rgba(90, 98, 108, 0.7)',
  stairs: 'rgba(90, 98, 108, 0.18)',
  stairsStep: 'rgba(90, 98, 108, 0.45)',
  doorGlyph: '#000000',
  doorChip: '#ffffff',
  doorHover: 'rgba(255, 255, 255, 0.3)',
  marqueeFill: 'rgba(184, 121, 10, 0.14)',
  cursor: '#8a5626',
  deadEnd: '#c27100',
};

/** Widened: DARK_SCENE is `as const`, so its own type is literals nothing else could satisfy. */
export type ScenePalette = Record<keyof typeof DARK_SCENE, string>;

/**
 * The palette of the current draw. Module-level so the helpers below need no extra parameter.
 * Safe because `drawScene` is fully synchronous; if anything here becomes async, make it a parameter.
 */
let colours: ScenePalette = DARK_SCENE;

/** How the source SVGs spell white, in either case. */
const WHITE_ARTWORK = /^(white|#fff|#ffffff)$/i;



/** A door's bay in cells, along and out from the wall, so doors on vertical walls get the same bay. */
const DOOR_BAY_SPAN = 3;
const DOOR_BAY_DEPTH = 3;

/**
 * The screen rect of a door's bay, outside the building, centred on the door's cell along the wall.
 * `side` already faces outward (see `Door` in src/core/types.ts), so no flip, unlike buildGraph.
 * A door sits on an outer wall, so the bay can never cover a placement.
 */
function doorBayRect(
  px: number,
  py: number,
  size: number,
  side: Side,
): { x: number; y: number; w: number; h: number } {
  const span = size * DOOR_BAY_SPAN;
  const depth = size * DOOR_BAY_DEPTH;
  // How far the bay overhangs its door cell on each side, to stay centred.
  const overhang = (size * (DOOR_BAY_SPAN - 1)) / 2;
  switch (side) {
    case 'N': // +y: bay below the cell
      return { x: px - overhang, y: py + size, w: span, h: depth };
    case 'S': // -y: bay above the cell
      return { x: px - overhang, y: py - depth, w: span, h: depth };
    case 'E': // +x: bay to the right
      return { x: px + size, y: py - overhang, w: depth, h: span };
    case 'W': // -x: bay to the left
      return { x: px - depth, y: py - overhang, w: depth, h: span };
  }
}

/** The one-cell square where the bay meets the wall: the door opening, painted black with an arrow through it. */
function doorPortalRect(
  px: number,
  py: number,
  size: number,
  side: Side,
): { x: number; y: number; w: number; h: number } {
  switch (side) {
    case 'N': return { x: px, y: py + size, w: size, h: size };
    case 'S': return { x: px, y: py - size, w: size, h: size };
    case 'E': return { x: px + size, y: py, w: size, h: size };
    case 'W': return { x: px - size, y: py, w: size, h: size };
  }
}

/** The part of the bay beyond the portal, for cargo glyphs, so a logo never sits under the arrow. */
function doorGlyphRect(
  px: number,
  py: number,
  size: number,
  side: Side,
): { x: number; y: number; w: number; h: number } {
  const span = size * DOOR_BAY_SPAN;
  const rest = size * (DOOR_BAY_DEPTH - 1);
  const overhang = (size * (DOOR_BAY_SPAN - 1)) / 2;
  switch (side) {
    case 'N': return { x: px - overhang, y: py + 2 * size, w: span, h: rest };
    case 'S': return { x: px - overhang, y: py - size - rest, w: span, h: rest };
    case 'E': return { x: px + 2 * size, y: py - overhang, w: rest, h: span };
    case 'W': return { x: px - size - rest, y: py - overhang, w: rest, h: span };
  }
}

/** Which way a wall faces out of the building. Compass labels are inverted:
 * N is +y, down on screen (see src/core/types.ts). */

/** The cell the door's opening occupies, one step outside the wall, since drawShapeGroup works in cells. */
function doorPortalCell(cell: Cell, side: Side): Cell {
  const out = OUTWARD[side];
  return { x: cell.x + out.dx, y: cell.y + out.dy };
}

const OUTWARD: Record<Side, { dx: number; dy: number }> = {
  N: { dx: 0, dy: 1 },
  S: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

/** Quarter turns to point the door arrow the way parcels travel. The SVG points up (-y on
 * screen), and turns go clockwise from there. */
const ARROW_TURNS: { dx: number; dy: number; rotation: Rotation }[] = [
  { dx: 0, dy: -1, rotation: 0 },
  { dx: 1, dy: 0, rotation: 90 },
  { dx: 0, dy: 1, rotation: 180 },
  { dx: -1, dy: 0, rotation: 270 },
];

/**
 * The arrow through a door's opening: into the building for a delivery, out for every exit.
 * Drawn from the SVG through drawShapeGroup, so editing assets/ui/Flèche.svg is enough to change it.
 */
function drawDoorArrow(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  cell: Cell,
  step: { dx: number; dy: number },
  arrow: readonly Shape[],
  divisor: number,
): void {
  const turn = ARROW_TURNS.find((t) => t.dx === step.dx && t.dy === step.dy);
  if (!turn) return;
  // `from` is read from the artwork, not hard-coded as white: repaint only swaps a colour it
  // matches, so a redrawn SVG in another colour would silently stop repainting.
  const ink = artworkInk(arrow);
  drawShapeGroup(
    ctx, camera, size, cell, arrow, divisor, turn.rotation, false, { w: 1, h: 1 }, 1,
    ink === undefined ? undefined : { from: ink, to: colours.doorArrow },
  );
}

/** The colour a piece of artwork paints itself in: its first shape's, since the door arrow is single-colour. */
function artworkInk(shapes: readonly Shape[]): string | undefined {
  const [first] = shapes;
  if (first === undefined) return undefined;
  return 'fill' in first ? first.fill : first.stroke;
}


/** Edge length of one bay glyph (a cargo logo, or the reject X), in cells. */
const DOOR_GLYPH_SCALE = 1;
/** Gap between two glyphs in one bay, in cells (the Road+Rail and Air+Maritime doors). */
const DOOR_GLYPH_GAP = 0.25;

/**
 * Which door colour and glyph a door gets. Reject bins are export doors with no cargo types,
 * recognised the same way as in src/core/graph.ts.
 */
function doorLook(door: Door): 'delivery' | 'export' | 'country' | 'reject' {
  if (door.kind === 'delivery') return 'delivery';
  // Sorted by country: an exit, so green, labelled with a flag. Checked before the cargoTypes
  // test, which would read its empty cargo list as a reject bin.
  if (door.kind === 'country-export') return 'country';
  return (door.cargoTypes?.length ?? 0) > 0 ? 'export' : 'reject';
}

/** Glyph centres along the bay's long axis, centred as a group on the bay's centre. */
function glyphCentres(
  bay: { x: number; y: number; w: number; h: number },
  size: number,
  count: number,
): { cx: number; cy: number }[] {
  const glyph = size * DOOR_GLYPH_SCALE;
  const gap = size * DOOR_GLYPH_GAP;
  const total = count * glyph + (count - 1) * gap;
  const centreX = bay.x + bay.w / 2;
  const centreY = bay.y + bay.h / 2;
  const alongX = bay.w > bay.h; // a horizontal wall's bay is wider than deep
  const start = (alongX ? centreX : centreY) - total / 2 + glyph / 2;
  return Array.from({ length: count }, (_, i) => {
    const along = start + i * (glyph + gap);
    return alongX ? { cx: along, cy: centreY } : { cx: centreX, cy: along };
  });
}

/**
 * The reject bin's X, drawn as two crossing strokes rather than fillText so
 * it never depends on a font being available or metrically consistent.
 */
function drawRejectCross(ctx: Draw2D, cx: number, cy: number, size: number): void {
  const arm = (size * DOOR_GLYPH_SCALE) / 2;
  ctx.strokeStyle = colours.doorGlyph;
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy - arm);
  ctx.lineTo(cx + arm, cy + arm);
  ctx.moveTo(cx + arm, cy - arm);
  ctx.lineTo(cx - arm, cy + arm);
  ctx.stroke();
}

/**
 * A triangle on the edge a parcel would leave by, pointing out into the void, outlined so it
 * stays visible on any artwork.
 */
function drawDeadEnd(ctx: Draw2D, camera: Camera, size: number, cell: Cell, side: Side): void {
  const { px, py } = worldToScreen(camera, cell);
  const step = SIDE_STEP[side];
  const edgeX = px + size / 2 + (step.dx * size) / 2;
  const edgeY = py + size / 2 + (step.dy * size) / 2;
  const half = size * 0.3;
  const reach = size * 0.45;
  ctx.fillStyle = colours.deadEnd;
  ctx.strokeStyle = colours.doorPortal;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(edgeX + step.dx * reach, edgeY + step.dy * reach);
  ctx.lineTo(edgeX - step.dy * half, edgeY + step.dx * half);
  ctx.lineTo(edgeX + step.dy * half, edgeY - step.dx * half);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/**
 * Draws every door on `floor` of `warehouse`: a bay outside the wall labelled with what leaves,
 * plus the opening. Called with the grid, before placements, so a door never covers an object.
 */
function drawDoors(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  doors: readonly Door[],
  warehouse: Plan['warehouse'],
  floor: number,
  cargoIcons: ReadonlyMap<string, string>,
  countryIcon: string | undefined,
  arrow: readonly Shape[],
  arrowDivisor: number,
  doorCountries: Plan['doorCountries'],
  countryFlags: ReadonlyMap<string, string> | undefined,
  hoveredDoorId: string | undefined,
  doorChips: boolean,
): void {
  for (const door of doors) {
    if (door.warehouse !== warehouse || door.floor !== floor) continue;
    const look = doorLook(door);
    const colour = look === 'delivery' ? colours.doorDelivery
      : look === 'reject' ? colours.doorReject
      : colours.doorExport; // 'export' and 'country' are both exits
    const { px, py } = worldToScreen(camera, door.cell);

    // The bay first, so the portal paints over the seam where the two meet
    // rather than the other way round.
    const bay = doorBayRect(px, py, size, door.side);
    ctx.fillStyle = colour;
    ctx.fillRect(bay.x, bay.y, bay.w, bay.h);
    if (door.id === hoveredDoorId) {
      ctx.fillStyle = colours.doorHover;
      ctx.fillRect(bay.x, bay.y, bay.w, bay.h);
      ctx.strokeStyle = colours.selected;
      ctx.lineWidth = 2;
      ctx.strokeRect(bay.x + 1, bay.y + 1, bay.w - 2, bay.h - 2);
    }

    // A delivery door gets no glyph, since nothing leaves by it. Glyphs are skipped at far
    // zoom-out, at the same size floor as object icons.
    if (size >= MIN_CELL_SIZE_FOR_ICON) {
      // Glyphs go beyond the portal, so a cargo logo never sits under the arrow.
      const field = doorGlyphRect(px, py, size, door.side);
      const country = look === 'country' ? doorCountries?.[door.id] : undefined;
      const flag = country === undefined ? undefined : countryFlags?.get(country);
      if (flag !== undefined) {
        drawFlag(ctx, field, size, flag);
      } else if (look === 'reject') {
        const [centre] = glyphCentres(field, size, 1);
        if (centre) drawRejectCross(ctx, centre.cx, centre.cy, size);
      } else if (look === 'export' || look === 'country') {
        const paths = look === 'country'
          ? (countryIcon ? [countryIcon] : [])
          : (door.cargoTypes ?? [])
            .map((type) => cargoIcons.get(type))
            .filter((path): path is string => path !== undefined);
        const centres = glyphCentres(field, size, paths.length);
        const glyph = size * DOOR_GLYPH_SCALE;
        paths.forEach((path, i) => {
          const centre = centres[i];
          if (!centre) return;
          ctx.drawImage(path, centre.cx - glyph / 2, centre.cy - glyph / 2, glyph, glyph);
        });
      }
      // A country door is set by clicking it: a drop-down chip says so, flag or not.
      if (look === 'country' && doorChips) drawPickChip(ctx, field, size);
    }

    // The opening, with an arrow showing which way parcels travel.
    const portal = doorPortalRect(px, py, size, door.side);
    ctx.fillStyle = colours.doorPortal;
    ctx.fillRect(portal.x, portal.y, portal.w, portal.h);

    if (size >= MIN_CELL_SIZE_FOR_ICON) {
      const out = OUTWARD[door.side];
      const step = look === 'delivery' ? { dx: -out.dx, dy: -out.dy } : out;
      drawDoorArrow(
        ctx, camera, size, doorPortalCell(door.cell, door.side), step, arrow, arrowDivisor,
      );
    }
  }
}

/**
 * The small white chip with a chevron in a country door's far corner, the mark of a
 * drop-down, so the door reads as something to click. Kept clear of the centred flag.
 */
function drawPickChip(ctx: Draw2D, field: { x: number; y: number; w: number; h: number }, size: number): void {
  const w = size * 0.62;
  const h = size * 0.4;
  const inset = size * 0.08;
  const x = field.x + field.w - w - inset;
  const y = field.y + inset;
  const r = h * 0.3;
  const outline = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  ctx.fillStyle = colours.doorChip;
  ctx.fillPath(outline);
  // White on the exit green is under 3:1, so a dark edge keeps the chip's shape readable.
  ctx.strokeStyle = colours.doorGlyph;
  ctx.lineWidth = 1;
  ctx.strokePath(outline);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const c = h * 0.22;
  ctx.strokeStyle = colours.doorGlyph;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.lineCap = 'round';
  ctx.strokePath(`M${cx - c * 1.4} ${cy - c * 0.6}L${cx} ${cy + c * 0.8}L${cx + c * 1.4} ${cy - c * 0.6}`);
}

/** The game's flags are 1000 x 600. */
const FLAG_ASPECT = 5 / 3;
/** A flag's width in cells: wider than a glyph, since a flag is read by its pattern. */
const FLAG_WIDTH = 1.8;

/** A country's flag, centred in the bay beyond the portal, with a thin dark edge so a white
 * flag still reads against the green bay. */
function drawFlag(
  ctx: Draw2D,
  field: { x: number; y: number; w: number; h: number },
  size: number,
  path: string,
): void {
  const w = Math.min(size * FLAG_WIDTH, field.w * 0.9, field.h * 0.9 * FLAG_ASPECT);
  const h = w / FLAG_ASPECT;
  const x = field.x + (field.w - w) / 2;
  const y = field.y + (field.h - h) / 2;
  ctx.fillStyle = colours.doorGlyph;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.drawImage(path, x, y, w, h);
}

/** A screen flag's width in cells: small enough that both screens of a cell fit beside the belt. */
const SCREEN_FLAG_WIDTH = 0.4;

/**
 * The flag a country diverter's screen shows, on its cell against the side it looks out of,
 * so the country a lane takes reads straight off the plan as it does in the game.
 */
function drawScreenFlag(ctx: Draw2D, camera: Camera, size: number, cell: Cell, side: Side, path: string): void {
  const { px, py } = worldToScreen(camera, cell);
  const step = SIDE_STEP[side];
  const w = size * SCREEN_FLAG_WIDTH;
  const h = w / FLAG_ASPECT;
  // Against the cell's edge on that side, a small margin in, so the belt's middle stays clear.
  const margin = size * 0.06;
  const cx = px + size / 2 + step.dx * (size / 2 - w / 2 - margin);
  const cy = py + size / 2 + step.dy * (size / 2 - h / 2 - margin);
  ctx.fillStyle = colours.doorGlyph;
  ctx.fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
  ctx.drawImage(path, cx - w / 2, cy - h / 2, w, h);
}

/**
 * A cargo diverter's screen: the cargo type's icon on a white plate, three dots for "other
 * types", a struck plate for "nothing", or an empty plate to click when `value` is unset.
 */
function drawCargoScreen(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  screen: DiverterScreen,
  cargoIcons: ReadonlyMap<string, string>,
): void {
  const box = screenBox(screen.cell, screen.side);
  const { px, py } = worldToScreen(camera, { x: 0, y: 0 });
  const x = px + box.x * size;
  const y = py + box.y * size;
  const w = box.w * size;
  const h = box.h * size;
  ctx.fillStyle = colours.doorChip;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = colours.doorGlyph;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  const icon = screen.value === undefined ? undefined : cargoIcons.get(screen.value);
  if (icon !== undefined) {
    const side = Math.min(w, h) * 0.8;
    ctx.drawImage(icon, x + (w - side) / 2, y + (h - side) / 2, side, side);
  } else if (screen.value === 'Other') {
    ctx.fillStyle = colours.doorGlyph;
    const dot = Math.max(1, Math.min(w, h) * 0.14);
    const gap = Math.min(w, h) * 0.26;
    for (const k of [-1, 0, 1]) ctx.fillRect(x + w / 2 + k * gap - dot / 2, y + h / 2 - dot / 2, dot, dot);
  } else if (screen.value === 'None') {
    ctx.lineWidth = Math.max(1, w * 0.08);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.8);
    ctx.lineTo(x + w * 0.8, y + h * 0.2);
    ctx.stroke();
  }
}

/** An empty frame where an unset country screen sits, to click and set it. */
function drawScreenSlot(ctx: Draw2D, camera: Camera, size: number, screen: DiverterScreen): void {
  const box = screenBox(screen.cell, screen.side);
  const { px, py } = worldToScreen(camera, { x: 0, y: 0 });
  ctx.fillStyle = colours.doorChip;
  ctx.fillRect(px + box.x * size, py + box.y * size, box.w * size, box.h * size);
  ctx.strokeStyle = colours.doorGlyph;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + box.x * size, py + box.y * size, box.w * size, box.h * size);
}

/** The outline of the screen under the pointer, in the keyboard cursor's accent. */
function outlineScreen(ctx: Draw2D, camera: Camera, size: number, screen: DiverterScreen): void {
  const box = screenBox(screen.cell, screen.side);
  const { px, py } = worldToScreen(camera, { x: 0, y: 0 });
  ctx.strokeStyle = colours.cursor;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + box.x * size - 1, py + box.y * size - 1, box.w * size + 2, box.h * size + 2);
}

/** Below this on-screen cell size an icon would be a few pixels of noise, so it is skipped. */
const MIN_CELL_SIZE_FOR_ICON = 12;

/** Below this on-screen cell size a ruler number no longer fits its cell, so rulers are hidden. */
const MIN_CELL_SIZE_FOR_RULER_LABELS = 12;

/**
 * Below this cell size two-digit numbers crowd, so only every `RULER_LABEL_STEP`th index is
 * labelled. Chosen so both regimes cover part of the 0.35x-3x zoom range (11.2px-96px cells).
 */
const RULER_THIN_CELL_SIZE = 22;

/** Label step used once cell size drops below RULER_THIN_CELL_SIZE. */
const RULER_LABEL_STEP = 5;

/** Whether to draw the ruler number for `index` at cell `size`: all of them on large cells,
 * otherwise every RULER_LABEL_STEPth, counted from 0. */
function shouldLabelRulerIndex(index: number, size: number): boolean {
  if (size >= RULER_THIN_CELL_SIZE) return true;
  return index % RULER_LABEL_STEP === 0;
}

/**
 * Staircases, drawn on the floor they climb from, with the grid since they are fixtures.
 * Steps are drawn on top so a flight reads as a way up, not a wall.
 */
function drawStairs(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  stairs: DrawOptions['stairs'],
  warehouse: Plan['warehouse'],
  floor: number,
): void {
  for (const flight of stairs) {
    if (flight.warehouse !== warehouse || flight.floor !== floor) continue;
    const { px, py } = worldToScreen(camera, flight.cell);
    const w = flight.w * size;
    const h = flight.h * size;

    ctx.fillStyle = colours.stairs;
    ctx.fillRect(px, py, w, h);

    // Steps across the short side, so a flight reads as climbing along its long one.
    const along = w >= h;
    const count = Math.max(2, Math.round((along ? flight.w : flight.h) * 3));
    ctx.strokeStyle = colours.stairsStep;
    ctx.lineWidth = 1;
    for (let i = 1; i < count; i++) {
      const t = i / count;
      ctx.beginPath();
      if (along) {
        ctx.moveTo(px + w * t, py);
        ctx.lineTo(px + w * t, py + h);
      } else {
        ctx.moveTo(px, py + h * t);
        ctx.lineTo(px + w, py + h * t);
      }
      ctx.stroke();
    }
  }
}

/** Floor-above line width in pixels: twice a grid line. */
const DECK_EDGE_WIDTH = 2;

/**
 * Draws the edge of the floor above, so the mezzanine's overhang shows from underneath.
 * Only edges with floor on both sides: where the deck stops and open air begins.
 * Reads `unlocked`, so a ticked-off expansion draws no edge. Nothing on the top floor.
 */
function drawDeckEdge(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  warehouse: Plan['warehouse'],
  floor: number,
  unlocked: WarehouseGeometry,
): void {
  const above = unlocked[warehouse]?.[floor + 1];
  if (!above || above.length === 0) return;

  ctx.strokeStyle = colours.deckEdge;
  ctx.lineWidth = DECK_EDGE_WIDTH;

  for (const block of above) {
    // An edge is drawn where there is floor beyond it and no deck over that floor. The first test
    // skips the outer walls, the second the seams between owned deck strips.
    const edges = [
      { beyond: { x: block.x, y: block.y - 1 }, run: { w: block.w, h: 0 }, at: { x: block.x, y: block.y } },
      { beyond: { x: block.x, y: block.y + block.h }, run: { w: block.w, h: 0 }, at: { x: block.x, y: block.y + block.h } },
      { beyond: { x: block.x - 1, y: block.y }, run: { w: 0, h: block.h }, at: { x: block.x, y: block.y } },
      { beyond: { x: block.x + block.w, y: block.y }, run: { w: 0, h: block.h }, at: { x: block.x + block.w, y: block.y } },
    ];

    for (const edge of edges) {
      const floorBeyond = isBuildable(warehouse, floor, edge.beyond, unlocked);
      const deckBeyond = isBuildable(warehouse, floor + 1, edge.beyond, unlocked);
      if (!floorBeyond || deckBeyond) continue;
      const from = worldToScreen(camera, edge.at);
      const to = worldToScreen(camera, { x: edge.at.x + edge.run.w, y: edge.at.y + edge.run.h });
      ctx.beginPath();
      ctx.moveTo(from.px, from.py);
      ctx.lineTo(to.px, to.py);
      ctx.stroke();
    }
  }
}

/**
 * Column and row numbers along the grid edges, culled to `range` and clamped to real indices.
 * Pinned to the grid's edges, not the viewport, so they scroll with the grid.
 */
function drawRulers(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  dims: { w: number; h: number },
  range: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  if (size < MIN_CELL_SIZE_FOR_RULER_LABELS) return;

  const top = worldToScreen(camera, { x: 0, y: 0 }).py;
  const bottom = worldToScreen(camera, { x: 0, y: dims.h }).py;
  const left = worldToScreen(camera, { x: 0, y: 0 }).px;
  const right = worldToScreen(camera, { x: dims.w, y: 0 }).px;

  ctx.fillStyle = colours.ruler;
  ctx.font = `${Math.round(Math.max(9, Math.min(14, size * 0.34)))}px sans-serif`;

  const minX = Math.max(0, range.minX);
  const maxX = Math.min(dims.w - 1, range.maxX);
  const minY = Math.max(0, range.minY);
  const maxY = Math.min(dims.h - 1, range.maxY);

  ctx.textAlign = 'center';
  for (let x = minX; x <= maxX; x++) {
    if (!shouldLabelRulerIndex(displayColumn(x), size)) continue;
    const { px } = worldToScreen(camera, { x, y: 0 });
    const cx = px + size / 2;
    const label = String(displayColumn(x));
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, cx, top - 2);
    ctx.textBaseline = 'top';
    ctx.fillText(label, cx, bottom + 2);
  }

  ctx.textBaseline = 'middle';
  for (let y = minY; y <= maxY; y++) {
    // Counted from the bottom-left, like `displayRow`, which every coordinate readout shares.
    if (!shouldLabelRulerIndex(displayRow(y, dims), size)) continue;
    const { py } = worldToScreen(camera, { x: 0, y });
    const cy = py + size / 2;
    const label = String(displayRow(y, dims));
    ctx.textAlign = 'right';
    ctx.fillText(label, left - 4, cy);
    ctx.textAlign = 'left';
    ctx.fillText(label, right + 4, cy);
  }

  // The 0 at the origin corner (bottom left). Cells are numbered from 1, so it reads as the corner.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('0', left - 4, bottom + 2);
}

/**
 * Draws one object's artwork (see `Shape` in src/core/types.ts), rotated about the centre of
 * its rotated footprint so a non-square object stays on its cells: translate to the anchor,
 * then to the centre of the rotated box, rotate, then back by half the unrotated size.
 * A mirrored placement adds `scale(-1, 1)` before that last step, matching `placedPort`'s
 * mirror-then-rotate order so drawing and flow graph agree. `drawIcon` never mirrors.
 * `rect` shapes are in cell units; `path` shapes are in SVG units, scaled by `size / divisor`.
 */
function drawShapeGroup(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  originCell: Cell,
  shapes: readonly Shape[],
  divisor: number,
  rotation: Rotation,
  mirrored: boolean,
  footprint: { w: number; h: number },
  /** Multiplies every shape's opacity: 0.5 for an object on a floor below the viewed one. */
  baseAlpha = 1,
  /** Repaint one colour of the artwork as another: `from` is the colour this
   * family uses for its paintable part, `to` what the player chose. Both or
   * neither. */
  repaint?: { from: string; to: string },
): void {
  const { px, py } = worldToScreen(camera, originCell);
  const { w, h } = footprint;
  const { w: W, h: H } = rotatedFootprint(footprint, rotation);
  ctx.save();
  ctx.translate(px, py);
  ctx.translate((W * size) / 2, (H * size) / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  if (mirrored) ctx.scale(-1, 1);
  ctx.translate((-w * size) / 2, (-h * size) / 2);
  for (const shape of shapes) {
    // Half opacity for the part below the viewed floor (the elevator's shaft), reset after every
    // shape so it never stays set on the context.
    ctx.globalAlpha = baseAlpha * (shape.belowDeck ? 0.5 : 1);
    // Case-insensitive: the artwork uses upper-case hexes, the palette lower case.
    const paint = (colour: string | undefined): string | undefined =>
      repaint && colour && colour.toLowerCase() === repaint.from.toLowerCase()
        ? repaint.to
        : colour;
    /**
     * The ink a stroke is drawn in: the chosen colour where it applies, else white follows the
     * theme (see `artworkLine`). Checked against `paint`, not `repaint`, so a substitution to
     * white (the dark theme's door arrow) is not re-inked.
     */
    const strokeInk = (colour: string): string => {
      const painted = paint(colour);
      if (painted !== undefined && painted !== colour) return painted;
      return WHITE_ARTWORK.test(colour) ? colours.artworkLine : colour;
    };
    if (shape.kind === 'rect') {
      ctx.fillStyle = paint(shape.fill) ?? shape.fill;
      ctx.fillRect(shape.x * size, shape.y * size, shape.w * size, shape.h * size);
      continue;
    }
    ctx.save();
    // An `upright` shape is a label on the machine (see scripts/upright-shapes.mjs): flipping it
    // again about the artwork's centre line undoes the mirror, for both shape and position.
    if (mirrored && shape.upright) {
      ctx.translate(w * size, 0);
      ctx.scale(-1, 1);
    }
    ctx.scale(size / divisor, size / divisor);
    if ('fill' in shape) {
      ctx.fillStyle = paint(shape.fill) ?? shape.fill;
      ctx.fillPath(shape.d);
    } else {
      ctx.strokeStyle = strokeInk(shape.stroke);
      ctx.lineCap = shape.cap ?? 'butt';
      // Set every time from the shape's own value, never inherited: a neighbour's selection
      // outline leaves lineWidth=2, which this scale would blow up.
      ctx.lineWidth = shape.strokeWidth;
      ctx.strokePath(shape.d);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** The icon's edge length as a fraction of one on-screen cell, so it fits inside a single cell. */
const ICON_SCALE = 0.55;

/**
 * Draws an object's icon (see `DrawOptions.icons`) centred on its footprint and rotated about
 * the same pivot as `drawShapeGroup`. Being square and centred, it needs no translate back.
 */
function drawIcon(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  originCell: Cell,
  iconPath: string,
  rotation: Rotation,
  footprint: { w: number; h: number },
): void {
  const { px, py } = worldToScreen(camera, originCell);
  const { w: W, h: H } = rotatedFootprint(footprint, rotation);
  const iconSize = size * ICON_SCALE;
  ctx.save();
  ctx.translate(px, py);
  ctx.translate((W * size) / 2, (H * size) / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(iconPath, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  ctx.restore();
}

/** How see-through a zone's wash and its hatching are. Light enough that the
 * grid stays readable through both. */
const ZONE_WASH = 0.16;
const ZONE_HATCH = 0.5;

/**
 * A reserved zone (see src/core/zone.ts): one hatched rectangle with its name in the middle.
 * The wash under the hatching keeps it visible zoomed out, where the lines are too fine.
 * The name stays upright and is cut with an ellipsis at an estimated 0.6 em per character,
 * since Draw2D cannot measure text. Opacity is reset by hand: the SVG backend does not carry
 * it through save/restore.
 */
function drawZone(
  ctx: Draw2D,
  camera: Camera,
  size: number,
  cell: Cell,
  footprint: { w: number; h: number },
  rotation: Rotation,
  tone: string,
  label: string | undefined,
): void {
  const { w, h } = rotatedFootprint(footprint, rotation);
  const { px, py } = worldToScreen(camera, cell);
  const W = w * size;
  const H = h * size;
  const alpha = ctx.globalAlpha;

  ctx.fillStyle = tone;
  ctx.globalAlpha = alpha * ZONE_WASH;
  ctx.fillRect(px, py, W, H);

  // 45-degree lines, half a cell apart but never closer than 6px, so zooming
  // out does not turn the hatching into a solid fill.
  const gap = Math.max(6, size / 2);
  ctx.save();
  ctx.clipRect(px, py, W, H);
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * ZONE_HATCH;
  ctx.beginPath();
  for (let d = gap; d < W + H; d += gap) {
    ctx.moveTo(px + d, py);
    ctx.lineTo(px + d - H, py + H);
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = alpha;

  ctx.strokeStyle = tone;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.75, py + 0.75, W - 1.5, H - 1.5);

  if (!label || size < MIN_CELL_SIZE_FOR_ICON) return;
  const fontPx = Math.round(Math.max(10, Math.min(15, size * 0.4)));
  if (H < fontPx + 4) return;
  const fits = Math.floor((W - 4) / (fontPx * 0.6));
  if (fits < 2) return;
  const text = label.length > fits ? `${label.slice(0, fits - 1).trimEnd()}…` : label;
  ctx.fillStyle = colours.zoneInk;
  ctx.font = `${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px + W / 2, py + H / 2);
}

export function drawScene(ctx: Draw2D, o: DrawOptions): void {
  colours = o.palette ?? DARK_SCENE;
  const { camera, width, height } = o;
  const size = CELL_PX * camera.zoom;
  const dims = warehouseDimensions(o.plan.warehouse, o.geometry);

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, width, height);

  const range = visibleCellRange(camera, width, height);

  // Grid, one buildable cell at a time, so cells outside every block get no stroke and the
  // silhouette ends cleanly. Each line is stroked once so the 50% alpha never doubles: a cell
  // draws its top and left edges, and its bottom/right only where that neighbour is not
  // buildable. All segments go into one path per frame.
  ctx.strokeStyle = colours.gridLine;
  ctx.lineWidth = 1;
  const gridMinX = Math.max(0, range.minX);
  const gridMaxX = Math.min(dims.w - 1, range.maxX);
  const gridMinY = Math.max(0, range.minY);
  const gridMaxY = Math.min(dims.h - 1, range.maxY);
  ctx.beginPath();
  for (let y = gridMinY; y <= gridMaxY; y++) {
    for (let x = gridMinX; x <= gridMaxX; x++) {
      if (!isBuildable(o.plan.warehouse, o.floor, { x, y }, o.unlocked)) continue;
      const { px, py } = worldToScreen(camera, { x, y });

      // Top edge: always.
      ctx.moveTo(px, py);
      ctx.lineTo(px + size, py);
      // Left edge: always.
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + size);
      // Bottom edge: only if the cell below is not buildable (otherwise
      // that neighbour will draw this exact line as its own top edge).
      if (!isBuildable(o.plan.warehouse, o.floor, { x, y: y + 1 }, o.unlocked)) {
        ctx.moveTo(px, py + size);
        ctx.lineTo(px + size, py + size);
      }
      // Right edge: only if the cell to the right is not buildable
      // (otherwise that neighbour will draw this exact line as its own
      // left edge).
      if (!isBuildable(o.plan.warehouse, o.floor, { x: x + 1, y }, o.unlocked)) {
        ctx.moveTo(px + size, py);
        ctx.lineTo(px + size, py + size);
      }
    }
  }
  ctx.stroke();

  // Doors are fixtures, drawn right after the grid and before any placement.
  drawStairs(ctx, camera, size, o.stairs, o.plan.warehouse, o.floor);
  drawDeckEdge(ctx, camera, size, o.plan.warehouse, o.floor, o.unlocked);

  drawDoors(
    ctx, camera, size, o.doors, o.plan.warehouse, o.floor, o.cargoIcons, o.countryIcon,
    o.doorArrow, o.doorArrowDivisor, o.plan.doorCountries, o.countryFlags, o.hoveredDoorId, o.doorChips ?? false,
  );

  // Rulers are chrome, drawn early; the drag/drop highlight stays last.
  drawRulers(ctx, camera, size, dims, range);

  // Only this warehouse's placements, and only those on screen: a dense layout would otherwise
  // cost thousands of draw operations per frame while zoomed in. Culled by whole footprint, not
  // anchor, so long objects do not vanish at the edge; `range` already has a one-cell margin.
  const onScreen = (p: Placement, entry: CatalogEntry): boolean => {
    const { w, h } = rotatedFootprint(entry.footprint, p.rotation);
    return p.cell.x <= range.maxX && p.cell.x + w - 1 >= range.minX
      && p.cell.y <= range.maxY && p.cell.y + h - 1 >= range.minY;
  };

  const inThisWarehouse = o.plan.placements.filter((p) => {
    if (p.warehouse !== o.plan.warehouse) return false;
    const entry = o.catalogue.get(p.objectId);
    // An object the catalogue does not know has no footprint to judge, and is
    // skipped by the draw loop below anyway.
    return entry !== undefined && onScreen(p, entry);
  });

  // A bridge passes over the cells it covers (see CatalogEntry.bridgedCells), so ground-level objects
  // are painted first. Whole objects are reordered so a bridge stays one rotated group.
  const spans = (p: Placement): boolean =>
    (o.catalogue.get(p.objectId)?.bridgedCells?.length ?? 0) > 0;
  const inDrawOrder = [...inThisWarehouse].sort(
    (a, b) => Number(spans(a)) - Number(spans(b)),
  );

  /**
   * True when `placement` is present on the viewed floor: on it, or reaching up into it. Only the
   * vertical elevator reaches (`spansTheFloorAbove`); upstairs its head is solid and selectable.
   */
  const presentHere = (placement: Placement, entry: CatalogEntry): boolean =>
    placement.floor === o.floor
    || (entry.spansTheFloorAbove === true && o.floor === placement.floor + 1);

  // Selection outline around the whole on-screen footprint, not just the anchor cell.
  const outlineIfSelected = (placement: Placement, entry: CatalogEntry, isCurrent: boolean): void => {
    if (!isCurrent || !o.selectedIds.includes(placement.id)) return;
    const { px, py } = worldToScreen(camera, placement.cell);
    const { w: W, h: H } = rotatedFootprint(entry.footprint, placement.rotation);
    ctx.strokeStyle = colours.selected;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, W * size - 2, H * size - 2);
  };

  // The other floor drawn faded in the background, then the current floor.
  for (const pass of ['other', 'current'] as const) {
    for (const placement of inDrawOrder) {
      const entry = o.catalogue.get(placement.objectId);
      if (!entry) continue;

      const isCurrent = presentHere(placement, entry);
      if (pass === 'other' && isCurrent) continue;
      if (pass === 'current' && !isCurrent) continue;

      // A floor above the viewed one is not drawn: you cannot see through a deck. A floor below is
      // seen over the deck's edge, hence the per-cell skip further down.
      if (!isCurrent && placement.floor > o.floor) continue;

      // Real artwork on every floor, faded below. `o.floor - placement.floor` picks the elevator's
      // head or foot; see the `shapes` doc.
      const shapes = o.shapes(placement.objectId, o.floor - placement.floor);
      // A chosen colour only applies if the family has a paintable part.
      const from = placement.colour ? o.repaintableColourOf(entry) : null;
      const repaint = from && placement.colour
        ? { from, to: placement.colour }
        : undefined;
      const fromBelow = !isCurrent && placement.floor < o.floor;

      // A zone has no artwork (see drawZone); from above it is the same faint wash per uncovered
      // cell as an object without artwork.
      if (entry.category === 'zone') {
        const tone = placement.colour ?? colours.zone;
        if (isCurrent) {
          drawZone(ctx, camera, size, placement.cell, entry.footprint, placement.rotation, tone, placement.label);
        } else {
          const alpha = ctx.globalAlpha;
          ctx.fillStyle = tone;
          ctx.globalAlpha = alpha * ZONE_WASH;
          for (const cell of coveredCells(placement, entry)) {
            if (fromBelow && isBuildable(o.plan.warehouse, o.floor, cell, o.geometry)) continue;
            const { px, py } = worldToScreen(camera, cell);
            ctx.fillRect(px, py, size, size);
          }
          ctx.globalAlpha = alpha;
        }
        outlineIfSelected(placement, entry, isCurrent);
        continue;
      }

      if (shapes && shapes.length > 0) {
        if (isCurrent) {
          drawShapeGroup(ctx, camera, size, placement.cell, shapes, o.shapeDivisor, placement.rotation, placement.mirrored ?? false, entry.footprint, 1, repaint);
        } else {
          // A lower floor shows only where no deck covers it, so each cell is clipped separately: the
          // uncovered area is not a rectangle, and an object can straddle the deck's edge.
          for (const cell of coveredCells(placement, entry)) {
            if (fromBelow && isBuildable(o.plan.warehouse, o.floor, cell, o.geometry)) continue;
            const { px, py } = worldToScreen(camera, cell);
            ctx.save();
            ctx.clipRect(px, py, size, size);
            drawShapeGroup(ctx, camera, size, placement.cell, shapes, o.shapeDivisor, placement.rotation, placement.mirrored ?? false, entry.footprint, 0.5, repaint);
            ctx.restore();
          }
        }
      } else {
        // No artwork for this object: the plain rectangle, on the same visibility rule.
        ctx.fillStyle = isCurrent ? colours.object : colours.objectFaded;
        for (const cell of coveredCells(placement, entry)) {
          if (fromBelow && isBuildable(o.plan.warehouse, o.floor, cell, o.geometry)) continue;
          const { px, py } = worldToScreen(camera, cell);
          ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
        }
      }

      // The object's icon, on top of the artwork, skipped below the minimum size.
      if (isCurrent && size >= MIN_CELL_SIZE_FOR_ICON) {
        const iconPath = o.icons.get(placement.objectId);
        if (iconPath) {
          drawIcon(ctx, camera, size, placement.cell, iconPath, placement.rotation, entry.footprint);
        }
        // A diverter's screens above its icon: flags on a country diverter, cargo types on a
        // cargo diverter. Unset ones show an empty frame to click only where the editor asks.
        const slots = o.screenSlots === true
          && (o.selectedIds.includes(placement.id) || o.hoveredScreen?.placementId === placement.id);
        for (const screen of diverterScreens(placement, entry)) {
          if (placement.objectId === COUNTRY_DIVERTER) {
            const flag = screen.value === undefined ? undefined : o.countryFlags?.get(screen.value);
            if (flag !== undefined) drawScreenFlag(ctx, camera, size, screen.cell, screen.side, flag);
            else if (slots) drawScreenSlot(ctx, camera, size, screen);
          } else if (placement.objectId === CARGO_DIVERTER && (screen.value !== undefined || slots)) {
            drawCargoScreen(ctx, camera, size, screen, o.cargoIcons);
          }
          const hovered = o.hoveredScreen;
          if (hovered?.placementId === placement.id && hovered.cell === screen.at.cell && hovered.way === screen.at.way) {
            outlineScreen(ctx, camera, size, screen);
          }
        }
      }

      outlineIfSelected(placement, entry, isCurrent);
    }
  }

  // Exits that lead nowhere, over the objects so they cannot hide under artwork.
  for (const end of o.deadEnds ?? []) {
    if (end.floor === o.floor) drawDeadEnd(ctx, camera, size, end.cell, end.side);
  }

  // Drag/drop highlight, always drawn last so it sits on top.
  if (o.highlight) {
    const previews = o.highlight.preview ?? [];
    // The pending object's artwork first, so the valid/invalid tint ends up on top.
    for (const pending of previews) {
      const previewEntry = o.catalogue.get(pending.objectId);
      if (!previewEntry) continue;
      // A zone being moved or pasted shows its outline where an object shows its artwork.
      if (previewEntry.category === 'zone') {
        drawZone(ctx, camera, size, pending.cell, previewEntry.footprint, pending.rotation, pending.colour ?? colours.zone, undefined);
        continue;
      }
      const previewShapes = o.shapes(pending.objectId, 0);
      if (previewShapes && previewShapes.length > 0) {
        // Repainted exactly as a placed object is, through the same table: a
        // colour only means anything where the family has a paintable part.
        const from = pending.colour ? o.repaintableColourOf(previewEntry) : null;
        const repaint = from && pending.colour ? { from, to: pending.colour } : undefined;
        drawShapeGroup(ctx, camera, size, pending.cell, previewShapes, o.shapeDivisor, pending.rotation, pending.mirrored ?? false, previewEntry.footprint, 1, repaint);
      }
      if (size >= MIN_CELL_SIZE_FOR_ICON) {
        const previewIconPath = o.icons.get(pending.objectId);
        if (previewIconPath) {
          drawIcon(ctx, camera, size, pending.cell, previewIconPath, pending.rotation, previewEntry.footprint);
        }
      }
    }

    ctx.fillStyle = o.highlight.valid ? colours.highlightValid : colours.highlightInvalid;
    for (const cell of o.highlight.cells) {
      const { px, py } = worldToScreen(camera, cell);
      ctx.fillRect(px, py, size, size);
    }
  }

  // Notes, above the layout and below the parcels. A small corner mark, so a note never hides
  // the conveyor it annotates; the text opens in a box.
  if (o.notes && o.notes.length > 0) {
    const mark = Math.max(4, size * 0.22);
    for (const note of o.notes) {
      if (note.warehouse !== o.plan.warehouse || note.floor !== o.floor) continue;
      const { px, py } = worldToScreen(camera, note.cell);
      // A folded corner in the top-right, drawn as a triangle so it reads as a
      // bookmark rather than as another object sitting in the cell.
      ctx.fillStyle = colours.note;
      ctx.fillPath(
        `M ${px + size - mark} ${py} L ${px + size} ${py} L ${px + size} ${py + mark} Z`,
      );
    }
  }

  // How full each rack is, while the preview runs: a small tab in the rack's bottom-right
  // corner, held / capacity.
  if (o.rackFill && o.rackFill.length > 0 && size >= MIN_CELL_SIZE_FOR_ICON) {
    const fontPx = Math.round(Math.max(8, Math.min(12, size * 0.28)));
    ctx.font = `${fontPx}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (const rack of o.rackFill) {
      const corner = worldToScreen(camera, rack.to);
      const right = corner.px + size - 1;
      const bottom = corner.py + size - 1;
      const w = fontPx * 0.6 * rack.text.length + 4;
      const h = fontPx + 2;
      ctx.fillStyle = colours.rackFillBg;
      ctx.fillRect(right - w, bottom - h, w, h);
      ctx.fillStyle = colours.rackFillInk;
      ctx.fillText(rack.text, right - 2, bottom);
    }
  }

  // The parcel and its trail: above the layout, below the marquee. Trail first.
  if (o.parcels && o.parcels.length > 0) {
    const inset = size * 0.3;
    const mark = size - inset * 2;
    ctx.fillStyle = colours.parcelTrail;
    for (const cell of o.trail ?? []) {
      const { px, py } = worldToScreen(camera, cell);
      ctx.fillRect(px + inset, py + inset, mark, mark);
    }
    // Inset so the conveyor under the parcel stays readable. `at` is fractional, so it glides.
    // The drawing keeps its own aspect ratio rather than being fitted to the square.
    const artW = mark * PARCEL_ART_ASPECT;
    for (const parcel of o.parcels) {
      const here = worldToScreen(camera, parcel.at);
      const x = here.px + inset + (mark - artW) / 2;
      const y = here.py + inset;

      // A stopped parcel is ringed rather than recoloured, leaving the artwork untouched.
      if (parcel.dropped) {
        ctx.strokeStyle = colours.parcelDropped;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, artW + 4, mark + 4);
      }

      if (o.parcelIcon) ctx.drawImage(o.parcelIcon, x, y, artW, mark);
    }
  }

  // Box selection, over everything including the drag/drop highlight, snapped to whole cells
  // because that is what it selects.
  if (o.marquee) {
    const { from, to } = o.marquee;
    const origin = worldToScreen(camera, {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
    });
    const w = (Math.abs(to.x - from.x) + 1) * size;
    const h = (Math.abs(to.y - from.y) + 1) * size;
    ctx.fillStyle = colours.marqueeFill;
    ctx.fillRect(origin.px, origin.py, w, h);
    ctx.strokeStyle = colours.selected;
    ctx.lineWidth = 1;
    ctx.strokeRect(origin.px + 0.5, origin.py + 0.5, w - 1, h - 1);

    // The box size, so a run can be measured without counting. Both ends count, hence the +1s on
    // `from`/`to` rather than the pixel width.
    const cellsWide = Math.abs(to.x - from.x) + 1;
    const cellsTall = Math.abs(to.y - from.y) + 1;
    ctx.fillStyle = colours.selected;
    ctx.font = `${Math.round(Math.max(10, Math.min(15, size * 0.4)))}px sans-serif`;
    ctx.textAlign = 'left';
    // Just outside the box's top-left, so it never sits over the cells being
    // chosen and never moves as the far corner is dragged around.
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${cellsWide} × ${cellsTall}`, origin.px + 2, origin.py - 3);
  }

  // Last of all, so nothing it is pointing at can hide it. A halo in the
  // background colour under the accent keeps it legible over any object.
  if (o.cursor) {
    const { px, py } = worldToScreen(camera, o.cursor);
    const arm = Math.max(4, size * 0.3);
    const l = px - 1;
    const t = py - 1;
    const r = px + size + 1;
    const b = py + size + 1;
    const brackets = () => {
      ctx.beginPath();
      ctx.moveTo(l, t + arm); ctx.lineTo(l, t); ctx.lineTo(l + arm, t);
      ctx.moveTo(r - arm, t); ctx.lineTo(r, t); ctx.lineTo(r, t + arm);
      ctx.moveTo(r, b - arm); ctx.lineTo(r, b); ctx.lineTo(r - arm, b);
      ctx.moveTo(l + arm, b); ctx.lineTo(l, b); ctx.lineTo(l, b - arm);
      ctx.stroke();
    };
    ctx.lineCap = 'butt';
    ctx.strokeStyle = colours.background;
    ctx.lineWidth = 5;
    brackets();
    ctx.strokeStyle = colours.cursor;
    ctx.lineWidth = 2.5;
    brackets();
  }
}

/** The legend's measurements, in pixels. Exported so the image around it can
 * be laid out to fit (see src/render/export-image.ts). */
export const LEGEND_PAD = 20;
/** A one-line row; each further line of a long name adds LEGEND_LINE. */
export const LEGEND_ROW = 30;
export const LEGEND_LINE = 17;
export const LEGEND_HEADING = 34;
const LEGEND_GLYPH = 22;
const LEGEND_FONT = 14;
/** Past this a name is cut. Only a typed zone name gets there; the longest French object
 * name takes two. */
const LEGEND_MAX_LINES = 3;

export interface LegendOptions {
  palette?: ScenePalette;
  catalogue: Map<string, CatalogEntry>;
  /** The same artwork lookup the scene uses (see `DrawOptions.shapes`). */
  shapes: (id: string, floorOffset: number) => readonly Shape[] | undefined;
  shapeDivisor: number;
  icons: ReadonlyMap<string, string>;
  cargoIcons: ReadonlyMap<string, string>;
  countryIcon?: string;
  /** What each row says, already translated: this module has no i18n. */
  text: (entry: LegendEntry) => string;
  headings: { objects: string; zones: string; doors: string };
}

type LegendSection = 'objects' | 'zones' | 'doors';
const sectionOf = (entry: LegendEntry): LegendSection =>
  entry.kind === 'object' ? 'objects' : entry.kind === 'zone' ? 'zones' : 'doors';

type LegendLine =
  | { heading: LegendSection; height: number }
  | { entry: LegendEntry; name: string[]; height: number };

/** The legend's rows in order, headed by section, with names already broken into lines.
 * Both `legendHeight` and `drawLegend` walk it, so they cannot disagree. */
function legendLines(
  entries: readonly LegendEntry[],
  width: number,
  text: (entry: LegendEntry) => string,
): LegendLine[] {
  // Characters a line, on the same 0.6 em estimate a zone's name uses, since
  // Draw2D cannot measure text. 44 is kept clear for the count.
  const fits = Math.floor((width - LEGEND_PAD * 2 - LEGEND_GLYPH - 12 - 44) / (LEGEND_FONT * 0.6));
  const lines: LegendLine[] = [];
  for (const section of ['objects', 'zones', 'doors'] as const) {
    const rows = entries.filter((e) => sectionOf(e) === section);
    if (rows.length === 0) continue;
    lines.push({ heading: section, height: LEGEND_HEADING });
    for (const entry of rows) {
      const name = wrapName(text(entry), fits);
      lines.push({ entry, name, height: LEGEND_ROW + (name.length - 1) * LEGEND_LINE });
    }
  }
  return lines;
}

/**
 * `name` broken at spaces into lines of at most `fits` characters, a too-long word cut, and at
 * most LEGEND_MAX_LINES lines, the last ending in an ellipsis if needed. Wrapped rather than
 * shortened because names often differ only at the end ("Scanner Conveyor (Weight)", "(Country)").
 */
function wrapName(name: string, fits: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of name.split(/\s+/).filter(Boolean)) {
    let piece = word;
    while (piece !== '') {
      const joined = line === '' ? piece : `${line} ${piece}`;
      if (joined.length <= fits) {
        line = joined;
        piece = '';
      } else if (line !== '') {
        lines.push(line);
        line = '';
      } else {
        lines.push(piece.slice(0, fits));
        piece = piece.slice(fits);
      }
    }
  }
  if (line !== '' || lines.length === 0) lines.push(line);
  if (lines.length <= LEGEND_MAX_LINES) return lines;

  const kept = lines.slice(0, LEGEND_MAX_LINES);
  const last = kept[LEGEND_MAX_LINES - 1]!;
  kept[LEGEND_MAX_LINES - 1] = `${(last.length < fits ? last : last.slice(0, fits - 1)).trimEnd()}…`;
  return kept;
}

/** How tall `drawLegend` will draw `entries` in a legend `width` wide,
 * padding included. */
export function legendHeight(
  entries: readonly LegendEntry[],
  width: number,
  text: (entry: LegendEntry) => string,
): number {
  return LEGEND_PAD * 2 + legendLines(entries, width, text).reduce((sum, line) => sum + line.height, 0);
}

/**
 * The legend beside an exported image. Glyphs use the scene's own helpers so swatches match the
 * picture; objects are fitted whole into one square, so they read as a column of symbols.
 * A long name wraps, its symbol and count staying level with its middle.
 */
export function drawLegend(
  ctx: Draw2D,
  entries: readonly LegendEntry[],
  box: { x: number; y: number; width: number },
  o: LegendOptions,
): void {
  colours = o.palette ?? DARK_SCENE;
  const gx = box.x + LEGEND_PAD;
  const textX = gx + LEGEND_GLYPH + 12;
  const countX = box.x + box.width - LEGEND_PAD;
  let y = box.y + LEGEND_PAD;

  for (const line of legendLines(entries, box.width, o.text)) {
    if ('heading' in line) {
      ctx.fillStyle = colours.ruler;
      ctx.font = `bold ${LEGEND_FONT - 1}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.headings[line.heading], gx, y + LEGEND_HEADING - 10);
      y += line.height;
      continue;
    }

    const { entry, name, height } = line;
    const middle = y + height / 2;
    drawLegendGlyph(ctx, entry, gx, middle - LEGEND_GLYPH / 2, o);

    ctx.fillStyle = colours.legendInk;
    ctx.font = `${LEGEND_FONT}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    name.forEach((text, i) => {
      ctx.fillText(text, textX, middle + (i - (name.length - 1) / 2) * LEGEND_LINE);
    });

    if (entry.kind === 'object' || entry.kind === 'zone') {
      ctx.fillStyle = colours.ruler;
      ctx.textAlign = 'right';
      ctx.fillText(`×${entry.count}`, countX, middle);
    }
    y += height;
  }
}

/** One row's symbol, in a LEGEND_GLYPH square at (`x`, `y`). */
function drawLegendGlyph(ctx: Draw2D, entry: LegendEntry, x: number, y: number, o: LegendOptions): void {
  const square = LEGEND_GLYPH;
  switch (entry.kind) {
    case 'object': {
      const catalogued = o.catalogue.get(entry.objectId);
      if (!catalogued) return;
      const { w, h } = catalogued.footprint;
      const cell = square / Math.max(w, h);
      const camera = { x: 0, y: 0, zoom: cell / CELL_PX };
      ctx.save();
      ctx.translate(x + (square - w * cell) / 2, y + (square - h * cell) / 2);
      const shapes = o.shapes(entry.objectId, 0);
      if (shapes && shapes.length > 0) {
        drawShapeGroup(ctx, camera, cell, { x: 0, y: 0 }, shapes, o.shapeDivisor, 0, false, catalogued.footprint);
      } else {
        ctx.fillStyle = colours.object;
        ctx.fillRect(1, 1, w * cell - 2, h * cell - 2);
      }
      const icon = o.icons.get(entry.objectId);
      if (icon) drawIcon(ctx, camera, cell, { x: 0, y: 0 }, icon, 0, catalogued.footprint);
      ctx.restore();
      return;
    }
    case 'zone':
      drawZone(
        ctx, { x: -x / square, y: -y / square, zoom: square / CELL_PX }, square,
        { x: 0, y: 0 }, { w: 1, h: 1 }, 0, entry.colour ?? colours.zone, undefined,
      );
      return;
    case 'door': {
      ctx.fillStyle = entry.look === 'delivery' ? colours.doorDelivery
        : entry.look === 'reject' ? colours.doorReject
        : colours.doorExport;
      ctx.fillRect(x, y, square, square);
      if (entry.look === 'reject') drawRejectCross(ctx, x + square / 2, y + square / 2, square * 0.6);
      return;
    }
    case 'cargo':
    case 'country': {
      const path = entry.kind === 'country' ? o.countryIcon : o.cargoIcons.get(entry.type);
      ctx.fillStyle = colours.doorExport;
      ctx.fillRect(x, y, square, square);
      if (path) ctx.drawImage(path, x + 3, y + 3, square - 6, square - 6);
    }
  }
}
