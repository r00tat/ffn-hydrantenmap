import { describe, expect, it } from 'vitest';
import { computeFoerderung, type FoerderungProfilePoint } from './hydraulics';

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

  it('setzt die erste Pumpe auf 650 m — die Faustregel „etwa alle 600 m"', () => {
    // (8 − 1,5) / 0,01 = 650 m. Veröffentlicht ist „etwa alle 600 m eine
    // Verstärkerpumpe" bei 800 l/min in der Ebene.
    const result = computeFoerderung(input(profile(2000)));
    expect(result.pumps[1].distance).toBe(650);
    expect(result.pumps[1].eingangsdruck).toBeCloseTo(1.5, 6);
    expect(result.verstaerkerpumpen).toBe(3);
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

  it('setzt die letzte Pumpe nicht unmittelbar vor den Verteiler', () => {
    // Der weiteste erreichbare Punkt wäre 1950 m — 50 m vor dem Ende.
    const result = computeFoerderung(input(profile(2000)));
    const letzte = result.pumps[result.pumps.length - 1];
    expect(letzte.distance).toBe(1800);
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

  it('meldet eine Steigung als nicht darstellbar, die der Ausgangsdruck nicht hergibt', () => {
    // Letzter Abschnitt steigt 30 m: 6,0 + 3,0 + 0,1 = 9,1 > 8 bar
    const result = computeFoerderung(
      input([
        { distance: 0, elevation: 0 },
        { distance: 100, elevation: 0 },
        { distance: 110, elevation: 30 },
      ])
    );
    expect(result.darstellbar).toBe(false);
    expect(result.enddruck).toBeLessThan(6);
  });

  it('gibt je Abschnitt Grenzen, Höhenunterschied und Enddruck aus', () => {
    const result = computeFoerderung(input(profile(2000)));
    expect(result.abschnitte).toHaveLength(result.pumps.length);
    expect(result.abschnitte[0].vonMeter).toBe(0);
    expect(result.abschnitte[0].bisMeter).toBe(650);
    expect(result.abschnitte[0].hoehenunterschied).toBeCloseTo(0, 6);
    expect(result.abschnitte[0].druckverlust).toBeCloseTo(6.5, 6);
    // Zwischenabschnitte enden auf dem Mindest-Eingangsdruck, weil die Pumpe am
    // weitesten erreichbaren Punkt steht.
    expect(result.abschnitte[0].enddruck).toBeCloseTo(1.5, 6);
    // Der letzte Abschnitt endet auf dem Zieldruck oder darüber.
    const letzter = result.abschnitte[result.abschnitte.length - 1];
    expect(letzter.bisMeter).toBe(2000);
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
