import { describe, it, expect, afterEach, vi } from 'vitest';
import config from '../../next.config';

// The security headers are configuration, so only these tests notice them
// change. React's development build calls eval(), so `next dev` needs
// 'unsafe-eval'; production must never get it, or any XSS could execute code.

/** `process.env.NODE_ENV` is typed read-only, so it is written through a
 * widened view of the same object rather than reassigned. */
const setNodeEnv = (env: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = env;
};

const scriptSrcFor = async (env: string): Promise<string> => {
  setNodeEnv(env);
  const groups = await config.headers!();
  const csp = groups[0]!.headers.find((h) => h.key === 'Content-Security-Policy')!;
  return csp.value.split('; ').find((d) => d.startsWith('script-src'))!;
};

const original = process.env.NODE_ENV;
afterEach(() => { setNodeEnv(original ?? 'test'); });

describe('the Content-Security-Policy', () => {
  it('does NOT allow eval in production', async () => {
    expect(await scriptSrcFor('production')).toBe("script-src 'self' 'unsafe-inline'");
  });

  it('allows eval in development, where React needs it', async () => {
    expect(await scriptSrcFor('development')).toContain("'unsafe-eval'");
  });

  it('keeps the rest of the headers the same in both', async () => {
    setNodeEnv('production');
    const production = (await config.headers!())[0]!.headers;
    setNodeEnv('development');
    const development = (await config.headers!())[0]!.headers;

    // HSTS is production-only on purpose (see below).
    const without = (headers: typeof production) =>
      headers.filter((h) => h.key !== 'Content-Security-Policy' && h.key !== 'Strict-Transport-Security');
    expect(without(development)).toEqual(without(production));
  });

  it('still refuses framing, sniffing and referrers', async () => {
    setNodeEnv('production');
    const headers = (await config.headers!())[0]!.headers;
    const value = (key: string) => headers.find((h) => h.key === key)?.value;

    expect(value('X-Frame-Options')).toBe('DENY');
    expect(value('X-Content-Type-Options')).toBe('nosniff');
    expect(value('Referrer-Policy')).toBe('no-referrer');
    expect(value('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });
});

describe('HTTPS and server identification', () => {
  const hsts = async (env: string) => {
    setNodeEnv(env);
    const headers = (await config.headers!())[0]!.headers;
    return headers.find((h) => h.key === 'Strict-Transport-Security')?.value;
  };

  it('pins HTTPS in production, without subdomains or preload', async () => {
    // The admin key travels in a URL, so a first plain-HTTP request must not
    // happen again after one visit.
    expect(await hsts('production')).toBe('max-age=31536000');
  });

  it('does not pin HTTPS in development, where localhost is plain HTTP', async () => {
    expect(await hsts('development')).toBeUndefined();
  });

  it('does not announce the framework', () => {
    expect(config.poweredByHeader).toBe(false);
  });
});

describe('the canonical host', () => {
  // The legacy hosts come from the environment, read when the config loads.
  const LEGACY = 'old.example.com';
  const load = async () => {
    vi.resetModules();
    vi.stubEnv('PARCELPLANNER_LEGACY_HOSTS', ` ${LEGACY.toUpperCase()} , ,parcelplanner.app`);
    return (await import('../../next.config')).default;
  };
  afterEach(() => vi.unstubAllEnvs());
  const redirectsFor = async (host: string) => {
    const all = await (await load()).redirects!();
    return all.filter((r) => r.has?.some((h) => h.type === 'host' && h.value === host));
  };

  it('sends a former address to the canonical domain', async () => {
    // Old links must keep working: browsers reapply the #s=... fragment after
    // a redirect, so a shared plan survives without the server seeing it.
    const [rule] = await redirectsFor(LEGACY);
    expect(rule?.destination).toBe('https://parcelplanner.app/:path*');
    expect(rule?.permanent).toBe(true);
  });

  it('sends www to the bare domain', async () => {
    // Two origins would split localStorage, hiding a plan saved on one from
    // the other. One canonical host.
    const [rule] = await redirectsFor('www.parcelplanner.app');
    expect(rule?.destination).toBe('https://parcelplanner.app/:path*');
  });

  it('leaves the canonical host alone, so it cannot loop', async () => {
    expect(await redirectsFor('parcelplanner.app')).toHaveLength(0);
  });

  it('leaves localhost alone, so development still works', async () => {
    const all = await (await load()).redirects!();
    const hosts = all.flatMap((r) => r.has ?? []).map((h) => h.value);
    expect(hosts).not.toContain('localhost');
    expect(hosts.every((h) => typeof h === 'string' && !h.includes('localhost'))).toBe(true);
  });

  it('carries the whole path across', async () => {
    // /suggestions?key=... must survive too, not just the home page.
    const [rule] = await redirectsFor(LEGACY);
    expect(rule?.source).toBe('/:path*');
  });
});
