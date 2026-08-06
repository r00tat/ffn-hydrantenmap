import { describe, expect, it } from 'vitest';
import {
  guestCanWrite,
  guestDisplayName,
  isFirecallGuest,
  normalizeGuestName,
} from './firecallGuest';

describe('normalizeGuestName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeGuestName('  Nachbarwehr Weiden  ')).toBe(
      'Nachbarwehr Weiden',
    );
  });

  it('collapses inner whitespace', () => {
    expect(normalizeGuestName('BFKDO\t \nOberwart')).toBe('BFKDO Oberwart');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeGuestName('   ')).toBe('');
    expect(normalizeGuestName(undefined)).toBe('');
  });
});

describe('guestDisplayName', () => {
  it('appends the guest marker and the firecall name', () => {
    expect(guestDisplayName('Nachbarwehr Weiden', 'Brand Hauptstraße')).toBe(
      'Nachbarwehr Weiden (Einsatz-Gast Brand Hauptstraße)',
    );
  });

  it('trims the name before building the display name', () => {
    expect(guestDisplayName('  ORF  ', 'Brand')).toBe(
      'ORF (Einsatz-Gast Brand)',
    );
  });

  it('omits the firecall name when it is missing', () => {
    expect(guestDisplayName('ORF', undefined)).toBe('ORF (Einsatz-Gast)');
    expect(guestDisplayName('ORF', '  ')).toBe('ORF (Einsatz-Gast)');
  });

  it('throws when the name is empty', () => {
    expect(() => guestDisplayName('   ', 'Brand')).toThrow();
  });
});

describe('isFirecallGuest', () => {
  it('detects a guest by the firecall field', () => {
    expect(isFirecallGuest({ firecall: 'abc' })).toBe(true);
  });

  it('treats users without a firecall as regular users', () => {
    expect(isFirecallGuest({})).toBe(false);
    expect(isFirecallGuest({ firecall: '' })).toBe(false);
    expect(isFirecallGuest(undefined)).toBe(false);
  });
});

describe('guestCanWrite', () => {
  it('grants write access to non-guests', () => {
    expect(guestCanWrite({})).toBe(true);
    expect(guestCanWrite({ firecallWrite: false })).toBe(true);
  });

  it('honours the flag for guests', () => {
    expect(guestCanWrite({ firecall: 'abc', firecallWrite: true })).toBe(true);
    expect(guestCanWrite({ firecall: 'abc', firecallWrite: false })).toBe(false);
  });

  it('grants write access to legacy guests without the flag', () => {
    expect(guestCanWrite({ firecall: 'abc' })).toBe(true);
  });
});
