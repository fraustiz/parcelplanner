import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit';

// The clock is injected so these run instantly and deterministically.
function at(times: number[]): () => number {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)]!;
}

describe('the write rate limiter', () => {
  it('lets an ordinary burst of sharing through', () => {
    const limit = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => 0 });
    for (let i = 0; i < 5; i++) expect(limit.allow('1.2.3.4')).toBe(true);
  });

  it('refuses the request past the limit', () => {
    const limit = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 0 });
    limit.allow('1.2.3.4');
    limit.allow('1.2.3.4');
    limit.allow('1.2.3.4');
    expect(limit.allow('1.2.3.4')).toBe(false);
  });

  it('counts each caller separately', () => {
    // One person sharing a lot must not lock everyone else out.
    const limit = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limit.allow('1.2.3.4')).toBe(true);
    expect(limit.allow('1.2.3.4')).toBe(false);
    expect(limit.allow('5.6.7.8')).toBe(true);
  });

  it('refuses everything at a limit of zero', () => {
    // A limit of 0 must refuse even the first request.
    const limit = createRateLimiter({ limit: 0, windowMs: 60_000, now: () => 0 });
    expect(limit.allow('1.2.3.4')).toBe(false);
    expect(limit.allow('1.2.3.4')).toBe(false);
  });

  it('forgives once the window has passed', () => {
    const limit = createRateLimiter({ limit: 1, windowMs: 1000, now: at([0, 500, 1001]) });
    expect(limit.allow('1.2.3.4')).toBe(true);
    expect(limit.allow('1.2.3.4')).toBe(false);
    expect(limit.allow('1.2.3.4')).toBe(true);
  });

  it('forgets callers it has not heard from, instead of growing forever', () => {
    // Without eviction, one-request addresses would leak memory in a long-running process.
    const clock = at([0, 0, 10_000]);
    const limit = createRateLimiter({ limit: 1, windowMs: 1000, now: clock });
    limit.allow('1.1.1.1');
    limit.allow('2.2.2.2');
    limit.allow('3.3.3.3');
    expect(limit.size()).toBe(1);
  });
});
