import en from './en';
import fr from './fr';

export type Locale = 'en' | 'fr';
export type Dictionary = typeof en;
export type TranslationKey = keyof Dictionary;

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, fr };

export function t(locale: Locale, key: TranslationKey): string {
  return DICTIONARIES[locale][key];
}

export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    if (tag.toLowerCase().startsWith('fr')) return 'fr';
    if (tag.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * Groups a money figure's thousands by the app's own locale.
 *
 * Not `toLocaleString()`, which reads the ambient locale and differs between
 * server and browser (a hydration mismatch). Not `Intl.NumberFormat` either:
 * its output depends on each runtime's ICU data. French uses a narrow
 * no-break space, which also stops a figure wrapping.
 */
export function formatMoney(value: number, locale: Locale): string {
  const rounded = Math.round(value);
  const separator = locale === 'fr' ? '\u202f' : ',';
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
