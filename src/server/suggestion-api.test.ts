import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleSuggestion, handleSuggestionDone } from './suggestion-api';
import { createSuggestionBook } from './suggestion-store';
import { createRateLimiter } from './rate-limit';

let directory: string;
let book: ReturnType<typeof createSuggestionBook>;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parcelplanner-suggestions-'));
  book = createSuggestionBook({ directory });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const open = () => createRateLimiter({ limit: 1000, windowMs: 60_000, now: () => 0 });

const post = (text: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/suggestion', { method: 'POST', body: text, headers });

/** Everything written to the book, oldest first. */
async function stored(): Promise<string[]> {
  const files = (await readdir(directory)).sort();
  return Promise.all(files.map((f) => readFile(join(directory, f), 'utf8')));
}

describe('receiving a suggestion', () => {
  it('keeps it, and says so', async () => {
    const response = await handleSuggestion(post('Add a dark mode'), { book, limiter: open() });
    expect(response.status).toBe(200);
    expect((await stored())[0]).toContain('Add a dark mode');
  });

  it('records when it arrived, so the file is readable on its own', async () => {
    await handleSuggestion(post('Something'), { book, limiter: open() });
    // Each note carries an ISO date.
    expect((await stored())[0]).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps two suggestions sent in the same millisecond as two files', async () => {
    // Two notes in the same instant must not overwrite each other.
    await Promise.all([
      handleSuggestion(post('first'), { book, limiter: open() }),
      handleSuggestion(post('second'), { book, limiter: open() }),
    ]);
    expect(await readdir(directory)).toHaveLength(2);
  });

  it('refuses an empty suggestion', async () => {
    const response = await handleSuggestion(post('   '), { book, limiter: open() });
    expect(response.status).toBe(400);
    expect(await stored()).toHaveLength(0);
  });

  it('refuses one past the length limit before reading the body', async () => {
    const response = await handleSuggestion(
      post('a', { 'content-length': '999999' }), { book, limiter: open() },
    );
    expect(response.status).toBe(400);
  });

  it('turns away a caller sending too many', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect((await handleSuggestion(post('one', headers), { book, limiter })).status).toBe(200);
    expect((await handleSuggestion(post('two', headers), { book, limiter })).status).toBe(429);
  });
});

describe('forwarding a suggestion to Discord', () => {
  const webhook = 'https://discord.com/api/webhooks/test';

  it('posts it, with every mention disabled', async () => {
    // allowed_mentions backs up cleanSuggestion: the webhook must never ping anyone.
    const fetched = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => new Response('', { status: 204 }),
    );
    await handleSuggestion(post('Add a dark mode'), { book, limiter: open(), webhook, fetch: fetched });

    expect(fetched).toHaveBeenCalledOnce();
    const [url, init] = fetched.mock.calls[0]!;
    expect(url).toBe(webhook);
    const body = JSON.parse(String(init?.body));
    expect(body.content).toContain('Add a dark mode');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('still keeps the suggestion when Discord is down', async () => {
    // The disk is the record; a failed webhook must not lose the note.
    const fetched = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
      throw new Error('offline');
    });
    const response = await handleSuggestion(
      post('Add a dark mode'), { book, limiter: open(), webhook, fetch: fetched },
    );
    expect(response.status).toBe(200);
    expect((await stored())[0]).toContain('Add a dark mode');
  });

  it('works with no webhook configured at all', async () => {
    const response = await handleSuggestion(post('Add a dark mode'), { book, limiter: open() });
    expect(response.status).toBe(200);
    expect((await stored())[0]).toContain('Add a dark mode');
  });
});

describe('reading the suggestions back', () => {
  it('gives them newest first, so the page opens on what just arrived', async () => {
    await book.add('oldest', new Date('2026-01-01T10:00:00Z'));
    await book.add('newest', new Date('2026-07-01T10:00:00Z'));
    const listed = await book.list();
    expect(listed.map((s) => s.text)).toEqual(['newest', 'oldest']);
  });

  it('carries the date each one arrived', async () => {
    await book.add('something', new Date('2026-03-04T05:06:07Z'));
    expect((await book.list())[0]?.at).toBe('2026-03-04T05:06:07.000Z');
  });

  it('reads back exactly what was written, accents and newlines included', async () => {
    const written = 'Génial !\nMais le zoom est trop rapide.';
    await book.add(written, new Date());
    expect((await book.list())[0]?.text).toBe(written);
  });

  it('gives an empty list when nobody has written anything', async () => {
    // Including before the directory exists, as on a fresh volume.
    expect(await book.list()).toEqual([]);
  });
});

describe('marking a suggestion as dealt with', () => {
  const KEY = 'a-long-enough-admin-key';

  const del = (body: Record<string, string>) =>
    new Request('http://localhost/api/suggestion/done', {
      method: 'POST',
      body: new URLSearchParams(body),
    });

  it('removes it, so the page stops showing it', async () => {
    await book.add('deal with me', new Date());
    const [only] = await book.list();

    const response = await handleSuggestionDone(
      del({ id: only!.id, key: KEY }), { book, adminKey: KEY },
    );

    expect(response.status).toBe(303);
    expect(await book.list()).toHaveLength(0);
  });

  it('leaves the others alone', async () => {
    await book.add('keep me', new Date('2026-01-01T00:00:00Z'));
    await book.add('remove me', new Date('2026-02-01T00:00:00Z'));
    const target = (await book.list()).find((s) => s.text === 'remove me')!;

    await handleSuggestionDone(del({ id: target.id, key: KEY }), { book, adminKey: KEY });

    expect((await book.list()).map((s) => s.text)).toEqual(['keep me']);
  });

  it('refuses without the admin key, and removes nothing', async () => {
    await book.add('still here', new Date());
    const [only] = await book.list();

    const response = await handleSuggestionDone(
      del({ id: only!.id, key: 'wrong-but-long-enough' }), { book, adminKey: KEY },
    );

    expect(response.status).toBe(404);
    expect(await book.list()).toHaveLength(1);
  });

  it('refuses an id shaped to reach outside the directory', async () => {
    // The id comes from a form and is joined onto a path, so remove() checks its shape.
    for (const nasty of ['../../../etc/passwd', 'a/b.txt', '..', '']) {
      const response = await handleSuggestionDone(
        del({ id: nasty, key: KEY }), { book, adminKey: KEY },
      );
      expect(response.status).toBe(400);
    }
  });

  it('shrugs at an id that is already gone', async () => {
    // Removing an already removed note (two tabs) is a no-op, not an error.
    const response = await handleSuggestionDone(
      del({ id: '2026-01-01T00-00-00-000Z-abcdef01.txt', key: KEY }), { book, adminKey: KEY },
    );
    expect(response.status).toBe(303);
  });

  it('sends the reader back to the page, still holding the key', async () => {
    await book.add('done', new Date());
    const [only] = await book.list();

    const response = await handleSuggestionDone(
      del({ id: only!.id, key: KEY }), { book, adminKey: KEY },
    );

    expect(response.headers.get('location')).toBe(`/suggestions?key=${encodeURIComponent(KEY)}`);
  });
});

describe('guessing at the admin key', () => {
  const KEY = 'a-long-enough-admin-key';

  const attempt = (key: string, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/suggestion/done', {
      method: 'POST',
      body: new URLSearchParams({ id: 'x', key }),
      headers,
    });

  it('stops a caller trying key after key', async () => {
    // The key check itself is rate-limited, so a script cannot guess as fast as the server answers.
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 0 });
    const from = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < 3; i++) {
      const r = await handleSuggestionDone(attempt(`guess-${i}-padding`, from), { book, adminKey: KEY, limiter });
      expect(r.status).toBe(404); // wrong key
    }
    const blocked = await handleSuggestionDone(attempt('guess-4-padding', from), { book, adminKey: KEY, limiter });
    expect(blocked.status).toBe(429);
  });

  it('counts a correct key against the same budget', async () => {
    // A correct key counts too, so wrong guesses before it are not free.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const from = { 'x-forwarded-for': '8.8.8.8' };
    await book.add('one', new Date());
    const [only] = await book.list();
    const first = new Request('http://localhost/api/suggestion/done', {
      method: 'POST', body: new URLSearchParams({ id: only!.id, key: KEY }), headers: from,
    });
    expect((await handleSuggestionDone(first, { book, adminKey: KEY, limiter })).status).toBe(303);
    expect((await handleSuggestionDone(attempt(KEY, from), { book, adminKey: KEY, limiter })).status).toBe(429);
  });

  it('works with no limiter, as a direct call', async () => {
    await book.add('one', new Date());
    const [only] = await book.list();
    const r = new Request('http://localhost/api/suggestion/done', {
      method: 'POST', body: new URLSearchParams({ id: only!.id, key: KEY }),
    });
    expect((await handleSuggestionDone(r, { book, adminKey: KEY })).status).toBe(303);
  });
});
