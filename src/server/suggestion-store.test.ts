import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSuggestionBook, SuggestionBookFull } from './suggestion-store';

// A real directory, not a mocked fs: the cap is about what survives on disk between processes.
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parcelplanner-suggestions-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('the suggestion book cap', () => {
  it('counts notes an earlier process left on disk', async () => {
    // A restart is a new book over the same volume; it must not start counting from zero.
    const earlier = createSuggestionBook({ directory, maxSuggestions: 2 });
    await earlier.add('one', new Date('2026-11-21T10:00:00Z'));
    await earlier.add('two', new Date('2026-11-21T10:00:01Z'));

    const restarted = createSuggestionBook({ directory, maxSuggestions: 2 });
    await expect(restarted.add('three', new Date('2026-11-21T10:00:02Z')))
      .rejects.toBeInstanceOf(SuggestionBookFull);
  });

  it('makes room again once a note is removed', async () => {
    const earlier = createSuggestionBook({ directory, maxSuggestions: 2 });
    const first = await earlier.add('one', new Date('2026-11-21T10:00:00Z'));
    await earlier.add('two', new Date('2026-11-21T10:00:01Z'));

    const restarted = createSuggestionBook({ directory, maxSuggestions: 2 });
    await expect(restarted.add('three', new Date('2026-11-21T10:00:02Z')))
      .rejects.toBeInstanceOf(SuggestionBookFull);
    expect(await restarted.remove(first)).toBe(true);
    await expect(restarted.add('three', new Date('2026-11-21T10:00:03Z'))).resolves.toMatch(/\.txt$/);
  });

  it('does not count files that are not suggestions', async () => {
    // Something an operator left in the volume must not eat into the cap.
    await writeFile(join(directory, 'notes.md'), 'operator notes', 'utf8');
    await writeFile(join(directory, 'backup.txt'), 'not a suggestion name', 'utf8');

    const book = createSuggestionBook({ directory, maxSuggestions: 1 });
    await expect(book.add('one', new Date('2026-11-21T10:00:00Z'))).resolves.toMatch(/\.txt$/);
  });
});
