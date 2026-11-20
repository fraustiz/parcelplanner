import { create } from 'zustand';

/** What the parcel preview has counted since play was pressed. */
export interface SimStats {
  onBelt: number;
  delivered: number;
  stored: number;
  fell: number;
}

/**
 * Written by the canvas, which runs the preview, and read by the inspector,
 * which shows it. `null` while no parcel is on the belts.
 */
export const useSimStats = create<{ stats: SimStats | null }>(() => ({ stats: null }));
