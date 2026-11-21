import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import { ANALYTICS_ENABLED, STATS_PATH, UMAMI_ORIGIN } from './src/analytics';

// Nixpacks needs a long-running process, so this uses Next's Node server
// (`next start`) rather than `output: 'export'`, which has no server to start.
const config: NextConfig = {
  images: { unoptimized: true },

  // No `X-Powered-By: Next.js`: it tells a stranger nothing they need.
  poweredByHeader: false,

  /**
   * One canonical host. `www.` and the bare domain are different origins, and
   * the editor keeps the plan in per-origin localStorage, so both answering
   * would show an empty grid on the other one.
   *
   * PARCELPLANNER_LEGACY_HOSTS (comma-separated) redirects former addresses.
   * The browser reapplies the fragment after a redirect, so `#s=` and `#p=`
   * links survive. Matching is by exact Host, so localhost and previews are
   * unaffected. Redirects are computed at build time: set the variable there.
   */
  async redirects() {
    const canonical = 'https://parcelplanner.app';
    const legacy = [
      'www.parcelplanner.app',
      ...(process.env.PARCELPLANNER_LEGACY_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter((host) => host !== '' && host !== 'parcelplanner.app'),
    ];

    return legacy.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host' as const, value: host }],
      destination: `${canonical}/:path*`,
      // Browsers cache a permanent redirect, so old hosts must keep pointing here.
      permanent: true,
    }));
  },

  /**
   * Umami's tracker and collection endpoint, served from this origin (see
   * src/analytics.ts). Only these two paths are forwarded; without Umami
   * configured, /stats/* is a 404.
   */
  async rewrites() {
    if (!ANALYTICS_ENABLED) return [];
    return [
      { source: `${STATS_PATH}/script.js`, destination: `${UMAMI_ORIGIN}/script.js` },
      { source: `${STATS_PATH}/api/send`, destination: `${UMAMI_ORIGIN}/api/send` },
    ];
  },

  async headers() {
    // React's development build needs eval() to rebuild call stacks; the
    // production build never uses it, so only `next dev` gets 'unsafe-eval'.
    const development = process.env.NODE_ENV !== 'production';
    const scriptSrc = development
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

    return [{
      source: '/(.*)',
      headers: [
        // Same-origin only. 'unsafe-inline' covers Next's bootstrap script and
        // React style props; a nonce would need per-request rendering.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            scriptSrc,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
        // Blocks framing for older browsers that ignore frame-ancestors.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // After one visit, never plain HTTP again: the admin key travels in a URL. Production
        // only, so a local http://localhost is never pinned. No includeSubDomains or preload:
        // other services may live on subdomains, and preload is hard to undo.
        ...(development ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
      ],
    }];
  },
};

/**
 * Source maps upload only when SENTRY_AUTH_TOKEN is set, so a build without
 * secrets still works (stack traces then name the minified bundle).
 */
export default withSentryConfig(config, {
  // Only used to upload source maps.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,

  // Required: the CSP is `connect-src 'self'`, so without the tunnel the
  // browser silently refuses to post events to Sentry's domain.
  tunnelRoute: '/monitoring',

  // Worth the build time: without wide upload, a stack trace names the chunk
  // rather than the function.
  widenClientFileUpload: true,

  // No token: no upload, and the build still succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },

  webpack: { treeshake: { removeDebugLogging: true } },
});
