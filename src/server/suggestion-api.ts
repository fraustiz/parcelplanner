import { cleanSuggestion, MAX_SUGGESTION_LENGTH } from '@/core/suggestion';
import { readTextCapped } from './body';
import { callerOf } from './caller';
import { isCrossSite } from './same-origin';
import { isAdminKey } from './admin';
import { SuggestionBookFull, type SuggestionBook } from './suggestion-store';
import type { createRateLimiter } from './rate-limit';

/**
 * The suggestion box: notes are filed on disk, then announced on Discord.
 * The disk is the record, so the response depends on the write, never on the webhook.
 */

type Limiter = ReturnType<typeof createRateLimiter>;


export async function handleSuggestion(
  request: Request,
  { book, limiter, webhook, fetch: send = fetch }: {
    book: SuggestionBook;
    limiter: Limiter;
    webhook?: string;
    /** Injected so the tests never touch the network. */
    fetch?: typeof fetch;
  },
): Promise<Response> {
  if (!limiter.allow(callerOf(request))) {
    return new Response('too many requests', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  // A text/plain POST needs no preflight, so another site's page could post through its visitors.
  if (isCrossSite(request)) {
    return new Response('cross-site requests are not accepted', { status: 403 });
  }

  // Capped while reading, so a chunked body with no declared length cannot be buffered whole.
  // Four bytes per character is the most UTF-8 needs.
  const body = await readTextCapped(request, MAX_SUGGESTION_LENGTH * 4);
  if (body === null) return new Response('suggestion too long', { status: 400 });

  const text = cleanSuggestion(body);
  if (text === null) return new Response('nothing to say', { status: 400 });

  try {
    await book.add(text, new Date());
  } catch (error) {
    if (error instanceof SuggestionBookFull) {
      return new Response('the suggestion box is full', { status: 507 });
    }
    throw error;
  }

  if (webhook) {
    try {
      await send(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: `**Suggestion**\n${text}`,
          // Backs up cleanSuggestion: the webhook must never notify anyone.
          allowed_mentions: { parse: [] },
        }),
      });
    } catch {
      // Discord is unreachable; the note is already filed on disk.
    }
  }

  return new Response(null, { status: 200 });
}

/**
 * Marks a suggestion as dealt with, which removes it.
 *
 * A plain form POST, so the page needs no JavaScript. The key travels in the form body, so the
 * submission's own URL does not carry it; the 303 back to the page puts it in the URL again, like
 * the first visit. Answers 404 without the key, like the page.
 */
export async function handleSuggestionDone(
  request: Request,
  { book, adminKey, limiter }: {
    book: SuggestionBook;
    adminKey: string | undefined;
    /** Bounds attempts at the key itself. Optional so scripts and tests need no limiter. */
    limiter?: Limiter;
  },
): Promise<Response> {
  // Counted before the key is checked, correct keys included, so wrong guesses are never free.
  if (limiter && !limiter.allow(callerOf(request))) {
    return new Response('too many requests', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  // The page's form posts urlencoded fields: an id and the key, far under 1 KB. Anything larger
  // gets the same answer as a wrong key, so it learns nothing.
  const body = await readTextCapped(request, 1024);
  if (body === null) return new Response('no such page', { status: 404 });
  const form = new URLSearchParams(body);

  const key = form.get('key');
  if (key === null || !isAdminKey(key, adminKey)) {
    return new Response('no such page', { status: 404 });
  }

  const id = form.get('id');
  if (id === null || !(await book.remove(id))) {
    return new Response('not a suggestion', { status: 400 });
  }

  // 303 so the browser follows with a GET and a refresh does not resubmit.
  return new Response(null, {
    status: 303,
    headers: { location: `/suggestions?key=${encodeURIComponent(key)}` },
  });
}
