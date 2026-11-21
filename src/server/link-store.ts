import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isFragmentPayload, isShortLinkId, shortLinkId, SHORT_LINK_ID_LENGTH } from '@/core/short-link';

/**
 * Where `#s=` links live: one small immutable file per shared layout, fetched by exact key.
 *
 * The directory must be a persistent volume: a store inside the container is erased on
 * every deploy, which breaks every link already sent. See docs/short-links.md.
 */

/** Thrown when the store is full; the route answers 507 so the client falls back to a `#p=` link. */
export class LinkStoreFull extends Error {
  constructor() {
    super('the short-link store is full');
    this.name = 'LinkStoreFull';
  }
}

/** At most 100 000 layouts of up to 8 000 characters each (about 800 MB), so a public write endpoint cannot fill the disk. */
const DEFAULT_MAX_ENTRIES = 100_000;

/** Files are sharded by the first two characters of the id to keep directories small. */
export const pathForId = (id: string): string => join(id.slice(0, 2), id);

export interface LinkStore {
  /** Stores a fragment payload and returns the id that fetches it back. */
  put(payload: string): Promise<string>;
  /** The payload for `id`, or null if it is unknown or malformed. */
  get(id: string): Promise<string | null>;
}

export function createLinkStore(
  { directory, maxEntries = DEFAULT_MAX_ENTRIES }: { directory: string; maxEntries?: number },
): LinkStore {
  // Counted from disk once per process, since the volume outlives restarts.
  // Held as a promise so concurrent first writes share one scan.
  let counted: Promise<number> | undefined;

  const countOnDisk = async (): Promise<number> => {
    let total = 0;
    let shards: string[];
    try {
      shards = await readdir(directory);
    } catch {
      return 0;
    }
    for (const shard of shards) {
      try {
        total += (await readdir(join(directory, shard))).length;
      } catch {
        // A stray file, not a shard directory: skip it.
      }
    }
    return total;
  };

  const read = async (id: string): Promise<string | null> => {
    try {
      return await readFile(join(directory, pathForId(id)), 'utf8');
    } catch {
      return null;
    }
  };

  return {
    async get(id) {
      // Shape-checked before join(): the id comes from a URL, and base64url has no `.` or `/`.
      if (!isShortLinkId(id)) return null;
      return read(id);
    },

    async put(payload) {
      if (!isFragmentPayload(payload)) {
        throw new Error('not a ParcelPlanner plan fragment');
      }

      // Lengthen the id until it is free or already holds this payload, so a prefix
      // collision can never serve one plan under another's link.
      for (let length = SHORT_LINK_ID_LENGTH; length <= 43; length++) {
        const id = await shortLinkId(payload, length);
        const existing = await read(id);
        if (existing === payload) return id;
        if (existing !== null) continue;

        counted ??= countOnDisk();
        if (await counted >= maxEntries) throw new LinkStoreFull();

        const file = join(directory, pathForId(id));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, payload, 'utf8');
        counted = Promise.resolve((await counted) + 1);
        return id;
      }

      // Unreachable short of a full sha-256 collision.
      throw new Error('could not find a free short-link id');
    },
  };
}
