import { join } from 'node:path';
import { createLinkStore } from './link-store';
import { createSuggestionBook } from './suggestion-store';
import { createRateLimiter } from './rate-limit';

/** The store and limiters shared by the route handlers, module-level so they live as long as the process. */

/**
 * Where shared layouts live. In production this must be a persistent volume: a store inside
 * the container is wiped on every deploy and every `#s=` link stops working. See docs/short-links.md.
 */
export const DATA_ROOT = process.env.PARCELPLANNER_DATA_DIR ?? join(process.cwd(), '.data');
const dataRoot = DATA_ROOT;

export const linkStore = createLinkStore({
  directory: process.env.PARCELPLANNER_LINK_DIR ?? join(dataRoot, 'links'),
});

/** Sixty link reads a minute per address: far above a person, far below a script walking the id space. */
export const linkReadLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** Twenty admin attempts a minute per address, successes included. */
export const adminLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

/** Thirty shares a minute per address: far above ordinary use, far below filling a disk. */
export const linkLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Suggestions live beside the shared plans, under the same volume. */
export const suggestionBook = createSuggestionBook({
  directory: process.env.PARCELPLANNER_SUGGESTION_DIR ?? join(dataRoot, 'suggestions'),
});

/** Five suggestions a minute per address. */
export const suggestionLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

/**
 * Optional Discord webhook that announces suggestions; without it notes still land on disk.
 * Server-side only: anyone holding this URL can post to the channel.
 */
export const SUGGESTION_WEBHOOK = process.env.PARCELPLANNER_DISCORD_WEBHOOK;

/**
 * The key that opens /suggestions. Unset, the page does not exist at all.
 * Must be at least 16 characters (see isAdminKey).
 */
export const SUGGESTION_ADMIN_KEY = process.env.PARCELPLANNER_ADMIN_KEY;
