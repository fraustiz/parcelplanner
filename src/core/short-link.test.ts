import { describe, it, expect } from 'vitest';
import { MAX_FRAGMENT_LENGTH } from './serialize';
import {
  isFragmentPayload,
  isShortLinkId,
  parseSharedHash,
  parseSharedLocation,
  shareTarget,
  shortLinkId,
  SHORT_LINK_ID_LENGTH,
} from './short-link';

describe('shortLinkId', () => {
  it('gives the same id to the same layout every time', async () => {
    // The id is derived from the content, so sharing the same plan twice
    // gives one copy and the same link.
    const payload = 'AwHVAQIDBAU';
    expect(await shortLinkId(payload)).toBe(await shortLinkId(payload));
  });

  it('gives different layouts different ids', async () => {
    expect(await shortLinkId('AwHVAQIDBAU')).not.toBe(await shortLinkId('AwHVAQIDBAV'));
  });

  it('is short and safe to paste in a URL', async () => {
    const id = await shortLinkId('AwHVAQIDBAU');
    expect(id).toHaveLength(SHORT_LINK_ID_LENGTH);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('can be asked for a longer id, keeping the short one as its prefix', async () => {
    // A collision is resolved by reading further into the same hash: plans
    // agreeing on eight characters will not agree on nine.
    const short = await shortLinkId('AwHVAQIDBAU');
    const longer = await shortLinkId('AwHVAQIDBAU', SHORT_LINK_ID_LENGTH + 1);
    expect(longer).toHaveLength(SHORT_LINK_ID_LENGTH + 1);
    expect(longer.startsWith(short)).toBe(true);
  });
});

describe('isShortLinkId', () => {
  it('accepts an id the app just produced', async () => {
    expect(isShortLinkId(await shortLinkId('AwHVAQIDBAU'))).toBe(true);
  });

  it('rejects anything that could escape the store directory', () => {
    // This comes from a stranger's URL and becomes a file path, so `../` must
    // be refused.
    expect(isShortLinkId('../../etc/passwd')).toBe(false);
    expect(isShortLinkId('a/b')).toBe(false);
    expect(isShortLinkId('a.b')).toBe(false);
    expect(isShortLinkId('')).toBe(false);
  });

  it('rejects an id far longer than a collision could ever need', () => {
    expect(isShortLinkId('a'.repeat(200))).toBe(false);
  });
});

describe('isFragmentPayload', () => {
  it('accepts what encodePlan produces', () => {
    expect(isFragmentPayload('AwHVAQIDBAU')).toBe(true);
  });

  it('rejects an empty payload and one past the fragment limit', () => {
    expect(isFragmentPayload('')).toBe(false);
    expect(isFragmentPayload('A'.repeat(9000))).toBe(false);
  });

  it('rejects anything that is not base64url', () => {
    // Stored verbatim and served back to whoever follows the link, so it is
    // checked on the way in.
    expect(isFragmentPayload('<script>')).toBe(false);
    expect(isFragmentPayload('A+B/C=')).toBe(false);
  });
});

describe('shareTarget', () => {
  const short = async () => 'k3n8Qw2p';
  const refuses = async () => null;
  const broken = async () => { throw new Error('offline'); };
  const big = 'A'.repeat(MAX_FRAGMENT_LENGTH + 1);

  it('uses the short link when the server took the plan', async () => {
    expect(await shareTarget('AwHVAQIDBAU', short)).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });

  it('falls back to a self-contained link when the server refuses', async () => {
    // Any server failure must cost a longer link, never the plan.
    expect(await shareTarget('AwHVAQIDBAU', refuses))
      .toEqual({ kind: 'fragment', payload: 'AwHVAQIDBAU' });
  });

  it('falls back to a self-contained link when the request throws', async () => {
    expect(await shareTarget('AwHVAQIDBAU', broken))
      .toEqual({ kind: 'fragment', payload: 'AwHVAQIDBAU' });
  });

  it('offers the file when there is no server AND the plan is too big for a URL', async () => {
    // No link at all: a download, rather than a URL that gets truncated.
    expect(await shareTarget(big, refuses)).toEqual({ kind: 'file' });
  });

  it('still prefers the short link for a plan too big for a URL', async () => {
    // With a short link, length stops mattering.
    expect(await shareTarget(big, short)).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });

  it('ignores a server that answers with something that is not an id', async () => {
    // An error page, captive portal or stale service worker: the response is
    // checked before it becomes a link.
    expect(await shareTarget('AwHVAQIDBAU', async () => '<html>'))
      .toEqual({ kind: 'fragment', payload: 'AwHVAQIDBAU' });
  });
});

describe('parseSharedHash', () => {
  it('reads a short link', () => {
    expect(parseSharedHash('#s=k3n8Qw2p')).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });

  it('reads a self-contained link', () => {
    expect(parseSharedHash('#p=AwHVAQIDBAU')).toEqual({ kind: 'fragment', payload: 'AwHVAQIDBAU' });
  });

  it('ignores a hash that is not a shared plan', () => {
    expect(parseSharedHash('')).toBeNull();
    expect(parseSharedHash('#')).toBeNull();
    expect(parseSharedHash('#section-2')).toBeNull();
  });

  it('ignores a short id that could not have come from this app', () => {
    // It would go straight from the address bar into a fetch URL.
    expect(parseSharedHash('#s=../../../etc/passwd')).toBeNull();
    expect(parseSharedHash('#s=')).toBeNull();
  });

  it('ignores a fragment payload that could not have come from this app', () => {
    expect(parseSharedHash('#p=<script>')).toBeNull();
  });
});

describe('parseSharedLocation', () => {
  it('reads a plan from a /s/ path', () => {
    // The path form lets the server see which plan was shared; a fragment
    // never reaches it.
    expect(parseSharedLocation('/s/k3n8Qw2p', '')).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });

  it('still reads the old fragment forms, which are out in the world', () => {
    expect(parseSharedLocation('/', '#s=k3n8Qw2p')).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
    expect(parseSharedLocation('/', '#p=AwHVAQIDBAU'))
      .toEqual({ kind: 'fragment', payload: 'AwHVAQIDBAU' });
  });

  it('lets a fragment win over the path, so an old link opened at /s/ still works', () => {
    expect(parseSharedLocation('/s/aaaaaaaa', '#s=k3n8Qw2p'))
      .toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });

  it('ignores an id in the path that could not have come from this app', () => {
    // It would go straight into a fetch URL, as for the fragment form.
    expect(parseSharedLocation('/s/../../etc/passwd', '')).toBeNull();
    expect(parseSharedLocation('/s/', '')).toBeNull();
    expect(parseSharedLocation('/s/short', '')).toBeNull();
  });

  it('ignores any other path', () => {
    expect(parseSharedLocation('/', '')).toBeNull();
    expect(parseSharedLocation('/suggestions', '')).toBeNull();
    expect(parseSharedLocation('/s/k3n8Qw2p/extra', '')).toBeNull();
  });

  it('tolerates a trailing slash, which browsers and chat clients add', () => {
    expect(parseSharedLocation('/s/k3n8Qw2p/', '')).toEqual({ kind: 'short', id: 'k3n8Qw2p' });
  });
});
