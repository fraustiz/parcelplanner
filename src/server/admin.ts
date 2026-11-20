import { timingSafeEqual } from 'node:crypto';

/**
 * Whether `given` is the admin key, compared in constant time.
 *
 * The key travels in the URL, so it lands in browser history. It does not leak
 * through Referer: every response sends `Referrer-Policy: no-referrer` (next.config.ts).
 */

/** Below this length a key is guessable. */
const MIN_KEY_LENGTH = 16;

export function isAdminKey(given: string | null | undefined, expected: string | undefined): boolean {
  // No key configured means the page does not exist, never that it is open.
  if (!expected || expected.length < MIN_KEY_LENGTH) return false;
  if (!given) return false;

  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, so lengths are compared first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
