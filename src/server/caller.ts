/** The caller's address: the key every rate limiter counts against. */
export function callerOf(request: Request): string {
  // Cloudflare first: behind it, the forwarded chain ends in an edge IP shared by everyone.
  // Cloudflare sets this header itself and strips any the client sent, so it cannot be forged.
  const cloudflare = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflare) return cloudflare;

  // Without a CDN, the proxy appends the real peer to x-forwarded-for, so only the last
  // entry is trustworthy. The first one is whatever the client invented.
  return request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
}
