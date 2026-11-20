import { describe, it, expect } from 'vitest';
import { createPathCache } from './path-cache';

describe('createPathCache', () => {
  it('builds each distinct path exactly once, however often it is asked for', () => {
    // A dense plan asks for thousands of paths per frame from a handful of distinct strings
    // (500 racks: 2,539 builds from 8 strings).
    let built = 0;
    const path = createPathCache((d) => { built++; return { d }; });

    for (let i = 0; i < 1000; i++) {
      path('M6 2L6 10');
      path('M6 2L8 4');
    }

    expect(built).toBe(2);
  });

  it('gives back the very same object for the same string', () => {
    const path = createPathCache((d) => ({ d }));
    expect(path('M0 0h12')).toBe(path('M0 0h12'));
  });

  it('keeps different strings apart', () => {
    const path = createPathCache((d) => ({ d }));
    expect(path('M0 0h12')).not.toBe(path('M0 0h13'));
    expect(path('M0 0h13').d).toBe('M0 0h13');
  });

  it('caches a factory that legitimately returns undefined', () => {
    // A `get() === undefined` miss check would rebuild this every single time,
    // silently turning the cache off for whichever value it happened to be.
    let built = 0;
    const path = createPathCache(() => { built++; return undefined; });
    path('M0 0');
    path('M0 0');
    expect(built).toBe(1);
  });

  it('keeps two caches independent', () => {
    const a = createPathCache((d) => ({ d, from: 'a' }));
    const b = createPathCache((d) => ({ d, from: 'b' }));
    expect(a('M0 0').from).toBe('a');
    expect(b('M0 0').from).toBe('b');
  });
});
