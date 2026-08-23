import { describe, expect, it } from 'vitest';
import {
  FUELL_LEISTUNG,
  TRANSPORT_LEISTUNG_10M,
  fuellLeistungJePerson,
  fuellLeistungTrupp,
  kettenHelfer,
  transportLeistung,
} from './fuellLeistung';

const ohne = { trichter: false, roedeln: false };
const mitTrichter = { trichter: true, roedeln: false };
const geroedelt = { trichter: false, roedeln: true };
const beides = { trichter: true, roedeln: true };

describe('fuellLeistungTrupp', () => {
  it('trifft alle sechzehn Felder der Tabelle', () => {
    for (const zeile of FUELL_LEISTUNG) {
      expect(fuellLeistungTrupp(zeile.personen, ohne)).toBe(
        zeile.ohneTrichter
      );
      expect(fuellLeistungTrupp(zeile.personen, geroedelt)).toBe(
        zeile.ohneTrichterGeroedelt
      );
      expect(fuellLeistungTrupp(zeile.personen, mitTrichter)).toBe(
        zeile.mitTrichter
      );
      expect(fuellLeistungTrupp(zeile.personen, beides)).toBe(
        zeile.mitTrichterGeroedelt
      );
    }
  });

  it('halbiert die Leistung beim Zubinden', () => {
    for (const personen of [2, 6, 10, 50]) {
      expect(fuellLeistungTrupp(personen, geroedelt) * 2).toBe(
        fuellLeistungTrupp(personen, ohne)
      );
      expect(fuellLeistungTrupp(personen, beides) * 2).toBe(
        fuellLeistungTrupp(personen, mitTrichter)
      );
    }
  });

  it('interpoliert linear in der Truppgröße', () => {
    // Zwischen 6 (320) und 10 (500): bei 8 die Mitte
    expect(fuellLeistungTrupp(8, ohne)).toBe(410);
  });

  it('rechnet über der Tabelle mit der Leistung je Person weiter', () => {
    // Zwischen 10 und 50: (2500 − 500) / 40 = 50 Säcke je Person
    expect(fuellLeistungTrupp(60, ohne)).toBe(2500 + 10 * 50);
  });

  it('führt unter dem Zweiertrupp anteilig herunter', () => {
    expect(fuellLeistungTrupp(1, ohne)).toBe(30);
    expect(fuellLeistungTrupp(0, ohne)).toBe(0);
    expect(fuellLeistungTrupp(-3, ohne)).toBe(0);
  });

  it('bringt einen größeren Trupp nie weniger zustande', () => {
    let vorher = 0;
    for (let personen = 1; personen <= 60; personen += 1) {
      const wert = fuellLeistungTrupp(personen, ohne);
      expect(wert).toBeGreaterThanOrEqual(vorher);
      vorher = wert;
    }
  });
});

describe('fuellLeistungJePerson', () => {
  it('zeigt, dass die Kette eine Mindestgröße braucht', () => {
    // Der Zweiertrupp schafft 30 je Person, der Zehnertrupp 50.
    expect(fuellLeistungJePerson(2, ohne)).toBe(30);
    expect(fuellLeistungJePerson(10, ohne)).toBe(50);
    expect(fuellLeistungJePerson(10, ohne)).toBeGreaterThan(
      fuellLeistungJePerson(2, ohne)
    );
  });

  it('bleibt ohne Personal bei null statt bei einer Division durch Null', () => {
    expect(fuellLeistungJePerson(0, ohne)).toBe(0);
  });
});

describe('transportLeistung', () => {
  it('nimmt die untere Grenze der Spanne für zehn Meter', () => {
    expect(transportLeistung(10)).toBe(TRANSPORT_LEISTUNG_10M);
  });

  it('rechnet umgekehrt proportional zur Trageweite', () => {
    expect(transportLeistung(20)).toBe(40);
    expect(transportLeistung(5)).toBe(160);
  });

  it('fällt ohne brauchbare Weite auf den Tabellenwert zurück', () => {
    expect(transportLeistung(0)).toBe(TRANSPORT_LEISTUNG_10M);
    expect(transportLeistung(-5)).toBe(TRANSPORT_LEISTUNG_10M);
  });
});

describe('kettenHelfer', () => {
  it('rechnet einen Helfer je Meter Kette', () => {
    expect(kettenHelfer(10)).toBe(10);
    expect(kettenHelfer(12.5)).toBe(13);
    expect(kettenHelfer(0)).toBe(0);
  });
});
