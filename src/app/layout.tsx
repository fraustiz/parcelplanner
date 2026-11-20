import type { ReactNode } from 'react';
import Script from 'next/script';
import ThemeScript from '@/components/ThemeScript';
import { ANALYTICS_ENABLED, COUNTED_DOMAIN, STATS_PATH, UMAMI_WEBSITE_ID } from '@/analytics';
import './globals.css';

/**
 * `metadataBase` makes relative URLs absolute, which Open Graph requires:
 * Discord and Reddit drop a relative image. The title leads with the game's
 * name, since that is what players search for.
 */
export const metadata = {
  metadataBase: new URL('https://parcelplanner.app'),
  title: 'ParcelPlanner · Parcel Simulator warehouse planner',
  description:
    'Free browser tool to plan your Parcel Simulator warehouse before you build it: '
    + 'both warehouses, every conveyor, what it costs, and a link to share your layout.',
  alternates: { canonical: '/' },
  // What a pasted link looks like in Discord, Reddit and chat clients.
  openGraph: {
    type: 'website',
    siteName: 'ParcelPlanner',
    title: 'Plan your Parcel Simulator warehouse before you build it',
    // The thumbnail credit is baked into public/og-card.png, since Discord
    // embeds of pasted links have no footer.
    description: 'Both warehouses, every conveyor and machine, and what your layout costs.',
    url: '/',
    // A screenshot of a real layout at 1200x630, the size every platform crops
    // to; a square logo would show as a small thumbnail.
    images: [{ url: '/og-card.png', width: 1200, height: 630, alt: 'A warehouse laid out in ParcelPlanner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plan your Parcel Simulator warehouse before you build it',
    description: 'Free, no account, runs in the browser.',
    images: ['/og-card.png'],
  },
};

/**
 * The favicon is `src/app/icon.png`, which the App Router picks up by name, so
 * `metadata` has no icon entry. The header uses a copy at /logo.png, since Next
 * only treats the one in src/app/ as an icon.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Sets data-theme on <html> before the first paint, so light mode
          never flashes dark. */}
      <head><ThemeScript /></head>
      <body>
        {children}
        {/* Visitor counting (src/analytics.ts). Both exclusions are required:
            the fragment carries plans (#p=) and link ids (#s=), and the query
            carries the admin key on /suggestions?key=. */}
        {ANALYTICS_ENABLED && <Script
          src={`${STATS_PATH}/script.js`}
          strategy="afterInteractive"
          data-website-id={UMAMI_WEBSITE_ID}
          data-host-url={STATS_PATH}
          data-domains={COUNTED_DOMAIN}
          data-exclude-hash="true"
          data-exclude-search="true"
        />}
      </body>
    </html>
  );
}
