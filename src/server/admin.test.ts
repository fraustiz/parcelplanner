import { describe, it, expect } from 'vitest';
import { isAdminKey } from './admin';

describe('isAdminKey', () => {
  it('accepts the configured key', () => {
    expect(isAdminKey('s3cret-key-value', 's3cret-key-value')).toBe(true);
  });

  it('rejects a wrong key of the same length', () => {
    expect(isAdminKey('s3cret-key-valuX', 's3cret-key-value')).toBe(false);
  });

  it('rejects a key of a different length', () => {
    expect(isAdminKey('short', 's3cret-key-value')).toBe(false);
    expect(isAdminKey('s3cret-key-value-and-more', 's3cret-key-value')).toBe(false);
  });

  it('rejects everything when no key is configured', () => {
    // An unset key means a misconfigured deployment, so the page must not exist rather than stand open.
    expect(isAdminKey('anything', undefined)).toBe(false);
    expect(isAdminKey('', undefined)).toBe(false);
    expect(isAdminKey('', '')).toBe(false);
  });

  it('rejects a missing key', () => {
    expect(isAdminKey(undefined, 's3cret-key-value')).toBe(false);
    expect(isAdminKey(null, 's3cret-key-value')).toBe(false);
  });

  it('refuses a key too short to be worth guessing against', () => {
    // A short key is guessable, so honouring one would only look protected.
    expect(isAdminKey('abcd', 'abcd')).toBe(false);
  });
});
