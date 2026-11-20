import { stat } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Whether the data directory will survive the container being recreated. Losing it raises no
 * error (links stop resolving, suggestions vanish), so the admin page reports it.
 * A mounted volume sits on its own device, so its device id differs from its parent's.
 */
export interface StorageHealth {
  directory: string;
  /** False when the directory lives inside the container's own filesystem. */
  persistent: boolean;
}

export async function describeStorage(directory: string): Promise<StorageHealth> {
  try {
    const here = await stat(directory);
    const above = await stat(dirname(directory));
    return { directory, persistent: here.dev !== above.dev };
  } catch {
    // Not created yet: it would be created inside the container, so it is not persisted.
    return { directory, persistent: false };
  }
}
