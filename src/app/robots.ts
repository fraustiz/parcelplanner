import type { MetadataRoute } from 'next';

/**
 * Crawlers may index the editor only.
 *   /suggestions  admin page; 404 without the key, but a keyed link could leak.
 *   /api          not pages, and crawling link ids would burn the read limit.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/suggestions', '/api/'],
    },
    sitemap: 'https://parcelplanner.app/sitemap.xml',
  };
}
