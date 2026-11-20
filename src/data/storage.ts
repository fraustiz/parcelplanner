/**
 * How many parcels each storage rack holds, reported from the game.
 *
 * The ids are offset by one from the displayed names:
 *
 *     BP_StorageRack_Medium      is displayed "Storage Rack (Small)"
 *     BP_StorageRack_Large       is displayed "Storage Rack (Medium)"
 *     BP_StorageRack_ExtraLarge  is displayed "Storage Rack (Large)"
 *
 * Capacities (small 8, medium 12, large 16) are reported by displayed name, and the test pins them
 * to it. All three are 1x3, so a bigger rack buys capacity: $500/$900/$1600 for 8/12/16.
 */
export const STORAGE_CAPACITY: Readonly<Record<string, number>> = {
  BP_StorageRack_Medium: 8,
  BP_StorageRack_Large: 12,
  BP_StorageRack_ExtraLarge: 16,
};

/** Parcels this object holds, 0 for anything that is not a rack. */
export const storageCapacityOf = (objectId: string): number =>
  STORAGE_CAPACITY[objectId] ?? 0;
