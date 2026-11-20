/**
 * Visitor counting with a self-hosted Umami, off unless configured. It only
 * answers how many people use the planner. Umami sets no cookie and stores
 * nothing on the device, so no consent banner is needed.
 *
 * Shared by next.config.ts (the rewrites) and the <Script> in layout.tsx, so
 * the browser path and the forwarded path stay the same.
 */

/** Where Umami runs. The browser never contacts it: the tracker loads and posts
 * through STATS_PATH on this origin, so the CSP stays `'self'`. */
export const UMAMI_ORIGIN = (process.env.PARCELPLANNER_UMAMI_ORIGIN ?? '').replace(/\/+$/, '');

/** Same-origin prefix the rewrites forward to UMAMI_ORIGIN. */
export const STATS_PATH = '/stats';

/** Not a secret: it appears in every page. NEXT_PUBLIC_ values are inlined at
 * build time, so set it in the build environment. */
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '';

/** Both halves or nothing: an id without an origin would load a tracker that
 * 404s, an origin without an id would proxy for no one. */
export const ANALYTICS_ENABLED = UMAMI_ORIGIN !== '' && UMAMI_WEBSITE_ID !== '';

/** Only the canonical host is counted, so dev, previews and legacy hosts add nothing. */
export const COUNTED_DOMAIN = process.env.NEXT_PUBLIC_UMAMI_DOMAIN ?? 'parcelplanner.app';
