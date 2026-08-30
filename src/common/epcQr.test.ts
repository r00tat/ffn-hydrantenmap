import { describe, expect, it } from 'vitest';
import { buildEpcPayload, epcQrCode } from './epcQr';

const BASIS = {
  kontoinhaber: 'Freiwillige Feuerwehr Neusiedl am See',
  iban: 'AT40 3300 0000 0202 0402',
  bic: 'RLBBAT2E',
  betrag: 12.9,
  verwendungszweck: 'ATS-2026-001',
};

describe('buildEpcPayload', () => {
  it('baut die Felder in der Reihenfolge der EPC069-12', () => {
    expect(buildEpcPayload(BASIS)?.split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'RLBBAT2E',
      'Freiwillige Feuerwehr Neusiedl am See',
      'AT403300000002020402',
      'EUR12.90',
      '',
      '',
      'ATS-2026-001',
      '',
    ]);
  });

  it('entfernt die Leerzeichen aus der IBAN', () => {
    expect(buildEpcPayload(BASIS)).toContain('AT403300000002020402');
    expect(buildEpcPayload(BASIS)).not.toContain('AT40 3300');
  });

  it('kommt ohne BIC aus', () => {
    const felder = buildEpcPayload({ ...BASIS, bic: '' })?.split('\n');
    expect(felder?.[4]).toBe('');
    expect(felder?.[6]).toBe('AT403300000002020402');
  });

  it('gibt ohne IBAN oder Empfänger keinen Code her', () => {
    expect(buildEpcPayload({ ...BASIS, iban: '' })).toBeUndefined();
    expect(buildEpcPayload({ ...BASIS, kontoinhaber: '  ' })).toBeUndefined();
  });

  it('lehnt einen Betrag ausserhalb des zulässigen Bereichs ab', () => {
    expect(buildEpcPayload({ ...BASIS, betrag: 0 })).toBeUndefined();
    expect(buildEpcPayload({ ...BASIS, betrag: -5 })).toBeUndefined();
    expect(buildEpcPayload({ ...BASIS, betrag: 1e12 })).toBeUndefined();
  });

  it('kürzt zu lange Angaben auf die Feldlängen', () => {
    const felder = buildEpcPayload({
      ...BASIS,
      kontoinhaber: 'F'.repeat(100),
      verwendungszweck: 'V'.repeat(200),
    })?.split('\n');
    expect(felder?.[5]).toHaveLength(70);
    expect(felder?.[10]).toHaveLength(140);
  });
});

describe('epcQrCode', () => {
  it('liefert Pfad und Modulanzahl', () => {
    const code = epcQrCode(BASIS);
    expect(code?.size).toBeGreaterThan(20);
    expect(code?.path.startsWith('M')).toBe(true);
  });

  it('liefert nichts, wenn der Datensatz nicht trägt', () => {
    expect(epcQrCode({ ...BASIS, iban: '' })).toBeUndefined();
  });
});
