import { isFragmentPayload } from '@/core/short-link';
import { callerOf } from './caller';
import { MAX_FRAGMENT_LENGTH } from '@/core/serialize';
import { LinkStoreFull, type LinkStore } from './link-store';
import type { createRateLimiter } from './rate-limit';

/**
 * The HTTP handlers behind `#s=` links, written against `Request`/`Response` rather than Next
 * so they can be tested against a real store. The route files under src/app are thin adapters.
 */

type Limiter = ReturnType<typeof createRateLimiter>;


export async function handleShare(
  request: Request,
  { store, limiter }: { store: LinkStore; limiter: Limiter },
): Promise<Response> {
  if (!limiter.allow(callerOf(request))) {
    return new Response('too many requests', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  // Checked before the body is buffered. A body that lies about its size is caught by isFragmentPayload.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_FRAGMENT_LENGTH) {
    return new Response('payload too large', { status: 400 });
  }

  const payload = await request.text();
  if (!isFragmentPayload(payload)) {
    return new Response('not a ParcelPlanner plan fragment', { status: 400 });
  }

  try {
    return Response.json({ id: await store.put(payload) });
  } catch (error) {
    // 507, not 500, so the client can tell "no room" from "broken" and fall back to a `#p=` link.
    if (error instanceof LinkStoreFull) {
      return new Response('the short-link store is full', { status: 507 });
    }
    throw error;
  }
}

export async function handleFetch(
  id: string,
  { store, limiter, request }: {
    store: LinkStore;
    /** Optional so tests and scripts can call this without a limiter. */
    limiter?: Limiter;
    request?: Request;
  },
): Promise<Response> {
  // Reads are limited too: a loop over ids costs a disk seek each, and the disk ceiling only counts writes.
  if (limiter && !limiter.allow(request ? callerOf(request) : 'unknown')) {
    return new Response('too many requests', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  const payload = await store.get(id);
  if (payload === null) return new Response('no such link', { status: 404 });

  return new Response(payload, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // An entry is named by the hash of its content, so it never changes.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
