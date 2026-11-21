import type { ErrorEvent, Event, EventHint } from '@sentry/nextjs';
import { withoutPrivateParts } from '@/core/scrub-url';
import { fromBrowserExtension, fromClientDisconnect } from '@/core/third-party-noise';

/**
 * What `beforeSendTransaction` receives. `@sentry/nextjs` does not re-export
 * this type, so it is spelt out the way `@sentry/core` defines it.
 */
export type TransactionEvent = Event & { type: 'transaction' };

/** Sentry is off unless a DSN is set, so local development and tests send nothing. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

/**
 * Takes out of any event what must not reach a third-party service: the URL
 * fragment (a `#p=` link carries a whole warehouse plan), short-link ids in
 * `/s/<id>` and `/api/link/<id>`, and the request body, which can be a shared
 * plan, a suggestion's text, or the admin key posted to /api/suggestion/done.
 */
function scrubPrivateData<T extends Event>(event: T): T {
  if (event.request) {
    delete event.request.data;
    if (event.request.url) event.request.url = withoutPrivateParts(event.request.url);
  }

  for (const crumb of event.breadcrumbs ?? []) {
    const data = crumb.data;
    if (!data) continue;
    // Navigation breadcrumbs carry from/to, fetch and xhr ones a url.
    for (const key of ['from', 'to', 'url'] as const) {
      if (typeof data[key] === 'string') data[key] = withoutPrivateParts(data[key]);
    }
  }
  return event;
}

/** `beforeSend`: drops noise nobody here can fix, then scrubs what is left. */
export function scrubFragments(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Drop errors from browser extensions and client disconnects, which nobody
  // here can fix (see third-party-noise.ts for the exact match).
  const thrown = event.exception?.values?.[0];
  const reported = {
    message: `${thrown?.type ?? ''}: ${thrown?.value ?? event.message ?? ''}`,
    // Node's own frames have a `module` (`node:_http_server`) and no filename;
    // without them an abort would look stackless, which this never filters.
    frameFiles: (thrown?.stacktrace?.frames ?? [])
      .map((frame) => frame.filename ?? frame.module)
      .filter((file): file is string => typeof file === 'string'),
  };
  if (fromBrowserExtension(reported) || fromClientDisconnect(reported)) return null;

  return scrubPrivateData(event);
}

/**
 * `beforeSendTransaction`: a page-load trace for `/#p=…` would otherwise carry
 * the whole plan in its request url.
 */
export function scrubTransaction(event: TransactionEvent, _hint: EventHint): TransactionEvent {
  return scrubPrivateData(event);
}

/**
 * Sentry's recommended defaults: tracing at 10% in production, and logs.
 * Session replay is left out because the DOM holds text people type (notes,
 * suggestions) and the whole editor state.
 */
export const sharedOptions = {
  dsn: SENTRY_DSN,
  // Never identify who is using the app.
  dataCollection: { userInfo: false },
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  enableLogs: true,
  beforeSend: scrubFragments,
  beforeSendTransaction: scrubTransaction,
};
