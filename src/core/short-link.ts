import { MAX_FRAGMENT_LENGTH } from './serialize';

/**
 * Identifiers for server-stored plans, the `#s=` links.
 *
 * Not an encoding: an id is a lookup key for a layout stored on the server.
 * It is derived from the payload, so the same plan shared twice gives one
 * entry and one link, and entries never change.
 */

/** Eight base64url characters, 48 bits: about one collision chance in 55 000
 * across 100 000 stored layouts. The store checks and lengthens the id if needed. */
export const SHORT_LINK_ID_LENGTH = 8;

/** An id from a URL becomes part of a file path, so its length is bounded. */
const MAX_SHORT_LINK_ID_LENGTH = 43;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * The id for a fragment payload: `length` characters of its sha-256. Longer
 * ids extend shorter ones, so resolving a collision reads further into the hash.
 */
export async function shortLinkId(
  payload: string,
  length: number = SHORT_LINK_ID_LENGTH,
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(digest)).slice(0, length);
}

/**
 * Whether `value` is shaped like an id this app produced. Checked before it is
 * joined onto a path: base64url has no `.` or `/`, so it cannot leave the store.
 */
export const isShortLinkId = (value: string): boolean =>
  value.length >= SHORT_LINK_ID_LENGTH
  && value.length <= MAX_SHORT_LINK_ID_LENGTH
  && /^[A-Za-z0-9_-]+$/.test(value);

/**
 * Whether `value` is shaped like something encodePlan produced, so the store
 * cannot hold arbitrary content. Decoding is left to decodePlan in the browser.
 */
export const isFragmentPayload = (value: string): boolean =>
  value.length > 0
  && value.length <= MAX_FRAGMENT_LENGTH
  && /^[A-Za-z0-9_-]+$/.test(value);

/** How a plan is about to be handed over. */
export type ShareTarget =
  | { kind: 'short'; id: string }
  | { kind: 'fragment'; payload: string }
  | { kind: 'file' };

/**
 * Decides how to share `payload`: a short link when the server stores it, else
 * a self-contained `#p=` link, else a file when the URL would be too long. Any
 * server failure only costs a longer link. `shorten` is injected so src/core
 * stays free of fetch.
 */
export async function shareTarget(
  payload: string,
  shorten: (payload: string) => Promise<string | null>,
): Promise<ShareTarget> {
  try {
    const id = await shorten(payload);
    if (id !== null && isShortLinkId(id)) return { kind: 'short', id };
  } catch {
    // Offline, blocked, or no server at all. Fall through.
  }
  return isFragmentPayload(payload) ? { kind: 'fragment', payload } : { kind: 'file' };
}

/**
 * Reads a shared plan out of the whole address, path and fragment.
 *
 * `/s/<id>` exists because a fragment never reaches the server, which then
 * cannot describe the plan in a link preview. The fragment is read first, so
 * `#s=` and `#p=` links work anywhere, including at a `/s/` URL.
 */
export function parseSharedLocation(
  pathname: string,
  hash: string,
): Exclude<ShareTarget, { kind: 'file' }> | null {
  const fromHash = parseSharedHash(hash);
  if (fromHash) return fromHash;

  // One trailing slash tolerated: browsers and chat clients add them freely.
  const id = pathname.replace(/\/$/, '').match(/^\/s\/([^/]+)$/)?.[1];
  if (id === undefined) return null;
  return isShortLinkId(id) ? { kind: 'short', id } : null;
}

/**
 * Reads a shared plan out of `window.location.hash`, or null. Both forms are
 * validated here: the id goes into a fetch URL, the payload into the decoder.
 */
export function parseSharedHash(hash: string): Exclude<ShareTarget, { kind: 'file' }> | null {
  const short = hash.match(/^#s=(.+)$/)?.[1];
  if (short !== undefined) return isShortLinkId(short) ? { kind: 'short', id: short } : null;

  const payload = hash.match(/^#p=(.+)$/)?.[1];
  if (payload !== undefined) {
    return isFragmentPayload(payload) ? { kind: 'fragment', payload } : null;
  }
  return null;
}
