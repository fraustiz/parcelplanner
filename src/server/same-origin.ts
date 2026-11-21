/**
 * Whether a request was sent by another site's page.
 *
 * The share and suggestion endpoints take `text/plain` bodies, which browsers send cross-site
 * without a CORS preflight, so any page could make its visitors post to them. Per-IP limits do
 * not help there: each visitor has their own address.
 *
 * Browsers say where a request came from in `sec-fetch-site`; older ones only send `origin`,
 * which is compared with the host the request was addressed to. A request with neither (curl,
 * scripts) is not a browser being used against its will, so it passes. Never throws: an origin
 * that cannot be parsed counts as cross-site.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (site === 'cross-site' || site === 'same-site') return true;
  if (site === 'same-origin' || site === 'none') return false;

  const origin = request.headers.get('origin');
  if (origin === null) return false;

  try {
    const host = request.headers.get('host') ?? new URL(request.url).host;
    return new URL(origin).host.toLowerCase() !== host.trim().toLowerCase();
  } catch {
    return true;
  }
}
