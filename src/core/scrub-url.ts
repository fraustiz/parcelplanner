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
