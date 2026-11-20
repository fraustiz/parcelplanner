'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FastForward, Pause, Play, Square } from 'lucide-react';
import { cellsBetween, centredAnchor, coveredCells, displayColumn, displayRow, emitDirection, joinerOrientation, orientationFor, portFacings, rotatedAboutCentre, SIDE_STEP, splitterOrientation, warehouseDimensions, type Orientation, type Step } from '@/core/grid';
import { flippedShape, pastedAt, turnedShape } from '@/core/clipboard';
import { clampedCell, floorBounds, pickedSelection, placementAt, steppedCursor } from '@/core/cursor';
import { buildGraph, doorNodeId } from '@/core/graph';
import { canPlace, shiftedSelection, type PlacementRejection } from '@/core/occupancy';
import { advanceOneCell, isOnTheFloor, stillOnTheBelt } from '@/core/queueing';
import { entryPoints, mostlyStraight, parcelPath, routeSteps, storePullers, type RouteStep } from '@/core/simulate';
import { flippedAbout, settledSelection, turnedGroup, type FlipAxis } from '@/core/transform';
import type { CatalogEntry, Cell, Placement, Rotation } from '@/core/types';
import { getCatalogue } from '@/data/catalogue';
import { CORNER_FOR, FOLLOWS_THE_RUN, JOINS_FROM, JOINS_INTO, SPLITS_INTO } from '@/data/corners';
import { DOORS } from '@/data/doors';
import { storageCapacityOf } from '@/data/storage';
import { STAIRS } from '@/data/stairs';
import { repaintableColourOf } from '@/data/colours';
import { CARGO_TYPE_ICONS, COUNTRY_DOOR_ICON, KEEP_OWN_COLOURS, OBJECT_ICONS, PARCEL_ICON } from '@/data/icons';
import { shapesFor, SHAPE_DIVISOR } from '@/data/shapes';
import { DOOR_ARROW, UI_SHAPE_DIVISOR } from '@/data/ui-shapes';
import { ownedGeometry, ownedTiersOf } from '@/data/warehouse-tiers';
import { WAREHOUSES } from '@/data/warehouses';
import { t, type TranslationKey } from '@/i18n';
import { cameraShowing, cameraZoomedAt, CELL_PX, screenToCell, worldToScreen, type Camera } from '@/render/camera';
import { createFrameScheduler } from '@/render/frame-scheduler';
import { blackenIcon, toDraw2D } from '@/render/canvas-draw';
import { cameraAfterTouch, MAX_ZOOM, MIN_ZOOM, type TouchPoint } from '@/render/touch-gestures';
import { drawScene, DARK_SCENE, LIGHT_SCENE, type HighlightState } from '@/render/renderer';
import { draggedPlacement, useEditor, type MarqueeState } from '@/store/editor';
import ContextMenu, { type MenuAnchor } from './ContextMenu';
import HoverCard from './HoverCard';

/** A point in client (viewport) pixel coordinates, as carried by both React
 * mouse and drag events. */
interface ClientPoint { clientX: number; clientY: number }

/**
 * One parcel on the belt, right now. `index` is a cell, not a distance: the
 * simulation steps whole cells so a cell holds one parcel. `from` is where it
 * stepped off, so the drawing can slide between the two.
 */
interface LiveParcel {
  cells: RouteStep[];
  ending: 'delivered' | 'stored' | 'dropped' | 'looped' | 'exhausted';
  index: number;
  from: number;
  /** Steps spent without moving. */
  heldFor: number;
  /** For a looping route: the cell it rejoins after the last one. */
  wrapTo?: number;
  /** The placement its route ends at, so a stop can name the object. */
  endsAt?: string;
  /** Why the route ends there: nothing built yet, or an object facing the
   * wrong way. They look identical on the grid. */
  because?: 'nothing-there' | 'refused';
  /** When refused: the placement doing the refusing, so the report can name it. */
  blockedBy?: string;
}

/** What has become of the parcels since play was pressed: counted as they
 * actually arrive or fall, not predicted from the routes. */
interface SimTally { delivered: number; fell: number }

const NO_TALLY: SimTally = { delivered: 0, fell: 0 };

/** Everything the preview keeps between steps: the parcels on the belts, what
 * has become of the others, and how many each rack holds, by placement id. */
interface SimState { parcels: LiveParcel[]; tally: SimTally; racks: Record<string, number> }

const NO_SIM: SimState = { parcels: [], tally: NO_TALLY, racks: {} };

/** A route a parcel can be sent along, as built for one step. */
interface Walk {
  cells: RouteStep[]; ending: LiveParcel['ending']; wrapTo?: number; endsAt?: string;
  because?: LiveParcel['because']; blockedBy?: string;
}

/** How fast a parcel crosses a cell on screen. A viewing speed, set by what the
 * eye can follow: the game data has no belt speed. */
const CELLS_PER_SECOND = 1;

/**
 * One parcel per cell, released one per cell-step at every delivery door. Not
 * the game's cadence (a truck every 40 seconds): a solid stream makes a route
 * readable. A door cannot release onto an occupied cell, so no timer is needed.
 */

/** The sticker checker: the one branching object whose side outputs are
 * reject lines rather than a sorting of the flow. */
const STICKER_CHECKER = 'BP_ConveyorBelt_Scanner2_Tier1';

/** How often a parcel is refused at a checker. A viewing choice, not a
 * measurement: the game data has no failure rate. */
const REFUSED_AT_A_CHECKER = 0.1;

/**
 * How many steps a parcel may sit without moving before it falls off the belt
 * and frees its cell. Above a normal queue at a merge, but finite, or a looping
 * layout would fill solid and freeze.
 */
const STUCK_HOLD_STEPS = 12;

/**
 * Whether the live parcel preview is offered: only when
 * NEXT_PUBLIC_LIVE_PREVIEW is `on`, in every environment. Tests set it on (see
 * vitest.config.ts), so the code behind it stays tested.
 */
const LIVE_PREVIEW = process.env.NEXT_PUBLIC_LIVE_PREVIEW === 'on';

/**
 * How many steps a parcel stays at the end of a line that leads nowhere
 * before it falls: long enough to see it ringed in red, short enough that
 * the line behind it keeps moving, as it does in the game, rather than
 * queueing until the whole line falls at once.
 */
const DEAD_END_SHOW_STEPS = 2;

/** A ceiling on parcels alive at once, so a pathological layout cannot grow
 * the list without bound. Far above what a warehouse ever holds. */
const MAX_PARCELS = 4000;

/**
 * A selection being dragged, before it lands. `shape` is the selected
 * placements with turns and flips applied, still at their pick-up position;
 * `step` is added when drawn and when landed.
 *
 * It holds the result, not a turn count and mirror flag: composing those is
 * error-prone at 90 and 270, while applying `turnedGroup`/`flippedOnce` per
 * keystroke composes in key order.
 */
interface PendingMove {
  /** The cell the press landed on, which `step` is measured from. */
  from: Cell;
  step: { dx: number; dy: number };
  shape: Placement[];
  /** True once R or X has been pressed. A press that neither travelled nor
   * turned is a click and falls through to selection. */
  turned: boolean;
}

/** Arrow keys as steps on the grid, where +y is down the screen. */
const ARROWS: Readonly<Record<string, Step>> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

/** Whether a pending move would actually change anything. */
const aiming = (move: PendingMove): boolean =>
  move.turned || move.step.dx !== 0 || move.step.dy !== 0;

/**
 * The placements a pending move would land on: its shape, offset by how far
 * the pointer has travelled. The silhouette, its tint and the commit all use
 * this one list, so they cannot disagree.
 */
const ghostsOf = (move: PendingMove): Placement[] =>
  shiftedSelection(move.shape, move.step);

/** Whether `cell` lies inside `box`, which may have been drawn from any
 * corner. */
const inBox = (cell: Cell, box: MarqueeState): boolean =>
  cell.x >= Math.min(box.from.x, box.to.x) && cell.x <= Math.max(box.from.x, box.to.x)
  && cell.y >= Math.min(box.from.y, box.to.y) && cell.y <= Math.max(box.from.y, box.to.y);

/**
 * Loads, blackens (see `blackenIcon`) and caches one canvas per icon path in
 * a ref, so a redraw never re-requests an image in flight. `onLoad` fires once
 * per icon to trigger one more redraw; until then `get` returns undefined and
 * nothing is drawn.
 */
function useImageCache(onLoad: () => void): (path: string) => CanvasImageSource | undefined {
  const cacheRef = useRef<Map<string, CanvasImageSource>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  return (path: string): CanvasImageSource | undefined => {
    const cached = cacheRef.current.get(path);
    if (cached) return cached;
    if (pendingRef.current.has(path)) return undefined; // already loading; don't re-fetch
    pendingRef.current.add(path);
    const img = new Image();
    img.onload = () => {
      // Pictures with their own colours (e.g. the parcel) are stored as loaded.
      cacheRef.current.set(path, KEEP_OWN_COLOURS.has(path) ? img : blackenIcon(img));
      pendingRef.current.delete(path);
      onLoad();
    };
    img.src = path;
    return undefined; // just started loading; this frame draws nothing
  };
}

/**
 * True when `target` accepts typing (text input, textarea, contenteditable),
 * where single-key shortcuts must not fire.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export default function GridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The canvas and its overlays (hover card, refusal notice, menu). The
  // browser-menu suppression listens here, since the pointer is often over one.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: -1, y: -1, zoom: 1 });
  // An in-progress pan. A ref, so pointer moves re-render only via `camera`.
  const panRef = useRef<(ClientPoint & { panned: boolean }) | null>(null);
  // Set when a box selection commits on mouseup, so the browser's following
  // `click` is a no-op. A ref: written and read within one event loop turn.
  const swallowNextClickRef = useRef(false);
  // An in-progress run of conveyors: its start, the last cell reached, the
  // direction it arrived by (null until it moves a cell), and the commands
  // dispatched so far, which `collapseUndo` folds into one entry.
  const paintRef = useRef<{
    last: Cell;
    dir: Step | null;
    placed: number;
  } | null>(null);
  // An in-progress left-button move of the selection. Nothing is dispatched
  // until release; a silhouette follows the pointer, so Escape or right-click
  // can cancel with nothing to undo.
  // The release reads this ref, never a stale closure; the state below only
  // redraws the silhouette. Both are written in `aimMove` alone.
  const moveRef = useRef<PendingMove | null>(null);
  // The right button: travel pans, wherever the press landed; no travel opens
  // the context menu, or cancels on empty ground.
  // Where the pointer last was, in cells. Ctrl+V pastes there.
  const pointerCellRef = useRef<Cell>({ x: 0, y: 0 });

  /**
   * The cell a pending paste is hovering over, or null. State, so the
   * silhouette redraws; local, since it only exists while this canvas is mounted.
   */
  const [pasteCell, setPasteCell] = useState<Cell | null>(null);
  /** The cell whose note is being written, if any. The box opens over that cell. */
  const [noteAt, setNoteAt] = useState<Cell | null>(null);
  const [noteText, setNoteText] = useState('');
  /**
   * The pending move, mirrored out of `moveRef` so the silhouette redraws.
   * Never read to decide what to commit (see `moveRef` above).
   */
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  /**
   * Every parcel in flight. A viewing aid: it never touches the plan (no
   * dispatch, no undo entry).
   */
  const [sim, setSim] = useState<SimState>(NO_SIM);
  const parcels = sim.parcels;
  const floor = useEditor((s) => s.floor);
  /** How far through the current cell-step the drawing is, 0 to 1. Only the
   * drawing is continuous; the simulation moves in whole cells. */
  const [phase, setPhase] = useState(0);

  /**
   * Where each parcel is right now, between cells. Three fates look different:
   *   - still travelling: an ordinary parcel;
   *   - arrived at an export door or a rack: gone;
   *   - nowhere left to go: stopped on the last belt, ringed in red.
   */
  const parcelsNow = useMemo(() => parcels.filter((p) => p.cells[p.index]!.floor === floor).map((p) => {
    const to = p.cells[p.index]!;
    // Slides from the cell it left, unless that was on another floor: a parcel
    // coming off an elevator appears at the top rather than sliding in from
    // under the floor.
    const left = p.cells[p.from];
    const from = left !== undefined && left.floor === to.floor ? left : to;
    const into = p.from === p.index ? 0 : phase;
    return {
      at: { x: from.x + (to.x - from.x) * into, y: from.y + (to.y - from.y) * into },
      // Only a route that really stops marks a parcel as on the floor, not a
      // delivered, stored or looping one.
      dropped: isOnTheFloor({
        index: p.index,
        lastIndex: p.cells.length - 1,
        arrived: p.ending !== 'dropped' && p.ending !== 'exhausted',
      }),
    };
  }), [parcels, phase, floor]);

  /** Where the oldest parcel still on the belt has been. Every trail would
   * paint the whole layout. */
  const trailNow = useMemo(() => {
    const oldest = parcels[0];
    return oldest ? oldest.cells.slice(0, oldest.index + 1).filter((c) => c.floor === floor) : [];
  }, [parcels, floor]);

  /** Whether the parcel is advancing. Paused leaves it exactly where it is,
   * so a junction can be read before letting it go on. */
  const [playing, setPlaying] = useState(false);
  /** 1, 2 or 4, cycled by a button rather than a slider. */
  const [speed, setSpeed] = useState(1);
  const clipboard = useEditor((s) => s.clipboard);
  const setClipboard = useEditor((s) => s.setClipboard);
  const rightRef = useRef<{
    onObject: boolean;
    pan: ClientPoint;
    panned: boolean;
  } | null>(null);

  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const drag = useEditor((s) => s.drag);
  const marquee = useEditor((s) => s.marquee);
  const selectedIds = useEditor((s) => s.selectedIds);
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const toggleSelected = useEditor((s) => s.toggleSelected);
  const moveDrag = useEditor((s) => s.moveDrag);
  const rotateDrag = useEditor((s) => s.rotateDrag);
  const mirrorDrag = useEditor((s) => s.mirrorDrag);
  const endDrag = useEditor((s) => s.endDrag);
  const startDrag = useEditor((s) => s.startDrag);
  const writeNote = useEditor((s) => s.writeNote);
  const startMarquee = useEditor((s) => s.startMarquee);
  const moveMarquee = useEditor((s) => s.moveMarquee);
  const endMarquee = useEditor((s) => s.endMarquee);
  const editSelection = useEditor((s) => s.editSelection);
  const dropSelection = useEditor((s) => s.dropSelection);
  const rotateSelection = useEditor((s) => s.rotateSelection);
  const mirrorSelection = useEditor((s) => s.mirrorSelection);
  const copySelection = useEditor((s) => s.copySelection);
  const paste = useEditor((s) => s.paste);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const collapseUndo = useEditor((s) => s.collapseUndo);
  const notice = useEditor((s) => s.notice);
  const refuse = useEditor((s) => s.refuse);

  // The building minus unticked expansions. Legality uses this; the rulers
  // and camera extent use WAREHOUSES.
  const unlocked = useMemo(() => ownedGeometry(ownedTiersOf(plan)), [plan]);
  const theme = useEditor((s) => s.theme);
  const palette = theme === 'light' ? LIGHT_SCENE : DARK_SCENE;

  // Menu and hover card are transient view state pinned to viewport pixels,
  // so they live here rather than in the store.
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  // The keyboard cursor: UI state only, never in the plan or the undo history.
  // It keeps its cell while hidden, so focus coming back resumes where it was.
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [showCursor, setShowCursor] = useState(false);
  const [said, setSaid] = useState('');
  const hintId = useId();
  /**
   * A box just drawn over empty floor, kept so it can be reserved as a zone
   * from the right-click menu (see src/core/zone.ts). Cleared by any left
   * press, Escape, arming an object, or changing floor or building.
   */
  const [area, setArea] = useState<MarqueeState | null>(null);
  const reserveArea = useEditor((s) => s.reserveArea);
  /** What the pointer is resting on: an object, a note, or both. `placement`
   * is optional because a note can sit on floor nothing is built on. */
  const [hover, setHover] = useState<
    { placement?: Placement; note?: string; at: ClientPoint } | null
  >(null);

  const catalogue = getCatalogue();
  // Resolves an object's variant: the racks by language, the elevator by how
  // far the viewed floor is above the placement's own. See shapesFor.
  const shapes = useMemo(
    () => (id: string, floorOffset: number) => shapesFor(id, { locale, floorOffset }),
    [locale],
  );
  // The renderer takes a Map; OBJECT_ICONS is a static Record (src/data/icons.ts).
  const icons = useMemo(() => new Map(Object.entries(OBJECT_ICONS)), []);
  // The same, for the cargo-type logos stamped into each export door's bay.
  const cargoIcons = useMemo(() => new Map(Object.entries(CARGO_TYPE_ICONS)), []);

  // Bumped when an icon finishes loading, to trigger one more redraw (see
  // useImageCache).
  const [imageTick, setImageTick] = useState(0);
  const getImage = useImageCache(() => setImageTick((t) => t + 1));

  // Bumped when the canvas's box changes, as a redraw trigger. The size lives
  // in a ref.
  const [sizeTick, setSizeTick] = useState(0);

  // One scheduler for the life of the component, so repaints requested by
  // different effects coalesce into the same frame instead of each getting one.
  const scheduler = useMemo(
    () => createFrameScheduler(
      (cb) => window.requestAnimationFrame(cb),
      (handle) => window.cancelAnimationFrame(handle),
    ),
    [],
  );
  useEffect(() => () => scheduler.cancel(), [scheduler]);

  // Derived from the store's drag state rather than set in onMouseMove, so R
  // updates the silhouette without a pointer move.
  const highlight = useMemo<HighlightState | null>(() => {
    // A pending paste wins over a pending drag (both are never armed at once).
    if (pasteCell) {
      const cells: Cell[] = [];
      const preview: NonNullable<HighlightState['preview']> = [];
      for (const entry of clipboard) {
        const catalogued = catalogue.get(entry.objectId);
        if (!catalogued) continue;
        const cell = { x: pasteCell.x + entry.cell.x, y: pasteCell.y + entry.cell.y };
        cells.push(...coveredCells({
          id: '__paste__', objectId: entry.objectId, warehouse: plan.warehouse, floor,
          cell, rotation: entry.rotation, mirrored: entry.mirrored, tier: entry.tier,
        }, catalogued));
        // Its real artwork, not just the footprint tint.
        preview.push({
          objectId: entry.objectId, cell, rotation: entry.rotation,
          mirrored: entry.mirrored, colour: entry.colour,
        });
      }
      // Asked of the real paste, so the tint matches what the click will do.
      const fits = pastedAt(plan, clipboard, pasteCell, catalogue, unlocked, floor, plan.warehouse);
      return { cells, valid: fits.ok, preview };
    }

    // A dragged selection is shown like a paste, tinted by whether it may
    // land. The ghost crosses occupied ground freely until release.
    if (pendingMove && aiming(pendingMove)) {
      const ghosts = ghostsOf(pendingMove);
      const cells: Cell[] = [];
      const preview: NonNullable<HighlightState['preview']> = [];
      for (const ghost of ghosts) {
        const catalogued = catalogue.get(ghost.objectId);
        if (!catalogued) continue;
        cells.push(...coveredCells(ghost, catalogued));
        preview.push({
          objectId: ghost.objectId, cell: ghost.cell,
          rotation: ghost.rotation, mirrored: ghost.mirrored, colour: ghost.colour,
        });
      }
      // Asked of the placements the release will commit, so the tint matches,
      // including a line sliding onto cells it vacates.
      const fits = settledSelection(plan, selectedIds, ghosts, catalogue, unlocked).ok;
      return { cells, valid: fits, preview };
    }

    if (!drag || !drag.cell) return null;
    const entry = catalogue.get(drag.objectId);
    if (!entry) return null;
    // Centred under the pointer with the same helper as commitDrag, so the
    // silhouette and the placement land on the same cells.
    const cell = centredAnchor(drag.cell, entry.footprint, drag.rotation);
    const candidate = {
      id: '__preview__', objectId: drag.objectId, warehouse: plan.warehouse,
      floor, cell, rotation: drag.rotation, mirrored: drag.mirrored, tier: 1,
    };
    return {
      cells: coveredCells(candidate, entry),
      valid: canPlace(plan, candidate, catalogue, unlocked) === null,
      preview: [{ objectId: drag.objectId, cell, rotation: drag.rotation, mirrored: drag.mirrored }],
    };
  }, [drag, floor, plan, catalogue, unlocked, pasteCell, clipboard, pendingMove, selectedIds]);

  /** Writes the pending move to the ref the release reads and the state the
   * silhouette redraws from: the one place either is set. */
  const aimMove = (move: PendingMove | null): void => {
    moveRef.current = move;
    setPendingMove(move);
  };

  /** Calls off a pending move; nothing was dispatched, so nothing moves. */
  const cancelMove = (): void => aimMove(null);

  // The belt advances by elapsed time, so speed is independent of frame rate.
  // The simulation moves in whole cells and the drawing slides between them,
  // so two parcels meeting at a joiner block each other. Runs only while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    // The first frame only sets the baseline. Not performance.now(): rAF's
    // timestamp is when the frame began and can predate it, giving a negative step.
    let last: number | null = null;
    let waiting = 0;
    const tick = (now: number) => {
      const seconds = last === null ? 0 : (now - last) / 1000;
      last = now;
      const perCell = 1 / (CELLS_PER_SECOND * speed);
      waiting += seconds;
      // A while, not an if: a slow frame catches up. Capped so a background
      // tab does not return and run thousands of steps at once.
      let steps = 0;
      while (waiting >= perCell && steps < 8) {
        waiting -= perCell;
        steps++;
        stepRef.current();
      }
      if (waiting >= perCell) waiting = 0;
      setPhase(Math.min(1, waiting / perCell));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Not depending on the plan: the step goes through a ref, so edits feed
    // the next parcel instead of restarting the clock.
  }, [playing, speed]);

  // R rotates, X mirrors, Escape cancels/deselects, Delete/Backspace removes.
  // Each acts on the pending drag if any, else on the selection. Ignored with
  // a modifier held (Ctrl+R must reload) or while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog or menu that already answered the key (Escape closing it,
      // arrows moving through it) marks it handled; the plan is left alone.
      if (e.defaultPrevented || isTypingTarget(e.target)) return;

      // Clipboard first: the only shortcuts that want Ctrl, handled before the
      // bail-out that keeps Ctrl+R reloading the page.
      if (e.ctrlKey || e.metaKey) {
        const combo = e.key.toLowerCase();
        if (combo === 'c' || combo === 'x') {
          // Only when something is selected, so Ctrl+C over the canvas with an
          // empty selection still copies whatever the browser would have.
          if (useEditor.getState().selectedIds.length === 0) return;
          e.preventDefault();
          copySelection(combo === 'x');
        }
        if (combo === 'v') {
          e.preventDefault();
          // Armed, not committed: like a palette pick, a tinted silhouette
          // follows the cursor and a click commits it.
          if (clipboard.length > 0) setPasteCell(pointerCellRef.current);
        }
        return;
      }

      const key = e.key.toLowerCase();

      // X and H are the same flip; V is the other axis. Resolved once so the
      // paste, drag and selection branches agree.
      const axis: FlipAxis | null = key === 'v' ? 'vertical'
        : key === 'x' || key === 'h' ? 'horizontal'
          : null;
      // While a paste is aimed, these turn the silhouette, not the selection.
      // The clipboard itself changes, so pasting again keeps the turn.
      if (pasteCell && key === 'r') {
        setClipboard(turnedShape(clipboard, catalogue, e.shiftKey ? -1 : 1));
        return;
      }
      if (pasteCell && axis) {
        setClipboard(flippedShape(clipboard, catalogue, axis));
        return;
      }

      // Likewise for a dragged selection: R and X turn the silhouette, and the
      // turn lands with the move.
      const moving = moveRef.current;
      if (moving && (key === 'r' || axis)) {
        const shape = key === 'r'
          ? turnedGroup(moving.shape, catalogue, e.shiftKey ? -1 : 1)
          : flippedAbout(moving.shape, catalogue, axis!);
        // An object the catalogue does not know: leave the shape as it is
        // rather than half-turn it.
        if (shape) aimMove({ ...moving, shape, turned: true });
        return;
      }

      if (key === 'r') {
        // Shift+R turns the other way, as in Factorio.
        if (drag) rotateDrag(e.shiftKey ? -1 : 1);
        // The selection turns as one arrangement: objects move as well as turn
        // (see rotatedSelection).
        else rotateSelection(e.shiftKey ? -1 : 1, catalogue, unlocked);
      }
      // Q picks what is under the pointer, as in Factorio.
      if (key === 'q') pickUnderPointer();
      // D removes it, except while a paste or move is aimed: the pointer is
      // over a silhouette, and the object beneath is hidden.
      if (key === 'd' && !pasteCell && !moveRef.current) deleteUnderPointer();
      if (axis) {
        if (drag) mirrorDrag(axis);
        else mirrorSelection(catalogue, unlocked, axis);
      }
      if (e.key === 'Escape') {
        setPasteCell(null);
        // A dragged selection goes back, turns and all. Inlined rather than
        // calling cancelMove, so the effect gains no dependency.
        moveRef.current = null;
        setPendingMove(null);
        stopParcels();
        endDrag();
        select([]);
        setMenu(null);
        setArea(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `dispatch` and `selectedIds` are for deleteUnderPointer; without them
    // the handler would act on a stale selection.
  }, [drag, rotateDrag, mirrorDrag, endDrag, select, deleteSelection, catalogue, copySelection, paste, unlocked, startDrag, plan, floor, rotateSelection, mirrorSelection, clipboard, pasteCell, setClipboard, dispatch, selectedIds]);

  // The canvas's CSS size, tracked by the observer below: getBoundingClientRect
  // per repaint would force a layout on every mouse event.
  const sizeRef = useRef({ width: 0, height: 0 });

  // Redraws on every relevant change, at most once per frame. The canvas is
  // resized only when its size changes: assigning width/height reallocates
  // and wipes the bitmap even when the value is the same. No clear is needed,
  // since drawScene fills the background first.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    scheduler.schedule(() => {
      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const bitmapW = Math.round(width * dpr);
      const bitmapH = Math.round(height * dpr);
      if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
        canvas.width = bitmapW;
        canvas.height = bitmapH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawScene(toDraw2D(ctx, getImage), {
        plan, catalogue, camera, palette,
        width, height,
        floor, highlight, selectedIds,
        geometry: WAREHOUSES, unlocked,
        shapes, shapeDivisor: SHAPE_DIVISOR,
        icons, cargoIcons, countryIcon: COUNTRY_DOOR_ICON, parcelIcon: PARCEL_ICON,
        notes: plan.notes,
        doors: DOORS, marquee: marquee ?? area,
        cursor: showCursor ? cursor : null,
        doorArrow: DOOR_ARROW, doorArrowDivisor: UI_SHAPE_DIVISOR, stairs: STAIRS,
        parcels: parcelsNow,
        trail: trailNow,
        repaintableColourOf,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getImage is a
    // closure over a ref; imageTick is the deliberate "icon loaded, redraw"
    // trigger and must stay though it is unread.
  }, [plan, catalogue, camera, floor, highlight, selectedIds, marquee, area, icons, cargoIcons, unlocked, imageTick, sizeTick, scheduler, palette, parcelsNow, trailNow, showCursor, cursor]);

  // A box describes cells on one floor of one building; see `area`.
  useEffect(() => setArea(null), [floor, plan.warehouse]);
  const bounds = useMemo(() => floorBounds(plan.warehouse, floor, WAREHOUSES), [plan.warehouse, floor]);
  useEffect(() => {
    setCursor((c) => (c && bounds ? clampedCell(c, bounds) : c));
  }, [bounds]);
  useEffect(() => { if (drag) setArea(null); }, [drag]);

  // Watches the canvas's own box, not the window: side panels can change its
  // size without the window resizing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measured = (width: number, height: number) => {
      if (width === sizeRef.current.width && height === sizeRef.current.height) return;
      sizeRef.current = { width, height };
      setSizeTick((n) => n + 1);
    };

    // Measured once here too: the draw skips a zero-sized canvas, so a missing
    // first observer callback would leave the grid blank.
    const box = canvas.getBoundingClientRect();
    measured(box.width, box.height);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      measured(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const cellAt = (point: ClientPoint): Cell => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToCell(camera, point.clientX - rect.left, point.clientY - rect.top);
  };

  /** The placement on the currently edited floor covering `cell`, if any.
   * See placementAt for the bridge rule and `underneath`. */
  const hitTest = (cell: Cell, underneath = false): Placement | undefined =>
    placementAt(plan, floor, cell, catalogue, underneath);

  /**
   * Resolves `cell` against the pending drag and commits it if valid. Shared
   * by click-to-place and the HTML5 drop, so both judge legality the same way.
   */
  const commitDrag = (cell: Cell): 'placed' | PlacementRejection['reason'] | null => {
    if (!drag) return null;
    const entry = catalogue.get(drag.objectId);
    if (!entry) return null;

    // A click onto an existing line joins it, like a dragged run. With no
    // travel to read, the arrival direction is the armed belt's own flow.
    const arrival = emitDirection(entry, drag.rotation, drag.mirrored);
    if (arrival && joinAt(cell, arrival) > 0) return 'placed';

    const placement = draggedPlacement({ ...drag, cell }, floor, plan.warehouse, entry.footprint);
    if (!placement) return null;
    const refusal = canPlace(plan, placement, catalogue, unlocked);
    if (refusal !== null) return refusal.reason; // invalid drop: place nothing
    dispatch({ kind: 'add', placement });
    return 'placed';
  };

  /** Moves the pending-drag silhouette to the cell under `point`. Shared by
   * onMouseMove and onDragOver. */
  const updateHighlight = (point: ClientPoint): void => {
    if (!drag) return;
    moveDrag(cellAt(point));
  };

  /**
   * Places the armed object on `cell` if it fits. Returns 0 on an illegal
   * cell, so a run skips obstacles. Reads the plan from the store, not the
   * closure: one pointer move can place several cells, each checked against
   * the last.
   */
  const placeAt = (cell: Cell, objectId: string, orientation: Orientation): number => {
    if (!drag) return 0;
    const entry = catalogue.get(objectId);
    if (!entry) return 0;
    const placement = draggedPlacement(
      { ...drag, objectId, ...orientation, cell }, floor, plan.warehouse, entry.footprint,
    );
    if (!placement) return 0;
    const live = useEditor.getState().plan;
    if (canPlace(live, placement, catalogue, unlocked) !== null) return 0;
    dispatch({ kind: 'add', placement });
    return 1;
  };

  /**
   * Lays one cell of a run, pointing the conveyor along the path. A turn
   * replaces the previous cell with a corner. With no corner piece (e.g. a
   * scanner), the run keeps going straight.
   */
  const layAlong = (cell: Cell, incoming: Step, starting = false): number => {
    if (!drag) return 0;
    const painting = paintRef.current;
    let placed = 0;

    if (painting?.dir && (painting.dir.dx !== incoming.dx || painting.dir.dy !== incoming.dy)) {
      placed += cornerAt(painting.last, painting.dir, incoming);
    }

    const entry = catalogue.get(drag.objectId);
    // Only the straight belt turns to follow the path (see FOLLOWS_THE_RUN).
    // Everything else keeps the rotation the palette armed.
    const straightOn = entry && FOLLOWS_THE_RUN.has(drag.objectId)
      ? orientationFor(entry, incoming, incoming)
      : null;

    // Tried before placing, since a join or branch cell is already occupied.
    // Both return 0 otherwise. The first cell of a run branches off a line;
    // every later cell joins one.
    const reshaped = starting ? splitAt(cell, incoming) : joinAt(cell, incoming);
    if (reshaped > 0) return placed + reshaped;

    placed += placeAt(cell, drag.objectId, straightOn ?? { rotation: drag.rotation, mirrored: drag.mirrored });
    return placed;
  };

  /**
   * Turns the belt at `cell` into a joiner where a run arrives side-on, as
   * `cornerAt` does for a turn. Declines, leaving the cell alone, when:
   *   - the object there is not the one being dragged;
   *   - the line has no single direction to preserve (a splitter);
   *   - the run arrived along the line, not across it (see joinerOrientation).
   *
   * Returns the commands dispatched, folded into the run's one undo entry.
   */
  const reshapeAt = (
    cell: Cell,
    step: Step,
    into: Readonly<Record<string, string>>,
    orient: (
      replacement: CatalogEntry,
      existing: { entry: CatalogEntry; rotation: Rotation; mirrored: boolean },
      step: Step,
    ) => Orientation | null,
  ): number => {
    if (!drag || !JOINS_FROM.has(drag.objectId)) return 0;

    // Read from the store: the belt may have been laid by this drag a moment ago.
    const live = useEditor.getState().plan;
    const existing = live.placements.find(
      (p) => p.warehouse === live.warehouse && p.floor === floor
        && p.cell.x === cell.x && p.cell.y === cell.y,
    );
    if (!existing) return 0;

    const upgradeId = into[existing.objectId];
    const upgrade = upgradeId ? catalogue.get(upgradeId) : undefined;
    const existingEntry = catalogue.get(existing.objectId);
    if (!upgrade || !existingEntry) return 0;

    const orientation = orient(
      upgrade,
      { entry: existingEntry, rotation: existing.rotation, mirrored: existing.mirrored ?? false },
      step,
    );
    if (!orientation) return 0;

    dispatch({
      kind: 'move',
      id: existing.id,
      before: existing,
      after: { ...existing, objectId: upgradeId!, ...orientation },
    });
    return 1;
  };

  /** A run arriving at an existing line joins it: belt to joiner, joiner to
   * three-way. Anything else is left alone. */
  const joinAt = (cell: Cell, incoming: Step): number =>
    reshapeAt(cell, incoming, JOINS_INTO, joinerOrientation);

  /** A run leaving an existing line branches off it: the cell it sets out from
   * becomes a splitter. joinAt's mirror image. */
  const splitAt = (cell: Cell, departure: Step): number =>
    reshapeAt(cell, departure, SPLITS_INTO, splitterOrientation);


  /** Turns the conveyor already at `cell` into a corner joining `incoming` to
   * `outgoing`. Returns the number of commands dispatched (0 if there is no
   * corner piece for the armed object, or nothing there to replace). */
  const cornerAt = (cell: Cell, incoming: Step, outgoing: Step): number => {
    if (!drag) return 0;
    const cornerId = CORNER_FOR[drag.objectId];
    const corner = cornerId ? catalogue.get(cornerId) : undefined;
    if (!corner) return 0;
    const orientation = orientationFor(corner, incoming, outgoing);
    if (!orientation) return 0;

    const live = useEditor.getState().plan;
    const before = live.placements.find(
      (p) => p.warehouse === live.warehouse && p.floor === floor
        && p.cell.x === cell.x && p.cell.y === cell.y,
    );
    if (!before) return 0;
    dispatch({
      kind: 'move',
      id: before.id,
      before,
      after: { ...before, objectId: cornerId!, ...orientation },
    });
    return 1;
  };

  /**
   * Arms the object under the pointer, with its rotation and mirroring. Over
   * empty ground it disarms instead, like Factorio's pipette.
   */
  const pickUnderPointer = (): void => {
    const hit = hitTest(pointerCellRef.current);
    if (!hit) {
      endDrag();
      return;
    }
    startDrag(hit.objectId, { rotation: hit.rotation, mirrored: hit.mirrored ?? false });
  };

  /**
   * Removes only what sits under the pointer (Delete takes the selection). Also
   * drops it from the selection, so no stale id lingers there.
   */
  const deleteUnderPointer = (): void => {
    const hit = hitTest(pointerCellRef.current);
    if (!hit) return;
    dispatch({ kind: 'remove', placement: hit });
    if (selectedIds.includes(hit.id)) select(selectedIds.filter((id) => id !== hit.id));
  };

  /**
   * One truckload: a parcel entering at every delivery door (on the first
   * object it feeds, see entryPoints), walked to wherever the layout sends it.
   * A branch is a coin toss; modelling the day's criteria would mean
   * rebuilding the game. Never touches the plan.
   *
   * Each route runs cell by cell, from the delivery door through every cell of
   * every object (see routeSteps), on every floor.
   *
   * Also the routes out of the racks: an unloader against a rack takes one of
   * its parcels each step its belt is free (`pulls`), and `capacity` says how
   * many each rack holds before parcels have to wait in front of it.
   */
  const buildWalks = (): {
    walks: Walk[];
    pulls: { rack: string; walk: Walk }[];
    capacity: Map<string, number>;
  } => {
    const graph = buildGraph(plan, catalogue, DOORS);
    const here = DOORS.filter((d) => d.warehouse === plan.warehouse);
    const deliveryIds = new Set(
      here.filter((d) => d.kind === 'delivery').map((d) => doorNodeId(d)),
    );
    // Both kinds of export, cargo and country doors.
    const exitIds = new Set(
      here.filter((d) => d.kind === 'export' || d.kind === 'country-export')
        .map((d) => doorNodeId(d)),
    );
    // A rack keeps parcels (in port, no out port), so it is not a dead end.
    const storeIds = new Set(
      plan.placements
        .filter((p) => (catalogue.get(p.objectId)?.ports ?? []).every((port) => port.dir !== 'out'))
        .map((p) => p.id),
    );
    const byCell = new Map<string, Cell>([
      ...plan.placements.map((p) => [p.id, p.cell] as const),
      ...here.map((d) => [doorNodeId(d), d.cell] as const),
    ]);
    const byId = new Map(plan.placements.map((p) => [p.id, p]));

    // Which object covers each cell, on every floor, so a dangling output can
    // say whether its target is empty or refuses that side.
    const covering = new Map<string, string>();
    for (const p of plan.placements) {
      if (p.warehouse !== plan.warehouse) continue;
      const entry = catalogue.get(p.objectId);
      if (entry) for (const c of coveredCells(p, entry)) covering.set(`${p.floor}:${c.x},${c.y}`, p.id);
    }
    const whyStuck = (
      placementId: string,
    ): { because: LiveParcel['because']; blockedBy?: string } | undefined => {
      const stuck = graph.danglingOutputs.filter((o) => o.placementId === placementId);
      if (stuck.length === 0) return undefined;
      for (const o of stuck) {
        const step = SIDE_STEP[o.side];
        const blocker = covering.get(`${o.targetFloor}:${o.cell.x + step.dx},${o.cell.y + step.dy}`);
        if (blocker !== undefined) return { because: 'refused', blockedBy: blocker };
      }
      return { because: 'nothing-there' };
    };

    /**
     * Which way a parcel goes at a choice. At a sticker checker it mostly
     * passes straight on; at splitters and diverters a fair toss is right.
     */
    const chooseBranch = (options: readonly string[], at: string): string => {
      const roll = Math.random();
      const fair = () => options[Math.min(options.length - 1, Math.floor(roll * options.length))]!;

      const here = byId.get(at);
      const entry = here && catalogue.get(here.objectId);
      if (!here || !entry || here.objectId !== STICKER_CHECKER) return fair();

      // Straight ahead is opposite the feeding cell, read off the placed ports,
      // since the checker can be turned or mirrored.
      const inStep = portFacings(entry, here.rotation, here.mirrored ?? false)
        .find((facing) => facing.dir === 'in')?.step;
      const ahead = inStep === undefined
        ? undefined
        : options.find((option) => {
          const cell = byCell.get(option);
          return cell !== undefined
            && cell.x === here.cell.x - inStep.dx
            && cell.y === here.cell.y - inStep.dy;
        });

      return mostlyStraight(options, ahead, roll, REFUSED_AT_A_CHECKER);
    };

    const walkFrom = (id: string): Walk => {
      const walked = parcelPath(graph.edges, id, chooseBranch, {
        exits: exitIds,
        stores: storeIds,
      });
      const onward = walked.loopsBackTo === undefined ? undefined : walked.path[walked.loopsBackTo];
      const { steps, startOf } = routeSteps(walked.path, graph.ports, onward);
      const wrapTo = walked.loopsBackTo === undefined ? undefined : startOf[walked.loopsBackTo];
      const last = walked.path[walked.path.length - 1];
      return {
        cells: steps,
        ending: walked.ending,
        endsAt: last,
        ...(walked.ending === 'dropped' && last !== undefined ? whyStuck(last) ?? {} : {}),
        ...(wrapTo !== undefined ? { wrapTo } : {}),
      };
    };

    const walks = [...entryPoints(graph.edges, deliveryIds)]
      .map(walkFrom)
      .filter((w) => w.cells.length > 0);
    const pulls = storePullers(
      graph.ports,
      graph.edges,
      (onFloor, cell) => covering.get(`${onFloor}:${cell.x},${cell.y}`),
      (id) => storeIds.has(id),
    )
      .map(({ puller, store }) => ({ rack: store, walk: walkFrom(puller) }))
      .filter(({ walk }) => walk.cells.length > 0);
    const capacity = new Map(
      [...storeIds].map((id) => [id, storageCapacityOf(byId.get(id)?.objectId ?? '')] as const),
    );
    return { walks, pulls, capacity };
  };

  /**
   * One step of the belt: everything moves a cell, arrivals leave, and each
   * door releases a parcel if its first cell is free, which keeps parcels one
   * cell apart.
   */
  const stepParcels = (): void => {
    const { walks, pulls, capacity } = buildWalksRef.current();
    setSim(({ parcels: live, tally, racks: held }) => {
      const done = { ...tally };
      const racks = { ...held };
      // Move first, then judge who is still on the belt by whether it moved.
      const moved = advanceOneCell(live);
      const stepped: LiveParcel[] = [];
      for (let i = 0; i < live.length; i++) {
        const p = live[i]!;
        const index = moved[i]!;
        const going = index !== p.index;
        const heldFor = going ? 0 : p.heldFor + 1;
        // Only these two leave on arrival; a looping parcel goes round again,
        // a stopped one stays until the stall rule retires it. Judged on where
        // it stood before this step, so the slide into the door or rack is
        // drawn before it goes. A full rack takes nothing: the parcel waits.
        const atEnd = p.index >= p.cells.length - 1;
        const rack = p.ending === 'stored' ? p.endsAt : undefined;
        const roomInRack = rack !== undefined
          && (racks[rack] ?? 0) < (capacity.get(rack) ?? 0);
        const arrived = atEnd && (p.ending === 'delivered' || roomInRack);
        const deadEnd = index >= p.cells.length - 1
          && (p.ending === 'dropped' || p.ending === 'exhausted');
        // A parcel on its way to a door or a rack never falls for waiting: a
        // queue behind a full rack or a busy merge is the layout's answer, not
        // a jam. Only loops and dead ends drop parcels.
        const hold = deadEnd ? DEAD_END_SHOW_STEPS
          : p.ending === 'delivered' || p.ending === 'stored' ? Infinity
            : STUCK_HOLD_STEPS;
        if (!stillOnTheBelt({ arrived, moving: going, heldFor }, hold)) {
          if (!arrived) done.fell++;
          else if (rack !== undefined) racks[rack] = (racks[rack] ?? 0) + 1;
          else done.delivered++;
          continue;
        }
        stepped.push({ ...p, from: p.index, index, heldFor });
      }

      // Each release re-rolls its branch choices, so a splitter visibly sends
      // parcels both ways.
      const taken = new Set(stepped.map((p) => p.cells[p.index]!.slot));
      const sources: { walk: Walk; rack?: string }[] = [
        ...walks.map((walk) => ({ walk })),
        ...pulls,
      ];
      for (const { walk, rack } of sources) {
        const first = walk.cells[0];
        if (!first) continue;
        const at = first.slot;
        if (taken.has(at)) continue; // the belt at that door is still full
        if (rack !== undefined) {
          if ((racks[rack] ?? 0) === 0) continue; // nothing in it to take
          racks[rack] = racks[rack]! - 1;
        }
        taken.add(at);
        stepped.push({
          cells: walk.cells, ending: walk.ending, index: 0, from: 0, heldFor: 0,
          wrapTo: walk.wrapTo, endsAt: walk.endsAt,
          because: walk.because, blockedBy: walk.blockedBy,
        });
      }

      return {
        parcels: stepped.length > MAX_PARCELS ? stepped.slice(-MAX_PARCELS) : stepped,
        tally: done,
        racks,
      };
    });
  };

  // Reached by the animation clock through refs, reassigned each render, so
  // the next parcel uses the current layout without restarting the clock.
  const buildWalksRef = useRef(buildWalks);
  buildWalksRef.current = buildWalks;
  const stepRef = useRef(stepParcels);
  stepRef.current = stepParcels;

  /** Clears the parcels and resets the clock, for both Escape and Stop. */
  const stopParcels = (): void => {
    setSim(NO_SIM);
    setPhase(0);
    setPlaying(false);
  };

  const sendParcels = (): void => {
    if (buildWalks().walks.length === 0) return; // nothing is wired up; say nothing
    setSim(NO_SIM);
    setPhase(0);
    setPlaying(true);
  };

  /** Every placement whose footprint intersects the marquee rectangle. */
  const placementsIn = (box: MarqueeState): Placement[] => {
    const minX = Math.min(box.from.x, box.to.x);
    const maxX = Math.max(box.from.x, box.to.x);
    const minY = Math.min(box.from.y, box.to.y);
    const maxY = Math.max(box.from.y, box.to.y);
    return plan.placements.filter((p) => {
      if (p.warehouse !== plan.warehouse || p.floor !== floor) return false;
      const entry = catalogue.get(p.objectId);
      if (!entry) return false;
      // Intersects, not fully contained: a box across a 1x3 conveyor catches it.
      return coveredCells(p, entry).some(
        (c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY,
      );
    });
  };

  const onMouseDown = (event: React.MouseEvent) => {
    setShowCursor(false);
    if (event.button === 1) {
      event.preventDefault(); // stop the browser's middle-click autoscroll icon
      panRef.current = { clientX: event.clientX, clientY: event.clientY, panned: false };
      return;
    }

    // Right button: a pan or the menu, decided on release by whether the
    // pointer travelled. The object under the press is selected now, unless
    // it is already part of the selection.
    if (event.button === 2) {
      // Right-click calls off a pending paste or a dragged selection, and does
      // nothing else on that press.
      if (moveRef.current) {
        cancelMove();
        return;
      }
      if (pasteCell) {
        setPasteCell(null);
        return;
      }
      const hit = drag ? undefined : hitTest(cellAt(event), event.altKey);
      if (hit && !selectedIds.includes(hit.id)) select([hit.id]);
      rightRef.current = {
        onObject: hit !== undefined,
        pan: { clientX: event.clientX, clientY: event.clientY },
        panned: false,
      };
      setHover(null);
      return;
    }

    if (event.button !== 0) return;
    setArea(null);

    // With an object armed, holding the button lays a run along the pointer's
    // path. Nothing is placed on press: there is no direction yet. A press
    // that never moves falls through to onClick, which places one.
    if (drag) {
      paintRef.current = { last: cellAt(event), dir: null, placed: 0 };
      return;
    }

    // Nothing armed: pressing on something already selected starts a move;
    // anywhere else, even on an unselected object, starts a box, so a box can
    // start in a dense layout. Neither commits until the pointer travels, so
    // a still press falls through to onClick and selects.
    const hit = hitTest(cellAt(event), event.altKey);
    if (hit && selectedIds.includes(hit.id)) {
      // The shape starts as the selection; R and X work on this copy until release.
      aimMove({
        from: cellAt(event),
        step: { dx: 0, dy: 0 },
        shape: plan.placements.filter((p) => selectedIds.includes(p.id)),
        turned: false,
      });
      return;
    }
    startMarquee(cellAt(event));
  };

  const onMouseMove = (event: React.MouseEvent) => {
    pointerCellRef.current = cellAt(event);
    // Keeps the pending paste under the cursor. Compared first, so moving
    // within one cell does not re-render.
    if (pasteCell) {
      const over = pointerCellRef.current;
      if (over.x !== pasteCell.x || over.y !== pasteCell.y) setPasteCell(over);
    }
    if (panRef.current) {
      const dx = event.clientX - panRef.current.clientX;
      const dy = event.clientY - panRef.current.clientY;
      panRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        // Any movement makes this a pan rather than a pick; no dead zone.
        panned: panRef.current.panned || dx !== 0 || dy !== 0,
      };
      setCamera((c) => ({
        ...c,
        x: c.x - dx / (CELL_PX * c.zoom),
        y: c.y - dy / (CELL_PX * c.zoom),
      }));
      return;
    }
    if (marquee) {
      moveMarquee(cellAt(event));
      // Hide the hover card during a box selection, or it would freeze over it.
      setHover(null);
      return;
    }

    // Right button held: pan. Middle-drag pans as well.
    const right = rightRef.current;
    if (right) {
      const dx = event.clientX - right.pan.clientX;
      const dy = event.clientY - right.pan.clientY;
      if (dx === 0 && dy === 0) return;
      right.pan = { clientX: event.clientX, clientY: event.clientY };
      right.panned = true;
      setCamera((c) => ({
        ...c,
        x: c.x - dx / (CELL_PX * c.zoom),
        y: c.y - dy / (CELL_PX * c.zoom),
      }));
      return;
    }

    // Left button held on an object: aim the selection. Only the silhouette
    // follows, so the step may point anywhere, even where it cannot land.
    const moving = moveRef.current;
    if (moving) {
      const cell = cellAt(event);
      const step = { dx: cell.x - moving.from.x, dy: cell.y - moving.from.y };
      // Compared first, so moving within one cell does not redraw.
      if (step.dx === moving.step.dx && step.dy === moving.step.dy) return;
      aimMove({ ...moving, step });
      return;
    }

    // Laying a run: fill every cell since the last, since `mousemove` may skip
    // cells. `cellsBetween` includes both ends and the first is already laid,
    // hence the slice.
    const painting = paintRef.current;
    if (painting) {
      const cell = cellAt(event);
      const path = cellsBetween(painting.last, cell);
      for (let i = 1; i < path.length; i++) {
        const step = path[i]!;
        const previous = path[i - 1]!;
        const incoming: Step = { dx: step.x - previous.x, dy: step.y - previous.y };
        // The first step also lays the press cell, now that it has a direction.
        if (painting.dir === null) painting.placed += layAlong(previous, incoming, true);
        painting.placed += layAlong(step, incoming);
        painting.last = step;
        painting.dir = incoming;
      }
      updateHighlight(event);
      return;
    }

    updateHighlight(event);

    // Hover card: only over a real object, and never while one is armed.
    const cell = cellAt(event);
    const over = drag ? undefined : hitTest(cell);
    // A note shows on hover even where nothing is built.
    const noted = drag ? undefined : (plan.notes ?? []).find(
      (note) => note.warehouse === plan.warehouse && note.floor === floor
        && note.cell.x === cell.x && note.cell.y === cell.y,
    );
    setHover(over || noted
      ? {
        placement: over,
        note: noted?.text,
        at: { clientX: event.clientX, clientY: event.clientY },
      }
      : null);
  };

  const onMouseUp = (event: React.MouseEvent) => {
    // Middle button: a press that travelled was a pan; one that stayed put picks.
    if (event.button === 1) {
      const pan = panRef.current;
      panRef.current = null;
      if (pan && !pan.panned) pickUnderPointer();
      return;
    }

    // The right button's meaning is decided here, not in onContextMenu, which
    // fires on press on X11 and on release on Windows.
    if (event.button === 2) {
      const right = rightRef.current;
      rightRef.current = null;
      if (!right) return;

      // A pan opens no menu and keeps the selection.
      if (right.panned) return;
      // A still press opens the menu, on empty ground too (for notes). On
      // empty ground it also cancels any aim and clears the selection; the
      // menu there holds only the note.
      if (!right.onObject) {
        endDrag();
        select([]);
      }
      const cell = cellAt(event);
      if (area && !inBox(cell, area)) setArea(null);
      setMenu({ x: event.clientX, y: event.clientY, cell });
      return;
    }

    if (event.button !== 0) return;

    // The release is the only moment a drag touches the plan: `dropSelection`
    // dispatches one command, so one undo reverts it. A release where it does
    // not fit is refused and moves nothing.
    const moving = moveRef.current;
    if (moving) {
      cancelMove();
      // Neither travelled nor turned: that is a click, and onClick may select.
      if (!aiming(moving)) return;
      // The gesture was a drag, whether or not it landed. The trailing `click`
      // must not re-run selection logic on whatever sits under the pointer.
      swallowNextClickRef.current = true;
      dropSelection(ghostsOf(moving), catalogue, unlocked);
      return;
    }

    // End of a run. Each conveyor was dispatched as laid, so the next cell's
    // check could see it; the commands merge into one undo entry.
    const painting = paintRef.current;
    if (painting) {
      paintRef.current = null;
      if (painting.placed === 0) return; // a press that never moved: let onClick place one
      collapseUndo(painting.placed);
      swallowNextClickRef.current = true; // the run already covered this cell
      return;
    }

    const box = endMarquee();
    if (!box) return;
    // A drag that never left its starting cell is a click; leave it to onClick.
    if (box.from.x === box.to.x && box.from.y === box.to.y) return;
    const caught = placementsIn(box).map((p) => p.id);
    const adding = event.shiftKey || event.ctrlKey;
    select(adding ? [...new Set([...selectedIds, ...caught])] : caught);
    // A box over nothing stays on screen, for the menu's "Reserve this area".
    setArea(caught.length === 0 && !adding ? box : null);
    // The browser fires `click` after this (mousedown and mouseup both hit
    // the canvas), which would wipe the new selection. Swallow that one click.
    swallowNextClickRef.current = true;
  };

  const onMouseLeave = () => {
    panRef.current = null;
    // End any run at the edge rather than resuming it if the pointer returns.
    const painting = paintRef.current;
    if (painting) {
      paintRef.current = null;
      collapseUndo(painting.placed);
    }
    // A dragged selection goes back: the release would come off-canvas with
    // no mouseup, and nothing was committed.
    if (moveRef.current) cancelMove();
    rightRef.current = null;
    endMarquee();
    setHover(null);
    if (drag) moveDrag(null);
  };

  const onClick = (event: React.MouseEvent) => {
    // The tail of a box selection or drag (see onMouseUp), not a click.
    if (swallowNextClickRef.current) {
      swallowNextClickRef.current = false;
      return;
    }
    const cell = cellAt(event);
    // A pending paste commits here, wherever the silhouette was showing.
    if (pasteCell) {
      paste(pasteCell, catalogue, unlocked);
      setPasteCell(null);
      return;
    }
    if (drag) {
      commitDrag(cell);
      return;
    }
    // Alt reaches past a bridge to the conveyor under it; a plain click selects
    // what is visible.
    const hit = hitTest(cell, event.altKey);
    // Shift/ctrl-click toggles an object in the selection. On empty ground it
    // does nothing rather than clearing the selection.
    if (event.shiftKey || event.ctrlKey) {
      if (hit) toggleSelected(hit.id);
      return;
    }
    select(hit ? [hit.id] : []);
  };

  /** What is under `cell`, and where, for the live region. */
  const describeCell = (cell: Cell): string => {
    const hit = hitTest(cell);
    const what = hit
      ? hit.label ?? catalogue.get(hit.objectId)?.displayName[locale] ?? hit.objectId
      : t(locale, 'cursor.empty');
    const dims = warehouseDimensions(plan.warehouse, WAREHOUSES);
    return `${what}, ${t(locale, 'cursor.column')} ${displayColumn(cell.x)}, ${t(locale, 'cursor.row')} ${displayRow(cell.y, dims)}`;
  };

  const nameOf = (placement: Placement | undefined): string =>
    placement ? placement.label ?? catalogue.get(placement.objectId)?.displayName[locale] ?? placement.objectId : '';

  /** The cursor's cell, or where it starts: the middle of the view. */
  const cursorCell = (): Cell => {
    if (cursor) return cursor;
    const { width, height } = sizeRef.current;
    const middle = screenToCell(camera, width / 2, height / 2);
    return bounds ? clampedCell(middle, bounds) : middle;
  };

  /**
   * Puts the cursor on `cell` and points everything that aims at it there: an
   * armed object's silhouette, a pending paste, and the pointer cell that Q, D
   * and Ctrl+V read. The view follows so the cursor never leaves it.
   */
  const aimCursor = (cell: Cell): void => {
    setCursor(cell);
    setShowCursor(true);
    pointerCellRef.current = cell;
    setHover(null);
    if (drag) moveDrag(cell);
    if (pasteCell) setPasteCell(cell);
    const { width, height } = sizeRef.current;
    setCamera((c) => cameraShowing(c, cell, width, height));
    setSaid(describeCell(cell));
  };

  const onFocus = (event: React.FocusEvent<HTMLCanvasElement>) => {
    // A click focuses the canvas too, and the cursor is only for the keyboard.
    let byKeyboard = true;
    try { byKeyboard = event.currentTarget.matches(':focus-visible'); } catch { /* older engines */ }
    if (byKeyboard) aimCursor(cursorCell());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    const here = cursorCell();
    const arrow = ARROWS[event.key];

    if (arrow) {
      event.preventDefault();
      const n = event.shiftKey ? 5 : 1;
      const step = { dx: arrow.dx * n, dy: arrow.dy * n };
      if (event.altKey) {
        nudgeSelection(here, step);
        return;
      }
      aimCursor(bounds ? steppedCursor(here, step, bounds) : here);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setShowCursor(true);
      if (pasteCell) {
        const landed = paste(here, catalogue, unlocked);
        setPasteCell(null);
        setSaid(t(locale, landed ? 'cursor.pasted' : 'cursor.notPasted'));
        return;
      }
      if (drag) {
        const outcome = commitDrag(here);
        // Named from what was armed: the plan in this render predates the placement.
        if (outcome === 'placed') setSaid(`${t(locale, 'cursor.placed')}: ${catalogue.get(drag.objectId)?.displayName[locale] ?? drag.objectId}`);
        else if (outcome !== null) {
          refuse(outcome);
          setSaid(t(locale, 'cursor.notPlaced'));
        }
        return;
      }
      const hit = hitTest(here, event.altKey);
      const next = pickedSelection(selectedIds, hit?.id, event.shiftKey);
      select(next);
      if (hit && next.includes(hit.id)) {
        setSaid(`${t(locale, 'cursor.selected')}: ${nameOf(hit)}`
          + (next.length > 1 ? `, ${next.length} ${t(locale, 'cursor.inSelection')}` : ''));
      } else if (hit) setSaid(`${t(locale, 'cursor.unselected')}: ${nameOf(hit)}`);
      else if (next.length === 0 && selectedIds.length > 0) setSaid(t(locale, 'cursor.cleared'));
      return;
    }

    if (['+', '=', '-', '_'].includes(event.key) && !event.altKey) {
      event.preventDefault();
      const factor = event.key === '-' || event.key === '_' ? 1 / 1.25 : 1.25;
      setCamera((c) => {
        const { px, py } = worldToScreen(c, here);
        const half = (CELL_PX * c.zoom) / 2;
        return cameraZoomedAt(c, { x: px + half, y: py + half },
          Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor)));
      });
      return;
    }

    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      openMenuAt(here);
    }
  };

  /** Alt+arrow: the selection lands one step over through the same command a
   * drag release uses, and the cursor travels with it. */
  const nudgeSelection = (here: Cell, step: Step): void => {
    if (selectedIds.length === 0) {
      setSaid(t(locale, 'cursor.nothingSelected'));
      return;
    }
    const shape = plan.placements.filter((p) => selectedIds.includes(p.id));
    if (!dropSelection(shiftedSelection(shape, step), catalogue, unlocked)) {
      setSaid(t(locale, 'cursor.notMoved'));
      return;
    }
    const moved = { x: here.x + step.dx, y: here.y + step.dy };
    aimCursor(bounds ? clampedCell(moved, bounds) : moved);
    setSaid(t(locale, 'cursor.moved'));
  };

  /** The keyboard's right-click: the same menu, opened over the cursor's cell
   * and selecting what is there the way a right press does. */
  const openMenuAt = (cell: Cell): void => {
    setPasteCell(null);
    const hit = drag ? undefined : hitTest(cell);
    if (hit && !selectedIds.includes(hit.id)) select([hit.id]);
    if (!hit) {
      endDrag();
      select([]);
    }
    if (area && !inBox(cell, area)) setArea(null);
    const rect = canvasRef.current?.getBoundingClientRect();
    const { px, py } = worldToScreen(camera, cell);
    const half = (CELL_PX * camera.zoom) / 2;
    setMenu({ x: (rect?.left ?? 0) + px + half, y: (rect?.top ?? 0) + py + half, cell });
  };

  /**
   * Suppresses the browser's menu over the editor surface; the app uses the
   * right button itself.
   *
   * On the wrapper, in the capture phase: on Windows `contextmenu` fires on
   * mouseup, after React has rendered the app's menu under the cursor, so the
   * event often targets the menu or another overlay, not the canvas. Not on
   * the document, so text inputs keep their menu.
   *
   * It only suppresses; the gesture is decided in onMouseDown/onMouseUp.
   */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const suppress = (event: Event) => event.preventDefault();
    wrapper.addEventListener('contextmenu', suppress, { capture: true });
    return () => wrapper.removeEventListener('contextmenu', suppress, { capture: true });
  }, []);

  // Native drag-and-drop from the palette: the drop needs preventDefault() on
  // dragover, and mousemove does not fire during a native drag, so dragover
  // drives the silhouette.
  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    updateHighlight(event);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    commitDrag(cellAt(event));
  };

  // React's `onWheel` is passive, so preventDefault() there fails and the page
  // scrolls. A native { passive: false } listener is required.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      // Zoom is anchored on the pointer.
      const rect = canvas.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setCamera((c) => cameraZoomedAt(
        c,
        at,
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1))),
      ));
    };
    canvas.addEventListener('wheel', onWheelNative, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheelNative);
  }, []);

  // Touch: pan with one finger, pinch with two. Native { passive: false }
  // listeners, like the wheel. preventDefault() also stops the synthetic
  // mouse events that follow a touch, which would place and select, so touch
  // stays view-only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Where the fingers were at the last event. Null between gestures.
    let previous: TouchPoint[] | null = null;
    const pointsOf = (event: TouchEvent): TouchPoint[] => {
      const rect = canvas.getBoundingClientRect();
      return Array.from(event.touches).map((touch) => ({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }));
    };

    const onStart = (event: TouchEvent) => {
      event.preventDefault();
      previous = pointsOf(event);
    };

    const onMove = (event: TouchEvent) => {
      event.preventDefault();
      const next = pointsOf(event);
      if (previous !== null) {
        const from = previous;
        setCamera((c) => cameraAfterTouch(c, from, next));
      }
      previous = next;
    };

    // Re-anchored rather than cleared: lifting one finger of a pinch leaves the
    // other panning, and cameraAfterTouch ignores finger-count changes.
    const onEnd = (event: TouchEvent) => {
      previous = event.touches.length > 0 ? pointsOf(event) : null;
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
    };
  }, [setCamera]);

  // The refusal message, cleared after a moment. Keyed on `notice.at`, not the
  // reason, so the same refusal twice re-shows.
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setShowNotice(true);
    const timer = setTimeout(() => setShowNotice(false), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  const hoveredEntry = hover?.placement ? catalogue.get(hover.placement.objectId) : undefined;

  /** What has become of the parcels so far, counted as they arrive or fall,
   * then where the lines stop. */
  const verdict = useMemo(() => {
    if (parcels.length === 0) return '';
    const { tally } = sim;
    const stored = Object.values(sim.racks).reduce((sum, n) => sum + n, 0);
    const counts = [
      `${t(locale, 'sim.onBelt')} ${parcels.length}`,
      `${t(locale, 'sim.delivered')} ${tally.delivered}`,
      ...(stored > 0 ? [`${t(locale, 'sim.stored')} ${stored}`] : []),
      ...(tally.fell > 0 ? [`${t(locale, 'sim.fell')} ${tally.fell}`] : []),
    ].join('  ·  ');

    // Where, not just what: a stopped parcel looks the same whatever the
    // cause, so the report gives its cell.
    const dims = warehouseDimensions(plan.warehouse, WAREHOUSES);
    const stops: string[] = [];
    for (const p of parcels) {
      if (p.ending !== 'dropped' && p.ending !== 'exhausted') continue;
      // Where its route ends, said as soon as a parcel is on its way there
      // and for as long as one is, rather than only while one stands at the end.
      const cell = p.cells[p.cells.length - 1]!;
      // Named, not just located.
      const at = p.endsAt === undefined ? undefined : plan.placements.find((q) => q.id === p.endsAt);
      const named = at && catalogue.get(at.objectId)?.displayName[locale];
      const nameOf = (id: string | undefined) => {
        const found = id === undefined ? undefined : plan.placements.find((q) => q.id === id);
        return found && catalogue.get(found.objectId)?.displayName[locale];
      };
      const blocker = plan.placements.find((q) => q.id === p.blockedBy);
      const blockerName = nameOf(p.blockedBy);
      // Also its rotation and which sides it takes from, as seen on screen.
      // +y is down here: the inverted compass has N facing +y, and
      // displayRow counts up from the bottom.
      const sideWord = (step: { dx: number; dy: number }): TranslationKey =>
        step.dy === 1 ? 'side.below'
          : step.dy === -1 ? 'side.above'
            : step.dx === 1 ? 'side.right' : 'side.left';
      const blockerEntry = blocker && catalogue.get(blocker.objectId);
      const accepts = blocker && blockerEntry
        ? portFacings(blockerEntry, blocker.rotation, blocker.mirrored ?? false)
          .filter((f) => f.dir === 'in')
          .map((f) => t(locale, sideWord(f.step)))
        : [];
      const blockerWhere = blocker
        ? ` ${displayColumn(blocker.cell.x)}/${displayRow(blocker.cell.y, dims)}`
          + ` ${blocker.rotation}°${blocker.mirrored ? ' ⇄' : ''}`
          + (accepts.length > 0 ? `, ${t(locale, 'parcel.takesFrom')} ${accepts.join(' + ')}` : '')
        : '';
      const why = p.because
        ? `: ${t(locale, `parcel.${p.because}` as TranslationKey)}`
          + (blockerName ? ` (${blockerName}${blockerWhere})` : '')
        : '';
      const where = `${displayColumn(cell.x)}/${displayRow(cell.y, dims)}${named ? ` (${named})` : ''}${why}`;
      if (!stops.includes(where)) stops.push(where);
      if (stops.length === 3) break;
    }

    return stops.length === 0
      ? counts
      : `${counts}  ·  ${t(locale, 'parcel.stopsAt')} ${stops.join(', ')}`;
  }, [parcels, sim, locale, plan.warehouse, plan.placements, catalogue]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label={t(locale, 'canvas.label')}
        aria-describedby={hintId}
        onFocus={onFocus}
        onBlur={() => setShowCursor(false)}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        // No native tooltip over an object, where it would cover the hover card.
        title={hover ? undefined : t(locale, 'canvas.panHint')}
        // touch-none tells the browser up front that this element handles its
        // gestures, so a pan does not stick while it decides whether to scroll.
        className="h-full w-full touch-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
      />
      <p id={hintId} className="sr-only">{t(locale, 'canvas.keysHint')}</p>
      <div role="status" aria-live="polite" data-cursor-status className="sr-only">{said}</div>
      {/* An object needs its catalogue entry; a note-only hover still shows. */}
      {hover && (hoveredEntry || hover.note !== undefined) && !menu && (
        <HoverCard
          placement={hover.placement}
          entry={hoveredEntry}
          note={hover.note}
          at={{ x: hover.at.clientX, y: hover.at.clientY }}
          locale={locale}
        />
      )}
      {/* Why the last action did not happen, over the canvas where the eye is. */}
      {notice && showNotice && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded border border-[var(--tint-warning)] bg-[var(--tint-warm)]/95 px-3 py-1.5 text-xs text-[var(--warning)] shadow-lg"
        >
          {t(locale, `issue.${notice.reason}` as TranslationKey)}
        </div>
      )}

      {/* Play, pause and speed, at the foot of the canvas. */}
      {LIVE_PREVIEW && (
      <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded border border-[var(--line-strong)] bg-[var(--panel)]/95 px-1.5 py-1 shadow-lg">
        <button
          onClick={() => (playing ? setPlaying(false) : parcels.length > 0 ? setPlaying(true) : sendParcels())}
          aria-label={t(locale, playing ? 'sim.pause' : 'sim.play')}
          title={t(locale, playing ? 'sim.pause' : 'sim.play')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 py-1 leading-none text-[var(--text-faint)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:bg-[var(--raised-hover)] md:min-h-0 md:min-w-0"
        >
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button
          onClick={stopParcels}
          aria-label={t(locale, 'sim.stop')}
          title={t(locale, 'sim.stop')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 py-1 leading-none text-[var(--text-faint)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:bg-[var(--raised-hover)] md:min-h-0 md:min-w-0"
        >
          <Square size={16} aria-hidden />
        </button>
        <button
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          aria-label={t(locale, 'sim.speed')}
          title={t(locale, 'sim.speed')}
          className="flex min-h-11 items-center gap-1 rounded px-2 py-1 font-mono text-xs leading-none text-[var(--text-faint)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:bg-[var(--raised-hover)] md:min-h-0"
        >
          <FastForward size={16} aria-hidden />{speed}×
        </button>
      </div>
      )}

      {/* Shown at once, since the result is known when play starts. Dismissed
          by following another parcel, or by Escape. */}
      {LIVE_PREVIEW && parcels.length > 0 && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded border border-[var(--line-strong)] bg-[var(--panel)]/95 px-3 py-1.5 text-xs shadow-lg"
        >
          {verdict}
        </div>
      )}

      {/* Positioned over its own cell. Blur commits the note; Escape closes
          without saving. */}
      {noteAt && (
        <textarea
          autoFocus
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          onBlur={() => { writeNote(noteAt, noteText); setNoteAt(null); }}
          // No stopPropagation needed: the window shortcut handler ignores
          // typing targets.
          onKeyDown={(event) => {
            if (event.key === 'Escape') { setNoteAt(null); setNoteText(''); }
          }}
          aria-label={t(locale, 'note.label')}
          placeholder={t(locale, 'note.placeholder')}
          className="absolute z-40 h-24 w-48 resize-none rounded border border-[var(--line-strong)] bg-[var(--panel)] p-2 text-xs shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{
            left: worldToScreen(camera, noteAt).px,
            top: worldToScreen(camera, noteAt).py,
          }}
        />
      )}

      {menu && (
        <ContextMenu
          anchor={menu}
          onClose={() => setMenu(null)}
          onReserve={area && inBox(menu.cell, area)
            ? () => { reserveArea(area, catalogue, unlocked); setArea(null); }
            : undefined}
          onNote={(cell) => {
            const here = (plan.notes ?? []).find(
              (note) => note.warehouse === plan.warehouse && note.floor === floor
                && note.cell.x === cell.x && note.cell.y === cell.y,
            );
            setNoteText(here?.text ?? '');
            setNoteAt(cell);
          }}
        />
      )}
    </div>
  );
}
