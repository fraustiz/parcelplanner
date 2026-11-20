import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { withoutFragment } from '@/core/scrub-url';
import { fromBrowserExtension, fromClientDisconnect } from '@/core/third-party-noise';

/** Sentry is off unless a DSN is set, so local development and tests send nothing. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';

/**
 * Strips the URL fragment from events and navigation breadcrumbs: a `#p=` link
 * carries a whole warehouse plan, which must not reach a third-party service.
 */
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

  if (event.request?.url) event.request.url = withoutFragment(event.request.url);

  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.data?.from === 'string') crumb.data.from = withoutFragment(crumb.data.from);
    if (typeof crumb.data?.to === 'string') crumb.data.to = withoutFragment(crumb.data.to);
  }
  return event;
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
};
