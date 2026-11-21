import { describe, it, expect } from 'vitest';
import { callerOf } from './caller';
import { isCloudflareAddress } from './cloudflare-ips';

function request(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/link', { headers });
}

describe('who a request is from', () => {
  it('uses the visitor Cloudflare names when the proxy saw a Cloudflare edge', () => {
    const caller = callerOf(request({
      'x-forwarded-for': '203.0.113.9, 162.158.1.2',
      'cf-connecting-ip': '198.51.100.7',
    }));
    expect(caller).toBe('198.51.100.7');
  });

  it('ignores a Cloudflare header sent straight to the origin', () => {
    // The attack: a fresh made-up header per request would be a fresh rate-limit bucket.
    const caller = callerOf(request({
      'x-forwarded-for': '198.51.100.50',
      'cf-connecting-ip': '1.2.3.4',
    }));
    expect(caller).toBe('198.51.100.50');
  });

  it('is not fooled by a Cloudflare address the client put first in the chain', () => {
    // Only the last entry is written by the proxy; the first is the client's own.
    const caller = callerOf(request({
      'x-forwarded-for': '162.158.1.2, 198.51.100.50',
      'cf-connecting-ip': '1.2.3.4',
    }));
    expect(caller).toBe('198.51.100.50');
  });

  it('recognises a Cloudflare edge reaching the proxy over IPv6', () => {
    const caller = callerOf(request({
      'x-forwarded-for': '2606:4700::1',
      'cf-connecting-ip': '198.51.100.7',
    }));
    expect(caller).toBe('198.51.100.7');
  });

  it('recognises a Cloudflare edge written as an IPv4-mapped IPv6 address', () => {
    // A dual-stack proxy can report an IPv4 peer this way.
    const caller = callerOf(request({
      'x-forwarded-for': '::ffff:162.158.1.2',
      'cf-connecting-ip': '198.51.100.7',
    }));
    expect(caller).toBe('198.51.100.7');
  });

  it('falls back to unknown when nothing names the caller', () => {
    expect(callerOf(request({}))).toBe('unknown');
  });
});

describe('Cloudflare address ranges', () => {
  it('include an address inside a published range', () => {
    expect(isCloudflareAddress('162.158.0.1')).toBe(true);
  });

  it('exclude an address outside every range', () => {
    expect(isCloudflareAddress('8.8.8.8')).toBe(false);
  });

  it('reject something that is not an address at all', () => {
    expect(isCloudflareAddress('not an ip')).toBe(false);
  });
});
