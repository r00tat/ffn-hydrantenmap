import { describe, expect, it } from 'vitest';
import {
  computeFoerderung,
  MAX_PUMPS,
  type FoerderungProfilePoint,
} from './hydraulics';

/**
 * Höhenprofil mit gleichmäßiger Steigung. Schrittweite 10 m, damit die
 * erwarteten Pumpenstandorte exakt auf einem Abtastpunkt liegen und die
 * Zusicherungen nicht am Raster scheitern.
 */
const profile = (
  length: number,
  climb = 0,
  step = 10
): FoerderungProfilePoint[] => {
  const points: FoerderungProfilePoint[] = [];
  for (let distance = 0; distance <= length; distance += step) {
    points.push({ distance, elevation: (climb * distance) / length });
  }
  if (points[points.length - 1].distance !== length) {
    points.push({ distance: length, elevation: climb });
  }
  return points;
};

/**
 * 0,01 bar/m entspricht 1,00 bar je 100 m — B 75 bei 800 l/min laut Tabelle.
 * Ausgangsdruck 8 bar, Mindest-Eingangsdruck 1,5 bar, Zieldruck 6,0 bar.
 */
const input = (points: FoerderungProfilePoint[]) => ({
  profile: points,
  frictionBarPerMeter: 0.01,
  ausgangsdruck: 8,
  eingangsdruck: 1.5,
  zieldruck: 6,
});

describe('computeFoerderung', () => {
  it('braucht auf 200 m flach keine Verstärkerpumpe', () => {
    // need[0] = 6,0 + 0,01 · 200 = 8,0 ≤ 8 → die Pumpe an der Entnahmestelle reicht
    const result = computeFoerderung(input(profile(200)));
    expect(result.verstaerkerpumpen).toBe(0);
    expect(result.pumps).toHaveLength(1);
    expect(result.pumps[0].distance).toBe(0);
    expect(result.pumps[0].eingangsdruck).toBeUndefined();
    expect(result.enddruck).toBeCloseTo(6, 6);
    expect(result.darstellbar).toBe(true);
  });

  it('setzt die erste Pumpe auf 605 m — die Faustregel „etwa alle 600 m"', () => {
    // Der weiteste Standort wäre (8 − 1,5) / 0,01 = 650 m. Verteilt wird auf
    // gleiche Auslastung: 20 bar auf 3 · 6,5 + 2 = 21,5 bar Kapazität sind
    // 93,0 %, je Zwischenabschnitt also 6,047 bar = 604,7 m. Veröffentlicht ist
    // „etwa alle 600 m eine Verstärkerpumpe" bei 800 l/min in der Ebene.
    const result = computeFoerderung(input(profile(2000)));
    expect(result.pumps[1].distance).toBeCloseTo(604.65, 2);
    // Mit Reserve statt am Anschlag: 8 − 6,047 = 1,95 bar statt 1,5.
    expect(result.pumps[1].eingangsdruck).toBeCloseTo(1.953, 3);
    expect(result.verstaerkerpumpen).toBe(3);
  });

  it('verteilt die Pumpen gleichmäßig, statt die letzte anzuhängen', () => {
    // 2000 m mit 100 m Steigung, 0,015 bar/m: Der Vorwärtslauf schöpft jeden
    // Abschnitt aus und setzt die Pumpen auf 433, 867, 1300, 1733 — und die
    // fünfte auf 1867, also 133 m neben die vierte. Das ist kein Standort,
    // sondern eine Grenze, die hinten nicht mehr aufgeht.
    const result = computeFoerderung(input(profile(2000, 100)));
    expect(result.verstaerkerpumpen).toBe(5);

    const abstaende = result.pumps
      .slice(1)
      .map((pump, index) => pump.distance - result.pumps[index].distance);
    // Alle Abstände gleich — und keiner mehr in der Nähe der alten 133 m.
    for (const abstand of abstaende) {
      expect(abstand).toBeCloseTo(abstaende[0], 6);
      expect(abstand).toBeGreaterThan(300);
    }
    expect(result.darstellbar).toBe(true);
    expect(result.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('erreicht das Ende nie unter dem Zieldruck', () => {
    // Genau der Fall, in dem ein reines Vorwärts-Greedy eine Pumpe zu wenig
    // liefert: Es schöpft den Eingangsdruck aus und landet unter dem Zieldruck.
    for (const length of [300, 700, 900, 1300, 1400, 2000, 3000, 5000]) {
      const result = computeFoerderung(input(profile(length)));
      expect(result.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(result.darstellbar).toBe(true);
    }
  });

  it('setzt eine Pumpe vor eine Kuppe im letzten Abschnitt', () => {
    // 500 m flach, dann auf 200 m hinauf und wieder herunter. Netto verliert
    // die Strecke wenig — die Kuppe dazwischen kostet aber 20 bar. Wer nur
    // Anfang und Ende eines Abschnitts vergleicht, sieht sie nicht und meldet
    // die Lage als darstellbar, während an der Kuppe rechnerisch −9 bar
    // stünden. Wasser fließt dort keines mehr.
    const points: FoerderungProfilePoint[] = [];
    for (let distance = 0; distance <= 1500; distance += 10) {
      points.push({
        distance,
        elevation:
          distance <= 500
            ? 0
            : distance <= 1000
              ? (200 * (distance - 500)) / 500
              : 200 - (200 * (distance - 1000)) / 500,
      });
    }
    const result = computeFoerderung(input(points));

    // Der Druck an der Kuppe, gerechnet ab der letzten Pumpe davor.
    const letztePumpeVorDerKuppe = result.pumps
      .filter((pump) => pump.distance <= 1000)
      .pop();
    const dropAt = (distance: number) => {
      const elevation =
        distance <= 500
          ? 0
          : distance <= 1000
            ? (200 * (distance - 500)) / 500
            : 200 - (200 * (distance - 1000)) / 500;
      return distance * 0.01 + elevation * 0.1;
    };
    const druckAnDerKuppe =
      8 - (dropAt(1000) - dropAt(letztePumpeVorDerKuppe?.distance ?? 0));

    expect(druckAnDerKuppe).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(result.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('weist die Verteilung nur aus, wenn tatsächlich verteilt wurde', () => {
    // Ohne Verstärkerpumpe gibt es keinen Zwischenabschnitt, den man verteilen
    // könnte. Ein Rechenweg, der hier „Abnahme je Zwischenabschnitt 6,5 bar"
    // zeigt, beschreibt eine Rechnung, die nie stattgefunden hat.
    expect(computeFoerderung(input(profile(150))).verteilung).toBeUndefined();
    expect(computeFoerderung(input(profile(2000))).verteilung).toBeDefined();
  });

  it('nennt in der Verteilung die Zahlen, die die Standorte erzeugt haben', () => {
    // 20 bar auf 3 · 6,5 + 2 = 21,5 bar Kapazität sind 93,0 % Auslastung und
    // 6,047 bar je Zwischenabschnitt — genau der Abstand der ersten Pumpe.
    const result = computeFoerderung(input(profile(2000)));
    expect(result.verteilung?.kapazitaet).toBeCloseTo(21.5, 6);
    expect(result.verteilung?.auslastung).toBeCloseTo(20 / 21.5, 6);
    expect(result.verteilung?.abnahmeJeAbschnitt).toBeCloseTo(6.047, 3);
    expect(result.abschnitte[0].druckverlust).toBeCloseTo(
      result.verteilung?.abnahmeJeAbschnitt ?? 0,
      6
    );
  });

  it('setzt die letzte Pumpe nicht unmittelbar vor den Verteiler', () => {
    // Der weiteste erreichbare Punkt wäre 1950 m — 50 m vor dem Ende. Mit der
    // gleichmäßigen Verteilung sind es 3 · 6,047 bar = 1814 m.
    const result = computeFoerderung(input(profile(2000)));
    const letzte = result.pumps[result.pumps.length - 1];
    expect(letzte.distance).toBeCloseTo(1813.95, 2);
  });

  it('braucht bei Steigung mehr Pumpen als in der Ebene', () => {
    // +100 m auf 2000 m: 0,01 + 0,005 = 0,015 bar/m, Abstand 6,5/0,015 = 433 m
    const flach = computeFoerderung(input(profile(2000)));
    const steigend = computeFoerderung(input(profile(2000, 100)));
    expect(steigend.verstaerkerpumpen).toBeGreaterThan(flach.verstaerkerpumpen);
    expect(steigend.hoehenverlustBar).toBeCloseTo(10, 6);
    expect(steigend.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('schreibt Gefälle als Druckgewinn gut', () => {
    // −100 m auf 2000 m: 0,01 − 0,005 = 0,005 bar/m
    const flach = computeFoerderung(input(profile(2000)));
    const fallend = computeFoerderung(input(profile(2000, -100)));
    expect(fallend.verstaerkerpumpen).toBeLessThan(flach.verstaerkerpumpen);
    expect(fallend.hoehenverlustBar).toBeCloseTo(-10, 6);
  });

  it('setzt die Pumpe mitten in eine Steigung, statt sie aufs Raster zu runden', () => {
    // Letzter Abschnitt steigt 30 m auf 10 m Strecke. Vom letzten Abtastpunkt
    // (100 m) aus wären 6,0 + 3,0 + 0,1 = 9,1 bar nötig — mehr als die 8 bar
    // Ausgangsdruck. Eine Pumpe im Hang trägt die Förderung trotzdem, und genau
    // die muss der Rechner finden: gerundet meldete er „nicht darstellbar".
    const result = computeFoerderung(
      input([
        { distance: 0, elevation: 0 },
        { distance: 100, elevation: 0 },
        { distance: 110, elevation: 30 },
      ])
    );
    expect(result.darstellbar).toBe(true);
    expect(result.verstaerkerpumpen).toBe(1);
    // Der Standort liegt zwischen den Abtastpunkten, nicht auf einem.
    expect(result.pumps[1].distance).toBeGreaterThan(100);
    expect(result.pumps[1].distance).toBeLessThan(110);
    expect(result.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('löst die Pumpenabstände unabhängig vom Abtastraster', () => {
    // 1600 l/min in B 75 sind 5,00 bar je 100 m, also 0,05 bar/m: Abstände von
    // 130 m. Auf einem 50-m-Raster würden daraus 100 m — 20 Pumpen statt 16 —
    // und der letzte Abschnitt (40 m) hätte auf dem Raster keinen Standort.
    const grob: FoerderungProfilePoint[] = [];
    for (let distance = 0; distance <= 2000; distance += 50) {
      grob.push({ distance, elevation: 130 });
    }
    const result = computeFoerderung({
      profile: grob,
      frictionBarPerMeter: 0.05,
      ausgangsdruck: 8,
      eingangsdruck: 1.5,
      zieldruck: 6,
    });

    // Verteilt: 100 bar auf 16 · 6,5 + 2 = 106 bar sind 94,3 % Auslastung,
    // je Abschnitt 6,132 bar = 122,6 m. Ohne die Verteilung stünden die
    // letzten beiden Pumpen auf 1950 und 1960 m — 10 m nebeneinander.
    expect(result.pumps[1].distance).toBeCloseTo(122.64, 2);
    expect(result.verstaerkerpumpen).toBeLessThanOrEqual(17);
    expect(result.darstellbar).toBe(true);
    expect(result.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('meldet nicht darstellbar, wenn mehr Pumpen nötig wären als aufzustellen sind', () => {
    // Sehr steile, lange Steigung: geometrisch mit genügend Pumpen machbar,
    // praktisch nicht. Die Grenze ist deshalb die Pumpenzahl, nicht die Geometrie.
    // 6 km mit 30 % Steigung: 1800 m Höhe sind allein 180 bar, dazu 60 bar
    // Reibung. Bei 6,5 bar nutzbarem Druck je Pumpe sind das rund 37.
    const steil: FoerderungProfilePoint[] = [];
    for (let distance = 0; distance <= 6000; distance += 50) {
      steil.push({ distance, elevation: distance * 0.3 });
    }
    const result = computeFoerderung({
      profile: steil,
      frictionBarPerMeter: 0.01,
      ausgangsdruck: 8,
      eingangsdruck: 1.5,
      zieldruck: 6,
    });
    expect(result.verstaerkerpumpen).toBeGreaterThan(MAX_PUMPS - 1);
    expect(result.darstellbar).toBe(false);
  });

  it('gibt je Abschnitt Grenzen, Höhenunterschied und Enddruck aus', () => {
    const result = computeFoerderung(input(profile(2000)));
    expect(result.abschnitte).toHaveLength(result.pumps.length);
    expect(result.abschnitte[0].vonMeter).toBe(0);
    expect(result.abschnitte[0].bisMeter).toBeCloseTo(604.65, 2);
    expect(result.abschnitte[0].hoehenunterschied).toBeCloseTo(0, 6);
    expect(result.abschnitte[0].druckverlust).toBeCloseTo(6.047, 3);
    // Zwischenabschnitte enden **über** dem Mindest-Eingangsdruck: Die
    // Standorte sind gleichmäßig verteilt, also hat jeder Abschnitt dieselbe
    // Reserve, statt dass der erste sie aufbraucht.
    expect(result.abschnitte[0].enddruck).toBeCloseTo(1.953, 3);
    expect(result.abschnitte[0].enddruck).toBeGreaterThan(1.5);
    // Der letzte Abschnitt endet auf dem Zieldruck oder darüber.
    const letzter = result.abschnitte[result.abschnitte.length - 1];
    expect(letzter.bisMeter).toBeCloseTo(2000, 6);
    expect(letzter.enddruck).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('summiert den Reibungsverlust über die ganze Strecke', () => {
    const result = computeFoerderung(input(profile(2000)));
    expect(result.reibungsverlustBar).toBeCloseTo(20, 6);
  });

  it('behandelt ein Profil aus nur zwei Punkten', () => {
    const result = computeFoerderung(
      input([
        { distance: 0, elevation: 0 },
        { distance: 150, elevation: 0 },
      ])
    );
    expect(result.verstaerkerpumpen).toBe(0);
    expect(result.enddruck).toBeCloseTo(6.5, 6);
    expect(result.darstellbar).toBe(true);
  });
});
