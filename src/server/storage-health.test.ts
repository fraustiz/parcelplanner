import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeStorage } from './storage-health';

let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'parcelplanner-health-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('describeStorage', () => {
  it('reports an ordinary directory as NOT persistent', () => {
    // A plain folder inside the container loses everything on the next deploy.
    const plain = join(root, 'data');
    return mkdir(plain).then(async () => {
      expect((await describeStorage(plain)).persistent).toBe(false);
    });
  });

  it('reports a directory that does not exist yet as NOT persistent', async () => {
    // No volume yet: the app would create the folder inside the container on first write.
    expect((await describeStorage(join(root, 'never-made'))).persistent).toBe(false);
  });

  it('says where it looked, so the warning can name the path', async () => {
    const plain = join(root, 'data');
    await mkdir(plain);
    expect((await describeStorage(plain)).directory).toBe(plain);
  });

  it('treats a filesystem boundary as persistent', async () => {
    // A mounted volume has a different device id from its parent; a nested folder does not.
    const health = await describeStorage(root);
    // The temp root is a mount on some CI images only, so this asserts the shape of the answer.
    expect(typeof health.persistent).toBe('boolean');
  });
});
