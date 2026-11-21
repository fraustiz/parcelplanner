// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import OpenSourceNotice, { noticeWindowOpen, OPEN_SOURCE_SEEN_KEY, REPOSITORY_URL } from './OpenSourceNotice';
import { useEditor } from '@/store/editor';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({ locale: 'en' });
  // Announced today, so the notice is offered.
  process.env.NEXT_PUBLIC_OPEN_SOURCE_SINCE = new Date().toISOString().slice(0, 10);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_OPEN_SOURCE_SINCE;
});

const notice = () => screen.queryByRole('region', { name: 'ParcelPlanner is going open source' });

describe('the open source notice', () => {
  it('shows on a first visit, with a link to the code', () => {
    render(<OpenSourceNotice />);
    expect(notice()).not.toBeNull();
    const link = screen.getByRole('link', { name: 'See the code on GitHub' });
    expect(link.getAttribute('href')).toBe(REPOSITORY_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('says why, and that the site stays up', () => {
    render(<OpenSourceNotice />);
    const text = notice()?.textContent ?? '';
    expect(text).toMatch(/time or drive to maintain/);
    expect(text).toMatch(/keep hosting the site and paying for its domain/);
    expect(text).toMatch(/without finding a solution or warning in advance/);
  });

  it('never comes back once shown, even if it was not closed', () => {
    render(<OpenSourceNotice />);
    expect(window.localStorage.getItem(OPEN_SOURCE_SEEN_KEY)).not.toBeNull();
    cleanup();
    render(<OpenSourceNotice />);
    expect(notice()).toBeNull();
  });

  it('goes away when closed', () => {
    render(<OpenSourceNotice />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(notice()).toBeNull();
  });

  it('shows nothing, and remembers nothing, before the code is announced', () => {
    delete process.env.NEXT_PUBLIC_OPEN_SOURCE_SINCE;
    render(<OpenSourceNotice />);
    expect(notice()).toBeNull();
    expect(window.localStorage.getItem(OPEN_SOURCE_SEEN_KEY)).toBeNull();
  });

  it('speaks French', () => {
    useEditor.setState({ locale: 'fr' });
    render(<OpenSourceNotice />);
    expect(screen.getByRole('region', { name: 'ParcelPlanner devient open source' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir le code sur GitHub' })).toBeTruthy();
  });
});

describe('how long the notice is offered', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

  it('runs for 60 days from the announcement', () => {
    expect(noticeWindowOpen('2026-12-01', day('2026-12-01'))).toBe(true);
    expect(noticeWindowOpen('2026-12-01', day('2027-01-29'))).toBe(true);
    expect(noticeWindowOpen('2026-12-01', day('2027-01-30'))).toBe(false);
  });

  it('is not offered before the announcement', () => {
    expect(noticeWindowOpen('2026-12-01', day('2026-11-30'))).toBe(false);
  });

  it('is not offered without a valid date', () => {
    expect(noticeWindowOpen(undefined, day('2026-12-01'))).toBe(false);
    expect(noticeWindowOpen('', day('2026-12-01'))).toBe(false);
    expect(noticeWindowOpen('1 December', day('2026-12-01'))).toBe(false);
  });
});
