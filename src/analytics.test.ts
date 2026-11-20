import { afterEach, describe, it, expect, vi } from 'vitest';

// Both modules read the environment when they load, so each case sets it
// first and imports fresh copies.
const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const { default: config } = await import('../next.config');
  const analytics = await import('./analytics');
  const all = await config.rewrites!();
  const list = Array.isArray(all) ? all : [...all.beforeFiles ?? [], ...all.afterFiles ?? [], ...all.fallback ?? []];
  return { analytics, list };
};

afterEach(() => vi.unstubAllEnvs());

// The rewrites make this origin a proxy to the Umami host. A careless
// `${STATS_PATH}/:path*` would expose the whole Umami API and its login page
// under the app's domain; these pin it to the two paths the tracker needs.
describe('the analytics rewrites', () => {
  it('forward only the tracker script and the collection endpoint', async () => {
    const { analytics, list } = await load({
      PARCELPLANNER_UMAMI_ORIGIN: 'https://umami.example.com/',
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: 'site-id',
    });
    const { STATS_PATH, UMAMI_ORIGIN } = analytics;
    expect(UMAMI_ORIGIN).toBe('https://umami.example.com');
    // Sentry's wrapper adds its own tunnel rewrites; only ours are pinned.
    const rewrites = list.filter((r) => r.destination.startsWith(UMAMI_ORIGIN) || r.source.startsWith(STATS_PATH));
    expect(rewrites).toEqual([
      { source: `${STATS_PATH}/script.js`, destination: `${UMAMI_ORIGIN}/script.js` },
      { source: `${STATS_PATH}/api/send`, destination: `${UMAMI_ORIGIN}/api/send` },
    ]);
  });

  it('forward nothing when Umami is not configured', async () => {
    const { analytics, list } = await load({ PARCELPLANNER_UMAMI_ORIGIN: '', NEXT_PUBLIC_UMAMI_WEBSITE_ID: '' });
    expect(analytics.ANALYTICS_ENABLED).toBe(false);
    expect(list.filter((r) => r.source.startsWith(analytics.STATS_PATH))).toEqual([]);
  });

  it('stay off with only one half configured', async () => {
    const { analytics } = await load({ PARCELPLANNER_UMAMI_ORIGIN: 'https://umami.example.com', NEXT_PUBLIC_UMAMI_WEBSITE_ID: '' });
    expect(analytics.ANALYTICS_ENABLED).toBe(false);
  });
});
