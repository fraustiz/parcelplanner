import { create } from 'zustand';

/** What the parcel preview has counted since play was pressed. */
export interface SimStats {
  onBelt: number;
  delivered: number;
  stored: number;
  fell: number;
  /** Game seconds since play was pressed, for rates per minute. */
  seconds: number;
}

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
}

export const useSimStats = create<SimStore>((set) => ({
  stats: null,
  pausers: {},
  setPauserOpen: (id, open) => set((s) => ({ pausers: { ...s.pausers, [id]: open } })),
}));

/** Whether the pauser `id` lets parcels through right now. */
export function isPauserOpen(pausers: Readonly<Record<string, boolean>>, id: string, objectId: string): boolean {
  return pausers[id] ?? pauserOpensByDefault(objectId);
}
