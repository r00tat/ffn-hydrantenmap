import { describe, expect, it } from 'vitest';
import {
  modelNameCandidates,
  normalizeMake,
  normalizeName,
  parseRegistrationYear,
  powertrainMatches,
} from './normalize';

describe('normalizeName', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalizeName('Škoda Octavia')).toBe('skoda octavia');
    expect(normalizeName('Mercedes-Benz')).toBe('mercedes benz');
    expect(normalizeName('  A3   Sportback  ')).toBe('a3 sportback');
    expect(normalizeName('Coupé')).toBe('coupe');
  });

  it('handles empty input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('normalizeMake', () => {
  it('resolves the ÖBFV spelling to the Euro-Rescue spelling', () => {
    expect(normalizeMake('TESLA')).toBe(normalizeMake('Tesla'));
    expect(normalizeMake('VW')).toBe(normalizeMake('Volkswagen'));
    expect(normalizeMake('MERCEDES')).toBe(normalizeMake('Mercedes-Benz'));
    expect(normalizeMake('SKODA')).toBe(normalizeMake('Škoda'));
    expect(normalizeMake('LANDROVER')).toBe(normalizeMake('Land Rover'));
  });

  it('leaves unknown makes untouched apart from normalization', () => {
    expect(normalizeMake('Steyr')).toBe('steyr');
  });
});

describe('parseRegistrationYear', () => {
  it('reads the ISO date the ÖBFV query returns', () => {
    expect(parseRegistrationYear('2019-06-27')).toBe(2019);
  });

  it('reads German and plain year formats', () => {
    expect(parseRegistrationYear('27.06.2019')).toBe(2019);
    expect(parseRegistrationYear('2019')).toBe(2019);
  });

  it('returns undefined for unusable input', () => {
    expect(parseRegistrationYear('')).toBeUndefined();
    expect(parseRegistrationYear(undefined)).toBeUndefined();
    expect(parseRegistrationYear('keine Angabe')).toBeUndefined();
    expect(parseRegistrationYear('1789-07-14')).toBeUndefined();
  });
});

describe('powertrainMatches', () => {
  it('maps the German Antrieb to the catalog powertrain', () => {
    expect(powertrainMatches('Elektro', 'Electric')).toBe(true);
    expect(powertrainMatches('Diesel', 'Gasoline/Diesel')).toBe(true);
    expect(powertrainMatches('Benzin', 'Gasoline/Diesel')).toBe(true);
    expect(powertrainMatches('Hybrid Benzin/Elektro', 'Hybrid')).toBe(true);
    expect(powertrainMatches('Hybrid Benzin/Elektro', 'Hybrid (Electric)')).toBe(
      true,
    );
    expect(powertrainMatches('Wasserstoff', 'FCEV')).toBe(true);
  });

  it('rejects a mismatch', () => {
    expect(powertrainMatches('Elektro', 'Gasoline/Diesel')).toBe(false);
    expect(powertrainMatches('Diesel', 'Electric')).toBe(false);
  });

  it('is undecided when either side is missing', () => {
    expect(powertrainMatches('', 'Electric')).toBe(false);
    expect(powertrainMatches('Elektro', undefined)).toBe(false);
  });
});

describe('modelNameCandidates', () => {
  it('keeps the plain name for makes that need no translation', () => {
    expect(modelNameCandidates('Volkswagen', 'Golf')).toEqual(['golf']);
  });

  it('translates a BMW type number to the series of the catalog', () => {
    expect(modelNameCandidates('BMW', '320d')).toContain('3 series');
    expect(modelNameCandidates('BMW', '320 D')).toContain('3 series');
    expect(modelNameCandidates('BMW', '3er')).toContain('3 series');
    expect(modelNameCandidates('BMW', 'X3')).toEqual(['x3']);
  });

  it('translates a Mercedes type number to the class of the catalog', () => {
    expect(modelNameCandidates('MERCEDES', 'C 220 d')).toContain('c class');
    expect(modelNameCandidates('Mercedes-Benz', 'C220')).toContain('c class');
    expect(modelNameCandidates('MERCEDES', 'C-Klasse')).toContain('c class');
    expect(modelNameCandidates('MERCEDES', 'GLE 350')).toContain('gle');
  });

  it('never returns an empty candidate', () => {
    expect(modelNameCandidates('BMW', '')).toEqual([]);
  });
});
