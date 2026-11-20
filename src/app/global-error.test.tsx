// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('./globals.css', () => ({}));

import GlobalError from './global-error';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('the global error page', () => {
  it('says the plan is kept and offers a reload', () => {
    render(<GlobalError error={new Error('boom')} />);
    expect(screen.getByRole('heading').textContent).toBe('Something went wrong');
    expect(document.body.textContent).toMatch(/kept in this browser/);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });

  it('speaks the saved language', () => {
    window.localStorage.setItem('parcelplanner.locale', 'fr');
    render(<GlobalError error={new Error('boom')} />);
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy();
  });
});
