import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  resolveInitialLocale,
} from './config';

describe('i18n config', () => {
  it('LOCALES contains de and en', () => {
    expect(LOCALES).toEqual(['de', 'en']);
  });

  it('DEFAULT_LOCALE is de', () => {
    expect(DEFAULT_LOCALE).toBe('de');
  });

  describe('isLocale', () => {
    it('accepts known locales', () => {
      expect(isLocale('de')).toBe(true);
      expect(isLocale('en')).toBe(true);
    });
    it('rejects others', () => {
      expect(isLocale('fr')).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(null)).toBe(false);
      expect(isLocale(42)).toBe(false);
    });
  });

  describe('resolveInitialLocale', () => {
    it('uses cached value when valid', () => {
      expect(resolveInitialLocale('en', 'de-AT')).toBe('en');
      expect(resolveInitialLocale('de', 'en-US')).toBe('de');
    });

    it('falls back to browser primary tag when cache is missing', () => {
      expect(resolveInitialLocale(undefined, 'en-GB')).toBe('en');
      expect(resolveInitialLocale(undefined, 'de-AT')).toBe('de');
    });

    it('falls back to DEFAULT_LOCALE for unsupported browser languages', () => {
      expect(resolveInitialLocale(undefined, 'fr-FR')).toBe('de');
      expect(resolveInitialLocale(undefined, undefined)).toBe('de');
    });

    it('ignores invalid cached values', () => {
      expect(resolveInitialLocale('fr', 'en-US')).toBe('en');
    });
  });
});
