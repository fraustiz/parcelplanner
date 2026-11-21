/**
 * Sentry's tunnel (`tunnelRoute: '/monitoring'` in next.config.ts rewrites here).
 *
 * Without this file the SDK installs a rewrite that relays to whichever Sentry
 * org and project the caller names in the query, forwarding visitor headers
 * and cookies. With it, the SDK's handler forwards only the event payload, and
 * only for this app's own DSN.
 */
export { POST } from '@sentry/nextjs/tunnel';

export const runtime = 'nodejs';
