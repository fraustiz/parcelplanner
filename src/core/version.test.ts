import { describe, it, expect } from 'vitest';
import { CATALOGUE_GAME_VERSION } from './version';

describe('CATALOGUE_GAME_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof CATALOGUE_GAME_VERSION).toBe('string');
    expect(CATALOGUE_GAME_VERSION.length).toBeGreaterThan(0);
  });
});
