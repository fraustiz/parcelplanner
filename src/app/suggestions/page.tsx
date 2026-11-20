import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isAdminKey } from '@/server/admin';
import { suggestionBook, adminLimiter, DATA_ROOT, SUGGESTION_ADMIN_KEY } from '@/server/links';
import { describeStorage } from '@/server/storage-health';

// Read from disk on every request so a new suggestion shows at once.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The suggestions admin page, reached with a key in the URL (no accounts).
 * Without a valid key, or with none configured, it answers 404, so it gives
 * away nothing about whether it exists.
 *
 * The key lands in browser history and logs but not in Referer
 * (`Referrer-Policy: no-referrer`). Treat the link like a password.
 */
export default async function SuggestionsPage(
  { searchParams }: { searchParams: Promise<{ key?: string }> },
) {
  const { key } = await searchParams;

  // Rate-limited before the key is compared, against guessing. Answers 404,
  // not 429, which would confirm the page exists.
  const caller = (await headers()).get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown';
  if (!adminLimiter.allow(caller)) notFound();

  if (!isAdminKey(key, SUGGESTION_ADMIN_KEY)) notFound();

  const suggestions = await suggestionBook.list();
  const storage = await describeStorage(DATA_ROOT);

  return (
    <main className="mx-auto max-w-2xl p-6 text-sm">
      <h1 className="mb-1 text-lg font-semibold">Suggestions</h1>

      {/* Without a mounted volume the store lives in the container and is
          lost on every deploy and restart, silently, so it is shown here. */}
      {!storage.persistent && (
        <div className="mb-4 rounded border border-[var(--danger)] bg-[var(--tint-danger)] p-3 text-[var(--danger)]">
          <strong className="block">Nothing here will survive a restart.</strong>
          <span className="mt-1 block text-xs">
            <code>{storage.directory}</code> is inside the container, not a mounted volume.
            A container is usually recreated on every deploy and restart, and everything in it
            goes: these suggestions, and every <code>#s=</code> link anyone has shared.
            Mount a volume on <code>/app/data</code> and set{' '}
            <code>PARCELPLANNER_DATA_DIR=/app/data</code>.
          </span>
        </div>
      )}
      <p className="mb-6 text-[var(--text-faint)]">
        {suggestions.length === 0
          ? 'Nothing to read. Anything marked done is gone for good.'
          : `${suggestions.length} waiting, newest first. Done removes one for good.`}
      </p>

      <ul className="space-y-3">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="rounded border border-[var(--line-strong)] bg-[var(--panel)] p-3">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <span className="font-mono text-xs text-[var(--text-faint)]">
                {suggestion.at.replace('T', ' ').replace(/\..*/, '')} UTC
              </span>
              {/* A plain form, so it works without JavaScript. The key goes in
                  the body, not the query string, to keep it out of history. */}
              <form action="/api/suggestion/done" method="POST">
                <input type="hidden" name="id" value={suggestion.id} />
                <input type="hidden" name="key" value={key ?? ''} />
                <button
                  type="submit"
                  className="shrink-0 rounded bg-[var(--tint-accent)] px-2 py-0.5 text-xs hover:bg-[var(--raised-hover)]"
                >
                  Done
                </button>
              </form>
            </div>
            {/* Whitespace preserved for lists and line breaks; React escapes
                the text, so it cannot inject markup. */}
            <p className="whitespace-pre-wrap break-words">{suggestion.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
