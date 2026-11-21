import { create } from 'zustand';
import { ALL_UNLOCKED, type Criterion } from '@/core/parcel-labels';
import { DOOR_TIMER_SECONDS, EXPORT_TRUCK_PARCELS, PARCELS_PER_TRUCK } from '@/data/deliveries';

/** What the parcel preview has counted since play was pressed. */
export interface SimStats {
  onBelt: number;
  delivered: number;
  /** Delivered through a door that should have refused them. */
  misSorted: number;
  stored: number;
  fell: number;
  /** Game seconds since play was pressed, for rates per minute. */
  seconds: number;
}

/**
 * Whether the live parcel preview is offered: only when
 * NEXT_PUBLIC_LIVE_PREVIEW is `on`, in every environment. Tests set it on (see
 * vitest.config.ts), so the code behind it stays tested.
 */
export const LIVE_PREVIEW = process.env.NEXT_PUBLIC_LIVE_PREVIEW === 'on';

/**
 * What the player tells the preview about their game: how upgraded the
 * delivery doors are, and which criteria parcels can fail so far.
 */
export interface SimSettings {
  /** Delivery Size level, 0-based into PARCELS_PER_TRUCK. */
  sizeLevel: number;
  /** Delivery Speed level, 0-based into DOOR_TIMER_SECONDS. */
  speedLevel: number;
  /** Export Size level, 0-based into EXPORT_TRUCK_PARCELS. */
  exportLevel: number;
  /** The Automatic Exports upgrade: a full export truck leaves on its own. */
  automaticExports: boolean;
  unlocked: ReadonlySet<Criterion>;
}

/** Fully upgraded doors and every criterion unlocked: what a layout has to cope with at worst. */
export const DEFAULT_SIM_SETTINGS: SimSettings = {
  sizeLevel: PARCELS_PER_TRUCK.length - 1,
  speedLevel: DOOR_TIMER_SECONDS.length - 1,
  exportLevel: EXPORT_TRUCK_PARCELS.length - 1,
  automaticExports: true,
  unlocked: ALL_UNLOCKED,
};

/** The Auto Pauser: in the game it holds parcels back on the days it is set
 * to, which is what lets racks fill. A plain pauser is opened by hand. */
export const AUTO_PAUSER = 'BP_ConveyorBelt_AutoPauser';
export const PAUSERS: ReadonlySet<string> = new Set(['BP_ConveyorBelt_Pauser', AUTO_PAUSER]);

/** Whether a pauser lets parcels through in the preview, before the player
 * says otherwise: an Auto Pauser starts closed, a plain pauser open. */
export const pauserOpensByDefault = (objectId: string): boolean => objectId !== AUTO_PAUSER;

interface SimStore {
  /** Written by the canvas, which runs the preview, and read by the inspector,
   * which shows it. `null` while no parcel is on the belts. */
  stats: SimStats | null;
  /**
   * Pausers the player opened or closed, by placement id. Only the preview
   * reads it: it is not saved with the plan, since the game sets it day by day.
   */
  pausers: Record<string, boolean>;
  setPauserOpen: (id: string, open: boolean) => void;
  /** Not saved with the plan: it describes the player's save, not the layout. */
  settings: SimSettings;
  setSettings: (change: Partial<SimSettings>) => void;
  /**
   * The delivery levels of the last game save imported, for the storage
   * planner, which keeps its own levels until a save gives some.
   */
  savedDelivery: { sizeLevel: number; speedLevel: number } | null;
  /** Sets the preview's delivery levels and the storage planner's from a save. */
  applySavedDelivery: (levels: { sizeLevel: number; speedLevel: number }) => void;
}

export const useSimStats = create<SimStore>((set) => ({
  stats: null,
  pausers: {},
  setPauserOpen: (id, open) => set((s) => ({ pausers: { ...s.pausers, [id]: open } })),
  settings: DEFAULT_SIM_SETTINGS,
  setSettings: (change) => set((s) => ({ settings: { ...s.settings, ...change } })),
  savedDelivery: null,
  applySavedDelivery: (levels) => set((s) => ({
    settings: { ...s.settings, ...levels },
    savedDelivery: { ...levels },
  })),
}));

/** Whether the pauser `id` lets parcels through right now. */
export function isPauserOpen(pausers: Readonly<Record<string, boolean>>, id: string, objectId: string): boolean {
  return pausers[id] ?? pauserOpensByDefault(objectId);
}
