'use client';

import { create } from 'zustand';
import { centredAnchor, type WarehouseGeometry } from '@/core/grid';
import { canPlace } from '@/core/occupancy';
import { mirroredSelection, rotatedSelection, settledSelection, type FlipAxis, type TransformResult } from '@/core/transform';
import { zoneObjectId, zoneSize } from '@/core/zone';
import { copiedShape, pastedAt, type ClipboardEntry } from '@/core/clipboard';
import { ALL_TIERS, MANDATORY_TIERS } from '@/data/warehouse-tiers';
import { CATALOGUE_GAME_VERSION } from '@/core/version';
import type { CatalogEntry, Cell, Placement, Plan, Rotation, WarehouseId } from '@/core/types';
import { detectLocale } from '@/i18n';
import type { Locale } from '@/i18n';
import { applyCommand, invertCommand, type Command } from './commands';

export const STORAGE_KEY = 'parcelplanner.plan';
/** Kept apart from the plan, so opening a shared link keeps the viewer's own theme. */
export const THEME_KEY = 'parcelplanner.theme';
export const LOCALE_KEY = 'parcelplanner.locale';

/**
 * The saved language choice, falling back to the browser's languages when
 * none was made. An unrecognised stored value counts as no choice.
 * localStorage can throw in some private-browsing and embedded browsers,
 * hence the try/catch in `savedLocale`.
 */
export function openingLocale(browserLanguages: readonly string[]): Locale {
  return savedLocale() ?? detectLocale(browserLanguages);
}

export function savedLocale(): Locale | undefined {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    return saved === 'en' || saved === 'fr' ? saved : undefined;
  } catch {
    return undefined;
  }
}

export type Theme = 'dark' | 'light';

const emptyPlan = (): Plan => ({
  gameVersion: CATALOGUE_GAME_VERSION,
  warehouse: 'main',
  placements: [],
});

/** Object being dragged from the palette, before it is committed. */
export interface DragState {
  objectId: string;
  rotation: Rotation;
  /** Flipped horizontally (see `Placement.mirrored`), shown on the silhouette
   * before the drop like rotation. */
  mirrored: boolean;
  cell: Cell | null;
}

/** An in-progress box selection, in grid cells rather than pixels so it
 * survives a camera pan mid-drag. */
export interface MarqueeState {
  from: Cell;
  to: Cell;
}

interface EditorState {
  plan: Plan;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  floor: number;
  locale: Locale;
  selectedIds: string[];
  drag: DragState | null;
  marquee: MarqueeState | null;
  budget: number | null;
  /**
   * Why the last action was refused, so the editor can say so. `at` is a
   * timestamp so the same reason twice in a row still shows again.
   */
  notice: { reason: string; at: number } | null;
  /** Says why an action was refused, for callers outside the store. */
  refuse: (reason: string) => void;
  undoStack: Command[];
  redoStack: Command[];

  dispatch: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  setFloor: (floor: number) => void;
  setLocale: (locale: Locale) => void;
  setWarehouse: (warehouse: WarehouseId) => void;
  setBudget: (budget: number | null) => void;
  select: (ids: string[]) => void;
  /** Adds `id` to the selection, or removes it (shift/ctrl-click). */
  toggleSelected: (id: string) => void;
  /** Arms `objectId` for placement. `orientation` copies an existing object's
   * rotation and mirroring, for the pipette. */
  startDrag: (objectId: string, orientation?: { rotation: Rotation; mirrored: boolean }) => void;
  moveDrag: (cell: Cell | null) => void;
  /** Turns the pending drag a quarter turn; `-1` turns counter-clockwise (Shift+R). */
  rotateDrag: (direction?: 1 | -1) => void;
  /** Flips the pending palette drag. `vertical` adds a half turn to the
   * left-to-right flip, as in `flippedVertically`. */
  mirrorDrag: (axis?: FlipAxis) => void;
  endDrag: () => void;
  startMarquee: (cell: Cell) => void;
  moveMarquee: (cell: Cell) => void;
  /** Ends the box selection and returns its rectangle for the caller to resolve
   * into ids, or null when no marquee was in progress. */
  endMarquee: () => MarqueeState | null;
  /** Applies `edit` to every selected placement as one undo step. Nothing is
   * pushed when no placement changed. */
  editSelection: (edit: (placement: Placement) => Placement) => void;
  /** The last copied shape, kept in the store: the system clipboard needs a
   * permission prompt and only holds text. */
  clipboard: ClipboardEntry[];
  /** Copies the selection; `cut` then deletes it. */
  copySelection: (cut?: boolean) => void;
  /** Replaces the copied shape, so R and X can turn or flip a paste being aimed. */
  setClipboard: (shape: ClipboardEntry[]) => void;
  /** Pastes the clipboard with its corner on `target`, selecting what landed.
   * Answers false when the shape does not fit there and nothing was added. */
  paste: (
    target: Cell,
    catalogue: Map<string, CatalogEntry>,
    geometry: WarehouseGeometry,
  ) => boolean;
  /** Turns the whole selection a quarter turn as one arrangement; `-1` goes
   * counter-clockwise. Returns false, moving nothing, when it would not fit. */
  rotateSelection: (
    direction: 1 | -1,
    catalogue: Map<string, CatalogEntry>,
    geometry: WarehouseGeometry,
  ) => boolean;
  /** Flips the whole selection as one arrangement: left-to-right by default,
   * top-to-bottom on `vertical`. */
  mirrorSelection: (
    catalogue: Map<string, CatalogEntry>,
    geometry: WarehouseGeometry,
    axis?: FlipAxis,
  ) => boolean;
  /**
   * Replaces the selection with `placements` (matched by id) as one undo entry,
   * for a drag that may have been moved, turned and flipped. Returns false and
   * sets the notice when they do not fit, moving nothing.
   */
  dropSelection: (
    placements: readonly Placement[],
    catalogue: Map<string, CatalogEntry>,
    geometry: WarehouseGeometry,
  ) => boolean;
  deleteSelection: () => void;
  /**
   * Removes every placement in all warehouses, through `dispatch`: one undo
   * entry, and held back while a shared plan covers the visitor's work. The
   * viewed warehouse, owned tiers and budget stay as they are.
   */
  clearPlan: () => void;
  /** Merges the last `count` undo entries into one, so a drag that laid a run
   * undoes in one press. A no-op below 2 or when the stack is shorter. */
  collapseUndo: (count: number) => void;
  /**
   * Writes `text` at `cell` on the current floor and warehouse: adds, changes
   * or, with empty text, deletes the note.
   */
  writeNote: (cell: Cell, text: string) => void;
  /**
   * Turns a box over empty floor into a reserved zone (see src/core/zone.ts)
   * and selects it for naming. Refused, with the reason shown, when anything is
   * in the way or the box leaves owned ground. Returns whether it was reserved.
   */
  reserveArea: (
    box: MarqueeState,
    catalogue: Map<string, CatalogEntry>,
    geometry: WarehouseGeometry,
  ) => boolean;
  /** Ticks or unticks an owned expansion tier. Not undoable: it is a fact about
   * the player's game, not a layout edit. */
  toggleOwnedTier: (tier: number) => void;
  loadPlan: (plan: Plan) => void;

  /**
   * True while someone else's plan is on screen and the visitor's own layout is
   * still in storage. Nothing is written meanwhile; the first edit is held
   * (see `heldEdit`).
   */
  sharedOverWork: boolean;
  /**
   * An edit held until the visitor agrees to replace their own work. A closure
   * rather than a Command, since some edits (owned tiers) skip the undo stack.
   */
  heldEdit: (() => void) | null;
  /** Loads a plan that arrived from a link, warning rather than overwriting if
   * the visitor already had work of their own. */
  loadSharedPlan: (plan: Plan) => void;
  /** Confirms the replacement: applies whatever edit was held, and lets
   * storage be written from now on. */
  replaceOwnWork: () => void;
  /** Refuses this one edit. The shared plan stays on screen. */
  dropHeldEdit: () => void;
  /** Abandons the shared plan and puts the visitor's own layout back. */
  restoreOwnWork: () => void;
}

const persist = (plan: Plan): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
};

/** The visitor's saved layout, or null when there is none worth keeping (an
 * empty plan is not work). */
const savedWork = (): Plan | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const plan = JSON.parse(raw) as Plan;
    return Array.isArray(plan?.placements) && plan.placements.length > 0 ? plan : null;
  } catch {
    return null;
  }
};

export const useEditor = create<EditorState>((set, get) => {
  /**
   * The only place this store writes to storage, so no action can forget that
   * nothing is written while a shared plan covers the visitor's work.
   */
  const write = (plan: Plan): void => {
    if (get().sharedOverWork) return;
    persist(plan);
  };

  return ({
  plan: emptyPlan(),
  floor: 0,
  locale: 'en',
  selectedIds: [],
  drag: null,
  marquee: null,
  clipboard: [],
  budget: null,
  notice: null,
  refuse: (reason) => set({ notice: { reason, at: Date.now() } }),
  undoStack: [],
  redoStack: [],

  dispatch: (command) => {
    const run = () => {
      const plan = applyCommand(get().plan, command);
      write(plan);
      set((s) => ({ plan, undoStack: [...s.undoStack, command], redoStack: [] }));
    };
    // A shared plan covers the visitor's saved work: hold this edit for an answer.
    if (get().sharedOverWork) { set({ heldEdit: run }); return; }
    run();
  },

  undo: () => {
    const { undoStack, plan } = get();
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const next = applyCommand(plan, invertCommand(last));
    write(next);
    set((s) => ({
      plan: next,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, last],
    }));
  },

  redo: () => {
    const { redoStack, plan } = get();
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    const next = applyCommand(plan, last);
    write(next);
    set((s) => ({
      plan: next,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, last],
    }));
  },

  setFloor: (floor) => set({ floor }),
  setLocale: (locale) => {
    set({ locale });
    // The server renders `lang="en"`; screen readers and translators read it.
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // Storage refused: the choice still applies for this visit.
    }
  },
  setWarehouse: (warehouse) => {
    const { plan } = get();
    const before = plan.warehouse;
    if (before === warehouse) return;

    // Only changes the current building; each warehouse keeps its own layout
    // through `placement.warehouse`, untouched.
    const command: Command = { kind: 'set-warehouse', before, after: warehouse };
    const next = applyCommand(plan, command);
    write(next);
    set((s) => ({
      plan: next,
      floor: 0,
      undoStack: [...s.undoStack, command],
      redoStack: [],
    }));
  },
  setBudget: (budget) => set({ budget }),
  select: (selectedIds) => set({ selectedIds }),
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((existing) => existing !== id)
        : [...s.selectedIds, id],
    })),

  startDrag: (objectId, orientation) => set({
    drag: {
      objectId,
      rotation: orientation?.rotation ?? 0,
      mirrored: orientation?.mirrored ?? false,
      cell: null,
    },
  }),
  moveDrag: (cell) => set((s) => (s.drag ? { drag: { ...s.drag, cell } } : {})),
  rotateDrag: (direction = 1) =>
    set((s) =>
      s.drag
        ? { drag: { ...s.drag, rotation: ((s.drag.rotation + direction * 90 + 360) % 360) as Rotation } }
        : {},
    ),
  mirrorDrag: (axis = 'horizontal') =>
    set((s) => (s.drag
      ? {
        drag: {
          ...s.drag,
          mirrored: !s.drag.mirrored,
          // H then R(180) sends (x, y) to (x, -y): the top-to-bottom flip.
          rotation: axis === 'vertical'
            ? ((s.drag.rotation + 180) % 360) as Rotation
            : s.drag.rotation,
        },
      }
      : {})),
  endDrag: () => set({ drag: null }),

  startMarquee: (cell) => set({ marquee: { from: cell, to: cell } }),
  moveMarquee: (cell) => set((s) => (s.marquee ? { marquee: { ...s.marquee, to: cell } } : {})),
  endMarquee: () => {
    const { marquee } = get();
    set({ marquee: null });
    return marquee;
  },

  editSelection: (edit) => {
    const { plan, selectedIds } = get();
    const commands: Command[] = [];
    for (const id of selectedIds) {
      const before = plan.placements.find((p) => p.id === id);
      if (!before) continue;
      const after = edit(before);
      if (after === before) continue;
      commands.push({ kind: 'move', id, before, after });
    }
    if (commands.length === 0) return;
    // One undo step for the whole selection.
    get().dispatch(commands.length === 1 ? commands[0]! : { kind: 'batch', commands });
  },

  copySelection: (cut = false) => {
    const { plan, selectedIds } = get();
    const clipboard = copiedShape(plan, selectedIds);
    if (clipboard.length === 0) return; // nothing selected: leave the old copy alone
    set({ clipboard });
    if (cut) get().deleteSelection();
  },

  paste: (target, catalogue, geometry) => {
    const { plan, clipboard, floor } = get();
    // Pasted onto the floor and warehouse being viewed, not the ones copied from.
    const result = pastedAt(plan, clipboard, target, catalogue, geometry, floor, plan.warehouse);
    if (!result.ok) {
      set({ notice: { reason: result.reason, at: Date.now() } });
      return false;
    }

    const commands: Command[] = result.placements.map((placement) => ({ kind: 'add', placement }));
    get().dispatch(commands.length === 1 ? commands[0]! : { kind: 'batch', commands });
    // Select what landed so it can be moved at once.
    set({ selectedIds: result.placements.map((p) => p.id) });
    return true;
  },

  rotateSelection: (direction, catalogue, geometry) => {
    const { plan, selectedIds } = get();
    return applyTransform(get, set, plan, selectedIds,
      rotatedSelection(plan, selectedIds, direction, catalogue, geometry));
  },

  mirrorSelection: (catalogue, geometry, axis) => {
    const { plan, selectedIds } = get();
    return applyTransform(get, set, plan, selectedIds,
      mirroredSelection(plan, selectedIds, catalogue, geometry, axis));
  },

  dropSelection: (placements, catalogue, geometry) => {
    const { plan, selectedIds } = get();
    // Checked with the selection lifted out, so a group may land on cells it is
    // vacating.
    return applyTransform(get, set, plan, selectedIds,
      settledSelection(plan, selectedIds, placements, catalogue, geometry));
  },

  deleteSelection: () => {
    const { plan, selectedIds } = get();
    const commands: Command[] = plan.placements
      .filter((p) => selectedIds.includes(p.id))
      .map((placement) => ({ kind: 'remove', placement }));
    if (commands.length === 0) return;
    get().dispatch(commands.length === 1 ? commands[0]! : { kind: 'batch', commands });
    set({ selectedIds: [] });
  },

  clearPlan: () => {
    const { plan } = get();
    const commands: Command[] = plan.placements.map((placement) => ({ kind: 'remove', placement }));
    // No dispatch when empty, so undo does not reverse an earlier edit instead.
    if (commands.length === 0) return;
    get().dispatch(commands.length === 1 ? commands[0]! : { kind: 'batch', commands });
    set({ selectedIds: [] });
  },

  writeNote: (cell, text) => {
    const { plan, floor } = get();
    const trimmed = text.trim();
    const existing = (plan.notes ?? []).find(
      (n) => n.warehouse === plan.warehouse && n.floor === floor
        && n.cell.x === cell.x && n.cell.y === cell.y,
    );

    if (existing === undefined) {
      if (trimmed === '') return; // nothing typed on empty ground: nothing happened
      get().dispatch({
        kind: 'note-add',
        note: { id: crypto.randomUUID(), warehouse: plan.warehouse, floor, cell, text: trimmed },
      });
      return;
    }
    if (trimmed === '') { get().dispatch({ kind: 'note-remove', note: existing }); return; }
    if (trimmed === existing.text) return; // opened and closed unchanged: not an edit
    get().dispatch({
      kind: 'note-edit', id: existing.id, before: existing, after: { ...existing, text: trimmed },
    });
  },

  reserveArea: (box, catalogue, geometry) => {
    const { plan, floor } = get();
    const objectId = zoneObjectId(Math.abs(box.to.x - box.from.x) + 1, Math.abs(box.to.y - box.from.y) + 1);
    const placement: Placement = {
      id: crypto.randomUUID(),
      objectId,
      warehouse: plan.warehouse,
      floor,
      cell: { x: Math.min(box.from.x, box.to.x), y: Math.min(box.from.y, box.to.y) },
      rotation: 0,
      tier: 1,
    };
    // Bigger than any zone may be is bigger than any warehouse: off the edge.
    const rejection = zoneSize(objectId) === null
      ? { reason: 'out-of-bounds' as const }
      : canPlace(plan, placement, catalogue, geometry);
    if (rejection) {
      set({ notice: { reason: rejection.reason, at: Date.now() } });
      return false;
    }
    get().dispatch({ kind: 'add', placement });
    set({ selectedIds: [placement.id] });
    return true;
  },

  toggleOwnedTier: (tier) => {
    // The building itself is always owned (see MANDATORY_TIERS); guarded here as
    // well as in the UI.
    if (MANDATORY_TIERS.has(tier)) return;
    const { plan } = get();
    // Absent means all owned (see Plan.ownedTiers), so the first untick
    // materialises the full list.
    const owned = plan.ownedTiers ?? [...ALL_TIERS];
    const next = {
      ...plan,
      ownedTiers: owned.includes(tier) ? owned.filter((t) => t !== tier) : [...owned, tier].sort((a, b) => a - b),
    };
    const run = () => {
      write(next);
      set({ plan: next });
    };
    // Held like any edit: it writes to storage too.
    if (get().sharedOverWork) { set({ heldEdit: run }); return; }
    run();
  },

  collapseUndo: (count) =>
    set((s) => {
      if (count < 2 || s.undoStack.length < count) return {};
      return {
        undoStack: [
          ...s.undoStack.slice(0, -count),
          { kind: 'batch', commands: s.undoStack.slice(-count) },
        ],
      };
    }),

  theme: 'dark',
  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
    if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme);
  },

  setClipboard: (shape) => set({ clipboard: shape }),

  loadPlan: (plan) => {
    persist(plan);
    set({
      plan, undoStack: [], redoStack: [], selectedIds: [], floor: 0,
      drag: null, marquee: null, sharedOverWork: false, heldEdit: null,
    });
  },

  sharedOverWork: false,
  heldEdit: null,

  loadSharedPlan: (plan) => {
    // Nothing of their own to protect: this is an ordinary load.
    if (savedWork() === null) { get().loadPlan(plan); return; }

    // Their layout stays in storage; `write` refuses until they confirm.
    set({
      plan, undoStack: [], redoStack: [], selectedIds: [], floor: 0,
      drag: null, marquee: null, sharedOverWork: true, heldEdit: null,
    });
  },

  replaceOwnWork: () => {
    const held = get().heldEdit;
    // Cleared first, so the held edit runs as a normal one and writes.
    set({ sharedOverWork: false, heldEdit: null });
    held?.();
    // With nothing held, the plan on screen was never persisted: commit it now.
    if (!held) persist(get().plan);
  },

  dropHeldEdit: () => set({ heldEdit: null }),

  restoreOwnWork: () => {
    const own = savedWork();
    // Nothing readable to go back to: stop holding edits so the visitor is not stuck.
    if (own === null) { set({ sharedOverWork: false, heldEdit: null }); return; }
    get().loadPlan(own);
  },
});
});

/**
 * Dispatches a transformed selection as one undo entry, or reports that it did
 * not fit. Shared by rotate, mirror and drop.
 */
function applyTransform(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  plan: Plan,
  selectedIds: readonly string[],
  result: TransformResult,
): boolean {
  if (!result.ok) {
    set({ notice: { reason: result.reason, at: Date.now() } });
    return false;
  }

  const commands: Command[] = [];
  for (const after of result.placements) {
    const before = plan.placements.find((p) => p.id === after.id);
    if (before) commands.push({ kind: 'move', id: after.id, before, after });
  }
  if (commands.length === 0) return false;
  get().dispatch(commands.length === 1 ? commands[0]! : { kind: 'batch', commands });
  return true;
}

/**
 * Builds the placement a drag would commit onto `floor`, or null when not over
 * a cell. `drag.cell` is the cell under the pointer; `centredAnchor` turns it
 * into the anchor, as the preview silhouette does, so both land on the same cells.
 */
export function draggedPlacement(
  drag: DragState,
  floor: number,
  warehouse: WarehouseId,
  footprint: { w: number; h: number },
): Placement | null {
  if (!drag.cell) return null;
  return {
    id: crypto.randomUUID(),
    objectId: drag.objectId,
    warehouse,
    floor,
    cell: centredAnchor(drag.cell, footprint, drag.rotation),
    rotation: drag.rotation,
    mirrored: drag.mirrored,
    tier: 1,
  };
}
