import { describe, it, expect } from 'vitest';
import { withoutFragment } from './scrub-url';

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
