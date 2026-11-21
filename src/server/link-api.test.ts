import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FRAGMENT_LENGTH } from '@/core/serialize';
import { handleFetch, handleShare } from './link-api';
import { createLinkStore, type LinkStore } from './link-store';
import { createRateLimiter } from './rate-limit';

let directory: string;
let store: LinkStore;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'parcelplanner-api-'));
  store = createLinkStore({ directory });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** A limiter that never trips, for tests not about limiting. */
const open = () => createRateLimiter({ limit: 1000, windowMs: 60_000, now: () => 0 });

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/link', { method: 'POST', body, headers });

/** A chunked body: a stream sends no content-length, so only a capped read can refuse it. */
const streamed = (url: string, size: number) =>
  new Request(url, {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('A'.repeat(size)));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);

describe('sharing a plan to the server', () => {
  it('stores the payload and answers with the id that fetches it', async () => {
    const response = await handleShare(post('AwHVAQIDBAU'), { store, limiter: open() });
    expect(response.status).toBe(200);
    const { id } = await response.json() as { id: string };
    expect(await store.get(id)).toBe('AwHVAQIDBAU');
  });

  it('refuses a body that is not a plan fragment', async () => {
    // The endpoint is public, so it must not store arbitrary content.
    const response = await handleShare(post('<script>alert(1)</script>'), { store, limiter: open() });
    expect(response.status).toBe(400);
  });

  it('refuses an oversized body before reading it', async () => {
    // The declared length is checked before the body is read.
    const response = await handleShare(
      post('A', { 'content-length': String(MAX_FRAGMENT_LENGTH + 1) }),
      { store, limiter: open() },
    );
    expect(response.status).toBe(400);
  });

  it('refuses an oversized body that lied about its length', async () => {
    const response = await handleShare(post('A'.repeat(MAX_FRAGMENT_LENGTH + 1)), { store, limiter: open() });
    expect(response.status).toBe(400);
  });

  it('refuses an oversized chunked body that declares no length', async () => {
    const request = streamed('http://localhost/api/link', MAX_FRAGMENT_LENGTH + 1);
    expect(request.headers.get('content-length')).toBeNull();
    const response = await handleShare(request, { store, limiter: open() });
    expect(response.status).toBe(400);
  });

  it('says the store is full rather than pretending the link works', async () => {
    // 507, not 500: the client falls back to a self-contained `#p=` link instead of an error.
    const full = createLinkStore({ directory, maxEntries: 0 });
    const response = await handleShare(post('AwHVAQIDBAU'), { store: full, limiter: open() });
    expect(response.status).toBe(507);
  });

  it('turns away a caller making too many requests', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect((await handleShare(post('AAAA', headers), { store, limiter })).status).toBe(200);
    expect((await handleShare(post('BBBB', headers), { store, limiter })).status).toBe(429);
  });

  it('counts callers by their forwarded address, not by the proxy', async () => {
    // Behind a reverse proxy every request arrives from the same socket.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const first = await handleShare(post('AAAA', { 'x-forwarded-for': '1.2.3.4' }), { store, limiter });
    const second = await handleShare(post('BBBB', { 'x-forwarded-for': '5.6.7.8' }), { store, limiter });
    expect([first.status, second.status]).toEqual([200, 200]);
  });

  it('reads the address the PROXY appended, not the one the client claimed', async () => {
    // The proxy appends the real peer to x-forwarded-for, so only the last entry
    // is trustworthy. Reading the first would let a caller dodge the limiter.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const spoofA = { 'x-forwarded-for': '6.6.6.1, 9.9.9.9' };
    const spoofB = { 'x-forwarded-for': '6.6.6.2, 9.9.9.9' };
    expect((await handleShare(post('AAAA', spoofA), { store, limiter })).status).toBe(200);
    expect((await handleShare(post('BBBB', spoofB), { store, limiter })).status).toBe(429);
  });
});

describe('following a shared link', () => {
  it('gives back exactly what was stored', async () => {
    const id = await store.put('AwHVAQIDBAU');
    const response = await handleFetch(id, { store });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('AwHVAQIDBAU');
  });

  it('tells caches the answer never changes', async () => {
    // Entries are content-addressed, so they can be cached as immutable.
    const id = await store.put('AwHVAQIDBAU');
    const response = await handleFetch(id, { store });
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('answers 404 for an id nobody stored', async () => {
    const response = await handleFetch('AAAAAAAA', { store });
    expect(response.status).toBe(404);
  });

  it('answers 404 for an id shaped to escape the store', async () => {
    const response = await handleFetch('../../../etc/passwd', { store });
    expect(response.status).toBe(404);
  });
});

describe('reading links is bounded too', () => {
  const get = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/link/abc', { headers });

  it('turns away a caller reading far too many', async () => {
    // A loop over ids costs a disk seek each, so reads are bounded too.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const id = await store.put('AwHVAQIDBAU');
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    expect((await handleFetch(id, { store, limiter, request: get(headers) })).status).toBe(200);
    expect((await handleFetch(id, { store, limiter, request: get(headers) })).status).toBe(429);
  });

  it('says how long to wait', async () => {
    const limiter = createRateLimiter({ limit: 0, windowMs: 60_000, now: () => 0 });
    const response = await handleFetch('abc', { store, limiter, request: get() });
    expect(response.headers.get('retry-after')).toBe('60');
  });

  it('still serves when no limiter is given at all', async () => {
    // The limiter is optional for callers such as tests and scripts.
    const id = await store.put('AwHVAQIDBAU');
    expect((await handleFetch(id, { store })).status).toBe(200);
  });
});

describe('who the caller is, behind Cloudflare', () => {
  it('prefers CF-Connecting-IP over the forwarded chain', async () => {
    // Behind Cloudflare the last x-forwarded-for entry is a shared edge IP.
    // CF-Connecting-IP is set by Cloudflare and cannot be forged by the client.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    const edge = '172.67.135.27';
    const one = post('AAAA', { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': `1.1.1.1, ${edge}` });
    const two = post('BBBB', { 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': `2.2.2.2, ${edge}` });

    expect((await handleShare(one, { store, limiter })).status).toBe(200);
    expect((await handleShare(two, { store, limiter })).status).toBe(200);
  });

  it('still falls back to the forwarded chain with no Cloudflare in front', async () => {
    // Without Cloudflare in front, the last x-forwarded-for entry is still used.
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect((await handleShare(post('AAAA', { 'x-forwarded-for': '1.2.3.4' }), { store, limiter })).status).toBe(200);
    expect((await handleShare(post('BBBB', { 'x-forwarded-for': '1.2.3.4' }), { store, limiter })).status).toBe(429);
  });
});
