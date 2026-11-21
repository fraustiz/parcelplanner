import { describe, it, expect } from 'vitest';
import { isCrossSite } from './same-origin';

const request = (headers: Record<string, string>, url = 'https://parcelplanner.app/api/link') =>
  new Request(url, { method: 'POST', headers });

describe('telling another site’s page from our own', () => {
  it('trusts what the browser says in sec-fetch-site', () => {
    expect(isCrossSite(request({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
    // A sibling subdomain is still not this app.
    expect(isCrossSite(request({ 'sec-fetch-site': 'same-site' }))).toBe(true);
    expect(isCrossSite(request({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
    // Typed into the address bar or opened from a bookmark.
    expect(isCrossSite(request({ 'sec-fetch-site': 'none' }))).toBe(false);
  });

  it('prefers sec-fetch-site over a matching origin', () => {
    expect(isCrossSite(request({
      'sec-fetch-site': 'cross-site',
      origin: 'https://parcelplanner.app',
      host: 'parcelplanner.app',
    }))).toBe(true);
  });

  it('compares origin with the host header when sec-fetch-site is missing', () => {
    expect(isCrossSite(request({ origin: 'https://parcelplanner.app', host: 'parcelplanner.app' })))
      .toBe(false);
    expect(isCrossSite(request({ origin: 'https://evil.example', host: 'parcelplanner.app' })))
      .toBe(true);
    // Behind the proxy the url names the container; the host header names the site.
    expect(isCrossSite(request(
      { origin: 'https://parcelplanner.app', host: 'parcelplanner.app' },
      'http://0.0.0.0:3000/api/link',
    ))).toBe(false);
  });

  it('falls back to the request url when there is no host header', () => {
    expect(isCrossSite(request({ origin: 'https://parcelplanner.app' }))).toBe(false);
    expect(isCrossSite(request({ origin: 'https://evil.example' }))).toBe(true);
    expect(isCrossSite(request({ origin: 'http://localhost:3000' }, 'http://localhost:3000/api/link')))
      .toBe(false);
  });

  it('lets through a request with neither header, like curl', () => {
    expect(isCrossSite(request({}))).toBe(false);
  });

  it('counts an origin it cannot parse as cross-site rather than throwing', () => {
    expect(isCrossSite(request({ origin: 'null', host: 'parcelplanner.app' }))).toBe(true);
    expect(isCrossSite(request({ origin: 'not a url', host: 'parcelplanner.app' }))).toBe(true);
  });
});
