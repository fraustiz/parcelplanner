/**
 * A fixed-window counter per caller, held in memory.
 *
 * Per process: correct for a single Node process. Behind several instances the effective
 * limit multiplies, and the counter should move to shared storage.
 * It guards against a loop filling the disk, not for fairness: a burst across a window
 * boundary briefly gets double the limit.
 */
export function createRateLimiter(
  { limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number },
) {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    /** Whether `caller` may make a request now, counting it if so. */
    allow(caller: string): boolean {
      const time = now();

      // Swept on every call, not on a timer, so a long-running process does not keep
      // one entry per address ever seen.
      for (const [key, window] of windows) {
        if (time - window.start >= windowMs) windows.delete(key);
      }

      // One path for the first request and the rest, so a limit of 0 refuses the first request too.
      const window = windows.get(caller) ?? { start: time, count: 0 };
      if (window.count >= limit) return false;
      window.count++;
      windows.set(caller, window);
      return true;
    },

    /** How many callers are tracked, exposed so tests can observe eviction. */
    size: (): number => windows.size,
  };
}
