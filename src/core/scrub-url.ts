/**
 * A URL with its fragment removed, for anything that leaves this browser.
 *
 * The fragment holds the whole plan (`#p=`) or a stored plan's id (`#s=`), and
 * crash reporters send the full URL, so it must not reach them. Path and query
 * stay. Never throws, since it runs inside a crash reporter: anything
 * unparseable comes back untouched.
 */
export function withoutFragment(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

// `/s/<id>` and `/api/link/<id>` at the start of the path. Short-link ids are
// base64url; each one opens a stored plan, so it is as private as `#s=`.
const SHORT_LINK_PATH = /^\/(s|api\/link)\/[A-Za-z0-9_-]+/;
// Scheme and host of an absolute url (`https://host:port`), kept as is.
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i;

/**
 * A URL with its fragment removed and any short-link id in the path replaced
 * by `:id`, for anything sent to a crash reporter. Works on absolute urls and
 * on bare paths. Never throws, for the same reason as `withoutFragment`.
 */
export function withoutPrivateParts(url: string): string {
  const bare = withoutFragment(url);
  const origin = ORIGIN.exec(bare)?.[0] ?? '';
  const rest = bare.slice(origin.length);
  return origin + rest.replace(SHORT_LINK_PATH, '/$1/:id');
}
