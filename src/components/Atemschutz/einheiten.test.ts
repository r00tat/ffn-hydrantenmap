import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../common/atemschutz';
import {
  ALLE_EINHEITEN,
  einheitOptionen,
  truppPasstZuEinheit,
} from './einheiten';

function trupp(entsendetAn?: string): Pick<AtemschutzTrupp, 'entsendetAn'> {
  return entsendetAn ? { entsendetAn } : {};
}

describe('einheitOptionen', () => {
  it('nimmt die Fahrzeuge des Einsatzes auf, auch ohne Trupp daran', () => {
    // Der wichtigste Fall: Beim ersten Trupp eines Einsatzes gibt es noch
    // keine Zuordnung — die Liste wäre sonst leer und die Wahl unmöglich.
    expect(
      einheitOptionen({ trupps: [], bekannt: ['RLFA-ND', 'KDOF'] }),
    ).toEqual(['KDOF', 'RLFA-ND']);
  });

  it('vereinigt zugeordnete und bekannte Einheiten', () => {
    expect(
      einheitOptionen({
        trupps: [trupp('Abschnitt Ost'), trupp('RLFA-ND'), trupp()],
        bekannt: ['RLFA-ND', 'TLFA'],
      }),
    ).toEqual(['Abschnitt Ost', 'RLFA-ND', 'TLFA']);
  });

  it('fasst dieselbe Einheit trotz anderer Schreibweise zusammen', () => {
    // Am Trupp steht Freitext. „rlfa-nd" und „RLFA-ND" sind ein Fahrzeug, und
    // zwei Einträge im Filter wären zwei Ansichten desselben Einsatzes.
    expect(
      einheitOptionen({ trupps: [trupp('rlfa-nd')], bekannt: ['RLFA-ND'] }),
    ).toEqual(['rlfa-nd']);
  });

  it('behält eine gewählte Einheit, an der noch kein Trupp hängt', () => {
    // Die Wahl steht je Gerät im localStorage. Fiele sie aus der Liste, spränge
    // der Filter beim Laden auf „alle Trupps" — und das Fahrzeug müsste sie in
    // jedem Einsatz neu treffen.
    expect(
      einheitOptionen({ trupps: [], bekannt: [], gewaehlt: 'RLFA-ND' }),
    ).toEqual(['RLFA-ND']);
  });

  it('übergeht Leeres und den Platzhalter „alle Trupps"', () => {
    expect(
      einheitOptionen({
        trupps: [trupp('  ')],
        bekannt: ['', '   '],
        gewaehlt: ALLE_EINHEITEN,
      }),
    ).toEqual([]);
  });
});

describe('truppPasstZuEinheit', () => {
  it('zeigt ohne Filter alles', () => {
    expect(truppPasstZuEinheit(trupp('RLFA-ND'), ALLE_EINHEITEN)).toBe(true);
  });

  it('zeigt den Trupp der gewählten Einheit', () => {
    expect(truppPasstZuEinheit(trupp(' RLFA-ND '), 'RLFA-ND')).toBe(true);
    expect(truppPasstZuEinheit(trupp('TLFA'), 'RLFA-ND')).toBe(false);
  });

  it('zeigt einen noch nicht zugeordneten Trupp immer', () => {
    // Ein am Sammelplatz bereitgestellter Trupp trägt noch keine Einheit. Wäre
    // er unter einem Einheitenfilter unsichtbar, könnte ihn niemand übernehmen
    // — und wer den Filter gesetzt hat, sähe eine leere Seite.
    expect(truppPasstZuEinheit(trupp(), 'RLFA-ND')).toBe(true);
  });
});
