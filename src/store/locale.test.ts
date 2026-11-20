// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { LOCALE_KEY, openingLocale, savedLocale, useEditor } from './editor';

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({ locale: 'en' });
});

describe('remembering the language', () => {
  it('writes the choice to localStorage', () => {
    // The saved choice wins over the browser's language on reload.
    useEditor.getState().setLocale('fr');
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('fr');
  });

  it('survives a browser that refuses localStorage', () => {
    // Private modes and some embedded browsers throw on write; the toggle must
    // not break the editor.
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('denied'); };
    try {
      expect(() => useEditor.getState().setLocale('fr')).not.toThrow();
      expect(useEditor.getState().locale).toBe('fr');
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it('reads back a saved choice, and ignores nonsense', () => {
    window.localStorage.setItem(LOCALE_KEY, 'fr');
    expect(savedLocale()).toBe('fr');
    window.localStorage.setItem(LOCALE_KEY, 'klingon');
    expect(savedLocale()).toBeUndefined();
    window.localStorage.removeItem(LOCALE_KEY);
    expect(savedLocale()).toBeUndefined();
  });
});

describe('what the app opens in', () => {
  it('prefers a saved choice over the browser', () => {
    // The browser's languages apply only when no choice was saved.
    window.localStorage.setItem(LOCALE_KEY, 'en');
    expect(openingLocale(['fr-FR', 'fr'])).toBe('en');
  });

  it('falls back to the browser when nothing was ever chosen', () => {
    expect(openingLocale(['fr-FR', 'fr'])).toBe('fr');
    expect(openingLocale(['de-DE'])).toBe('en');
  });
});
