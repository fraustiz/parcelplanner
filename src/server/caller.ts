import { isCloudflareAddress } from './cloudflare-ips';

/** The caller's address: the key every rate limiter counts against. */
export function callerOf(request: Request): string {
  // The proxy appends the peer it saw to x-forwarded-for, so only the last entry is trustworthy.
  // The first one is whatever the client invented.
  const peer = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? '';

  // Behind Cloudflare that peer is an edge shared by everyone, so the visitor is in Cloudflare's
  // header instead. Anyone reaching the origin directly can write that header, but not the peer,
  // so the header counts only when the peer proves the request came from a Cloudflare edge.
  const cloudflare = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflare && isCloudflareAddress(peer)) return cloudflare;

  return peer || 'unknown';
}
