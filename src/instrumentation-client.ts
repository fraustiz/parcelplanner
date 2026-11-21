import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from '../sentry.shared';
import { guardAgainstTranslation } from './translation-guard';

// Before hydration, so a translated page never breaks React's commit phase.
guardAgainstTranslation();

// No session replay, on purpose: it records the DOM, including text typed into
// the note and suggestion boxes.
if (SENTRY_DSN) Sentry.init(sharedOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
