import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Suggestions, one dated text file each: tiny, write-once and read by a person, not queried.
 * Notes are never edited; marking one as dealt with removes it, with the admin key.
 */
/** One filed suggestion, as it is read back. */
export interface FiledSuggestion {
  /** The file it lives in, used as the handle for removing it. */
  id: string;
  /** ISO timestamp of when it arrived. */
  at: string;
  text: string;
}

/**
 * Whether `id` is shaped like a name `add` produces. Checked before `join()`, since the id comes
 * from a browser form; the pattern excludes `..` and `/`.
 */
export const isSuggestionId = (id: string): boolean =>
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9-]+Z-[A-Za-z0-9]{8}\.txt$/.test(id);

export interface SuggestionBook {
  /** Stores `text` and returns the name it was filed under. */
  add(text: string, at: Date): Promise<string>;
  /** Every suggestion, newest first. */
  list(): Promise<FiledSuggestion[]>;
  /** Removes one. Answers false for a malformed id; removing one already gone is a no-op. */
  remove(id: string): Promise<boolean>;
}

/** Beyond this many notes, writes are refused rather than allowed to fill the disk. */
const DEFAULT_MAX_SUGGESTIONS = 20_000;

export class SuggestionBookFull extends Error {
  constructor() {
    super('the suggestion book is full');
    this.name = 'SuggestionBookFull';
  }
}

export function createSuggestionBook(
  { directory, maxSuggestions = DEFAULT_MAX_SUGGESTIONS }: {
    directory: string;
    maxSuggestions?: number;
  },
): SuggestionBook {
  // Counted from disk once per process, since the volume outlives the process: a counter starting
  // at 0 on every restart would let the cap reset forever. Held as a promise so concurrent first
  // writes share one scan.
  let counted: Promise<number> | undefined;

  const countOnDisk = async (): Promise<number> => {
    try {
      return (await readdir(directory)).filter(isSuggestionId).length;
    } catch {
      return 0; // nothing written yet, as on a fresh volume
    }
  };

  return {
    async add(text, at) {
      counted ??= countOnDisk();
      if (await counted >= maxSuggestions) throw new SuggestionBookFull();

      // The timestamp orders the directory; the random tail keeps two notes sent in the same
      // millisecond from overwriting each other.
      const stamp = at.toISOString().replace(/[:.]/g, '-');
      const name = `${stamp}-${crypto.randomUUID().slice(0, 8)}.txt`;

      await mkdir(directory, { recursive: true });
      // The date is also inside the file, so a copied note keeps it.
      await writeFile(join(directory, name), `${at.toISOString()}\n\n${text}\n`, 'utf8');
      counted = Promise.resolve((await counted) + 1);
      return name;
    },

    async list() {
      let names: string[];
      try {
        names = await readdir(directory);
      } catch {
        return []; // nothing written yet, as on a fresh volume
      }

      const files = await Promise.all(
        names.filter((n) => n.endsWith('.txt')).map(async (name) => {
          const raw = await readFile(join(directory, name), 'utf8');
          const id = name;
          // `add` writes the ISO date, a blank line, then the text, so only the first blank line
          // is the boundary.
          const split = raw.indexOf('\n\n');
          return split === -1
            ? { id, at: '', text: raw.trimEnd() }
            : { id, at: raw.slice(0, split), text: raw.slice(split + 2).trimEnd() };
        }),
      );
      // Newest first, sorted on the stored date, which a copied file keeps.
      return files.sort((a, b) => b.at.localeCompare(a.at));
    },

    async remove(id) {
      if (!isSuggestionId(id)) return false;
      try {
        await unlink(join(directory, id));
      } catch {
        // Already gone.
        return true;
      }
      // Only a file that really went frees a place under the cap.
      if (counted) counted = Promise.resolve(Math.max(0, (await counted) - 1));
      return true;
    },
  };
}
