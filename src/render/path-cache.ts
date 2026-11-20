/**
 * Builds each distinct path once and returns the same object after. `new Path2D(d)` parses and
 * allocates; the shape sheet has only 90 distinct strings, so the cache is bounded by the artwork.
 * Generic over what it builds so it can be tested without a canvas: neither node nor jsdom has Path2D.
 */
export function createPathCache<T>(make: (d: string) => T): (d: string) => T {
  const built = new Map<string, T>();
  return (d: string): T => {
    // `has` rather than a `get() === undefined` check: a factory may return undefined, and that
    // entry would otherwise be rebuilt every frame.
    if (built.has(d)) return built.get(d) as T;
    const made = make(d);
    built.set(d, made);
    return made;
  };
}
