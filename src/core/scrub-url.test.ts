import { describe, it, expect } from 'vitest';
import { withoutFragment, withoutPrivateParts } from './scrub-url';

describe('taking the fragment off a url before it leaves the browser', () => {
  it('drops a shared plan', () => {
    // A `#p=` fragment carries the whole warehouse, and crash reporters send
    // the full URL, so it must be removed.
    expect(withoutFragment('https://parcelplanner.app/#p=eJyrVkrLz1eyUsooKSmw0tc'))
      .toBe('https://parcelplanner.app/');
  });

  it('drops a short link id too', () => {
    // It still names one specific plan.
    expect(withoutFragment('https://parcelplanner.app/s/abc123#s=abc123'))
      .toBe('https://parcelplanner.app/s/abc123');
  });

  it('leaves a plain url alone', () => {
    expect(withoutFragment('https://parcelplanner.app/')).toBe('https://parcelplanner.app/');
  });

  it('keeps the path and query, which carry nothing of anyone else', () => {
    expect(withoutFragment('https://parcelplanner.app/a/b?c=1#secret'))
      .toBe('https://parcelplanner.app/a/b?c=1');
  });

  it('handles a bare fragment and an empty one', () => {
    expect(withoutFragment('https://parcelplanner.app/#')).toBe('https://parcelplanner.app/');
    expect(withoutFragment('#p=only-a-fragment')).toBe('');
  });

  it('gives back anything it cannot parse rather than throwing', () => {
    // This runs inside a crash reporter, where throwing would lose the report.
    expect(withoutFragment('')).toBe('');
    expect(withoutFragment('not a url at all')).toBe('not a url at all');
  });
});

describe('taking every private part off a url before it reaches a crash reporter', () => {
  it('drops the fragment like withoutFragment', () => {
    expect(withoutPrivateParts('https://parcelplanner.app/#p=eJyrVkrLz1eyUsooKSmw0tc'))
      .toBe('https://parcelplanner.app/');
  });

  it('hides a short link id in a page path', () => {
    // Each id opens someone's stored plan, so it is as private as `#s=`.
    expect(withoutPrivateParts('https://parcelplanner.app/s/abc_12-3#s=abc_12-3'))
      .toBe('https://parcelplanner.app/s/:id');
    expect(withoutPrivateParts('https://parcelplanner.app/s/abc123/opengraph-image'))
      .toBe('https://parcelplanner.app/s/:id/opengraph-image');
  });

  it('hides a short link id in an api path, absolute or bare', () => {
    expect(withoutPrivateParts('https://parcelplanner.app/api/link/abc123'))
      .toBe('https://parcelplanner.app/api/link/:id');
    expect(withoutPrivateParts('/api/link/abc123?x=1')).toBe('/api/link/:id?x=1');
    expect(withoutPrivateParts('http://localhost:3000/s/abc123')).toBe('http://localhost:3000/s/:id');
  });

  it('leaves other paths alone, including ones that merely contain s/', () => {
    expect(withoutPrivateParts('https://parcelplanner.app/assets/abc')).toBe('https://parcelplanner.app/assets/abc');
    expect(withoutPrivateParts('https://parcelplanner.app/api/link')).toBe('https://parcelplanner.app/api/link');
    expect(withoutPrivateParts('https://parcelplanner.app/suggestions')).toBe('https://parcelplanner.app/suggestions');
  });

  it('gives back anything it cannot parse rather than throwing', () => {
    expect(withoutPrivateParts('')).toBe('');
    expect(withoutPrivateParts('not a url at all')).toBe('not a url at all');
  });
});
