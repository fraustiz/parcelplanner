import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from '../sentry.shared';

// No session replay, on purpose: it records the DOM, including text typed into
// the note and suggestion boxes.
if (SENTRY_DSN) Sentry.init(sharedOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
