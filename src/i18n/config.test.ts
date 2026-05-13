import { describe, it, expect } from 'vitest';
import {
  isLocale,
  pickLocaleFromAcceptLanguage,
  DEFAULT_LOCALE,
} from './config';

describe('i18n config', () => {
  describe('isLocale', () => {
    it('accepts known locales', () => {
      expect(isLocale('de')).toBe(true);
      expect(isLocale('en')).toBe(true);
    });
    it('rejects unknown / empty values', () => {
      expect(isLocale('fr')).toBe(false);
      expect(isLocale('')).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(null)).toBe(false);
    });
  });

  describe('pickLocaleFromAcceptLanguage', () => {
    it('returns the highest-q matching primary tag', () => {
      expect(pickLocaleFromAcceptLanguage('en-US,en;q=0.9,de;q=0.8')).toBe('en');
      expect(pickLocaleFromAcceptLanguage('de-AT,de;q=0.9,en;q=0.8')).toBe('de');
    });

    it('skips unsupported languages', () => {
      expect(pickLocaleFromAcceptLanguage('fr,it;q=0.9,en;q=0.5')).toBe('en');
    });

    it('falls back to default when header is missing or unmatched', () => {
      expect(pickLocaleFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
      expect(pickLocaleFromAcceptLanguage('')).toBe(DEFAULT_LOCALE);
      expect(pickLocaleFromAcceptLanguage('fr,it')).toBe(DEFAULT_LOCALE);
    });

    it('respects ordering and q-values', () => {
      // Even if listed first, low q drops it
      expect(pickLocaleFromAcceptLanguage('de;q=0.1, en;q=0.9')).toBe('en');
    });
  });
});
