import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from './sentry.shared';

if (SENTRY_DSN) Sentry.init(sharedOptions);
