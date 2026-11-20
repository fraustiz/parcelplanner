import type { MetadataRoute } from 'next';

/** The site has a single page; the sitemap still tells search engines it exists. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://parcelplanner.app',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
