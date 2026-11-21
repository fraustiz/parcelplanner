import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubFragments, scrubTransaction, sharedOptions, type TransactionEvent } from '../../sentry.shared';

describe('keeping plans and keys out of what goes to Sentry', () => {
  it('scrubs transactions too, not only errors', () => {
    expect(sharedOptions.beforeSendTransaction).toBe(scrubTransaction);
    expect(sharedOptions.beforeSend).toBe(scrubFragments);
  });

  it('takes a shared plan off a page-load trace', () => {
    // Traces are sampled in production, and a `#p=` url carries the whole plan.
    const trace: TransactionEvent = {
      type: 'transaction',
      request: { url: 'https://parcelplanner.app/#p=eJyrVkrLz1eyUsooKSmw0tc' },
    };
    expect(scrubTransaction(trace, {}).request?.url).toBe('https://parcelplanner.app/');
  });

  it('drops the request body of a server error', () => {
    // It can be a share payload, a suggestion, or the admin key.
    const error: ErrorEvent = {
      type: undefined,
      message: 'boom',
      request: { url: 'https://parcelplanner.app/api/suggestion/done', data: 'id=1&key=hunter2' },
    };
    const sent = scrubFragments(error, {});
    expect(sent?.request).toBeDefined();
    expect(sent?.request?.data).toBeUndefined();
    expect(sent?.request?.url).toBe('https://parcelplanner.app/api/suggestion/done');
  });

  it('hides short-link ids in fetch and navigation breadcrumbs', () => {
    const error: ErrorEvent = {
      type: undefined,
      message: 'boom',
      breadcrumbs: [
        { category: 'fetch', data: { method: 'GET', url: '/api/link/abc123' } },
        { category: 'navigation', data: { from: '/#p=plan', to: '/s/abc123#s=abc123' } },
      ],
    };
    const sent = scrubFragments(error, {});
    expect(sent?.breadcrumbs?.[0].data).toEqual({ method: 'GET', url: '/api/link/:id' });
    expect(sent?.breadcrumbs?.[1].data).toEqual({ from: '/', to: '/s/:id' });
  });

  it('still drops noise from browser extensions', () => {
    const error: ErrorEvent = {
      type: undefined,
      exception: {
        values: [{
          type: 'TypeError',
          value: 'x',
          stacktrace: { frames: [{ filename: 'chrome-extension://abc/content.js' }] },
        }],
      },
    };
    expect(scrubFragments(error, {})).toBeNull();
  });
});
