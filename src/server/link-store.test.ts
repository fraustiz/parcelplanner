import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shortLinkId, SHORT_LINK_ID_LENGTH } from '@/core/short-link';
import { createLinkStore, LinkStoreFull, pathForId } from './link-store';

// A real directory, not a mocked fs: sharding, collisions and untrusted ids are filesystem behaviour.
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parcelplanner-links-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Every stored file, relative to the store root. */
async function entries(): Promise<string[]> {
  const found: string[] = [];
  for (const shard of await readdir(directory)) {
    for (const file of await readdir(join(directory, shard))) found.push(`${shard}/${file}`);
  }
  return found.sort();
}

describe('the short-link store', () => {
  it('gives back the payload it was given', async () => {
    const store = createLinkStore({ directory });
    const id = await store.put('AwHVAQIDBAU');
    expect(await store.get(id)).toBe('AwHVAQIDBAU');
  });

  it('stores the same layout once, however many times it is shared', async () => {
    // Content-addressed: re-sharing an unchanged plan writes nothing and returns the same id.
    const store = createLinkStore({ directory });
    const first = await store.put('AwHVAQIDBAU');
    const second = await store.put('AwHVAQIDBAU');
    expect(second).toBe(first);
    expect(await entries()).toHaveLength(1);
  });

  it('returns null for an id nobody stored', async () => {
    const store = createLinkStore({ directory });
    expect(await store.get(await shortLinkId('never-written'))).toBeNull();
  });

  it('returns null for an id shaped to escape the store directory', async () => {
    // The id comes from a URL, so path traversal such as `../../etc/passwd` must be refused.
    const store = createLinkStore({ directory });
    for (const nasty of ['../../../etc/passwd', 'a/b', '..', '']) {
      expect(await store.get(nasty)).toBeNull();
    }
  });

  it('refuses a payload that is not a plan fragment', async () => {
    const store = createLinkStore({ directory });
    await expect(store.put('<script>alert(1)</script>')).rejects.toThrow();
    expect(await entries()).toHaveLength(0);
  });

  it('lengthens the id when a different layout already holds the short one', async () => {
    // A prefix collision is staged by parking other content at the id this payload wants.
    const store = createLinkStore({ directory });
    const wanted = await shortLinkId('AwHVAQIDBAU');
    const squatted = join(directory, pathForId(wanted));
    await mkdir(join(squatted, '..'), { recursive: true });
    await writeFile(squatted, 'AAAAdifferentAAAA', 'utf8');

    const id = await store.put('AwHVAQIDBAU');

    expect(id).not.toBe(wanted);
    expect(id.startsWith(wanted)).toBe(true);
    expect(id).toHaveLength(SHORT_LINK_ID_LENGTH + 1);
    expect(await store.get(id)).toBe('AwHVAQIDBAU');
    expect(await store.get(wanted)).toBe('AAAAdifferentAAAA');
  });

  it('stops accepting new layouts once the store is full', async () => {
    // The write endpoint is public; without a ceiling a loop could fill the disk.
    const store = createLinkStore({ directory, maxEntries: 2 });
    await store.put('AAAA');
    await store.put('BBBB');
    await expect(store.put('CCCC')).rejects.toThrow(LinkStoreFull);
  });

  it('still serves, and still deduplicates, once it is full', async () => {
    // A full store degrades to read-only, and re-sharing an existing plan still succeeds.
    const store = createLinkStore({ directory, maxEntries: 1 });
    const id = await store.put('AAAA');
    await expect(store.put('BBBB')).rejects.toThrow(LinkStoreFull);
    expect(await store.get(id)).toBe('AAAA');
    expect(await store.put('AAAA')).toBe(id);
  });

  it('counts what is already on disk when it starts up', async () => {
    // The count is read from disk, since a restart keeps the volume but not the memory.
    const first = createLinkStore({ directory, maxEntries: 2 });
    await first.put('AAAA');
    await first.put('BBBB');

    const second = createLinkStore({ directory, maxEntries: 2 });
    await expect(second.put('CCCC')).rejects.toThrow(LinkStoreFull);
  });
});
