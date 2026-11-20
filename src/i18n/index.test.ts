import { describe, it, expect } from 'vitest';
import { t, detectLocale, formatMoney } from './index';
import en from './en';
import fr from './fr';

describe('dictionaries', () => {
  it('cover exactly the same keys', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  it('leave no french entry empty', () => {
    for (const [key, value] of Object.entries(fr)) {
      expect(value.length, `${key} is empty`).toBeGreaterThan(0);
    }
  });

  it('has a message for every validation issue code', () => {
    // Exactly IssueCode's members (src/core/validate.ts).
    const codes = ['overlap', 'out-of-bounds', 'bad-floor', 'unknown-object'];
    for (const code of codes) {
      expect(Object.keys(en)).toContain(`issue.${code}`);
    }
  });
});

describe('t', () => {
  it('returns english', () => {
    expect(t('en', 'cost.total')).toBe('Total cost');
  });

  it('returns french', () => {
    expect(t('fr', 'cost.total')).toBe('Coût total');
  });
});

describe('detectLocale', () => {
  it('picks french for a french browser', () => {
    expect(detectLocale(['fr-FR', 'en-US'])).toBe('fr');
  });

  it('falls back to english', () => {
    expect(detectLocale(['de-DE'])).toBe('en');
  });

  it('falls back to english with no languages at all', () => {
    expect(detectLocale([])).toBe('en');
  });
});

describe('formatMoney', () => {
  it('groups thousands with a comma in English', () => {
    expect(formatMoney(1000, 'en')).toBe('1,000');
    expect(formatMoney(899450025, 'en')).toBe('899,450,025');
  });

  it('groups with a narrow no-break space in French', () => {
    // The correct French separator, which also stops a figure wrapping.
    expect(formatMoney(1000, 'fr')).toBe('1\u202f000');
    expect(formatMoney(516500, 'fr')).toBe('516\u202f500');
  });

  it('leaves anything under a thousand alone', () => {
    for (const n of [0, 7, 100, 999]) {
      expect(formatMoney(n, 'en')).toBe(String(n));
      expect(formatMoney(n, 'fr')).toBe(String(n));
    }
  });

  it('never depends on the ambient locale', () => {
    // Number.toLocaleString() reads the runtime locale, so server and browser
    // disagree and React reports a hydration mismatch. This output depends
    // only on its two arguments.
    const before = formatMoney(1234567, 'en');
    expect(before).toBe('1,234,567');
    expect((1234567).toLocaleString('fr-FR')).not.toBe(before); // the ambient path really does differ
    expect(formatMoney(1234567, 'en')).toBe(before);
  });

  it('does not split a negative sign off from its digits', () => {
    expect(formatMoney(-1000, 'en')).toBe('-1,000');
  });

  it('rounds rather than printing a fraction of a dollar', () => {
    expect(formatMoney(1000.4, 'en')).toBe('1,000');
    expect(formatMoney(1000.6, 'en')).toBe('1,001');
  });
});
