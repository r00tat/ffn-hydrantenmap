import { describe, it, expect } from 'vitest';
import { normalizeName, findMatchingName } from './name-matching';

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Mustermann Jörg  ')).toBe('mustermann jorg');
  });

  it('removes diacritics', () => {
    expect(normalizeName('Müller Günther')).toBe('muller gunther');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('Name   Test')).toBe('name test');
  });
});

describe('findMatchingName', () => {
  const sybosNames = ['Mustermann Jörg', 'Müller Franz', 'Gruber Anna Maria'];

  it('matches exact name', () => {
    expect(findMatchingName('Mustermann Jörg', sybosNames)).toBe('Mustermann Jörg');
  });

  it('matches case-insensitive', () => {
    expect(findMatchingName('mustermann jörg', sybosNames)).toBe('Mustermann Jörg');
  });

  it('matches reversed name order', () => {
    expect(findMatchingName('Jörg Mustermann', sybosNames)).toBe('Mustermann Jörg');
  });

  it('returns null for no match', () => {
    expect(findMatchingName('Unbekannt Max', sybosNames)).toBeNull();
  });

  it('matches substring (multi-part name)', () => {
    expect(findMatchingName('Gruber Anna', sybosNames)).toBe(
      'Gruber Anna Maria'
    );
  });

  it('matches when SYBOS name has a title prefix (word-subset)', () => {
    // SYBOS often stores titled persons like "Ing. Preis Thomas".
    // Einsatzkarte only stores "Thomas Preis" — a word-subset match.
    expect(
      findMatchingName('Thomas Preis', ['Ing. Preis Thomas', 'Müller Franz'])
    ).toBe('Ing. Preis Thomas');
  });

  it('matches when SYBOS name has title suffixes (word-subset)', () => {
    expect(
      findMatchingName('Denise Meyer', ['Meyer Denise BSc MBA'])
    ).toBe('Meyer Denise BSc MBA');
  });

  it('does not match unrelated names via word-subset', () => {
    expect(
      findMatchingName('Max Preis', ['Ing. Preis Thomas'])
    ).toBeNull();
  });
});
