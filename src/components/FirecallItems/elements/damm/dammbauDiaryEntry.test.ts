// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Line } from '../../../firebase/firestore';
import { dammSumme } from './dammSumme';
import {
  buildDammbauDiaryEntry,
  type DammbauDiaryLabels,
} from './dammbauDiaryEntry';
import { dammbauView } from './sandsack';

const labels: DammbauDiaryLabels = {
  title: (name) => `Sandsackdamm ${name}`,
  section: (laenge, hoehe, bauweise) =>
    `Abschnitt: ${laenge} m, ${hoehe} m hoch, ${bauweise}`,
  bags: (count, reserve) => `Sandsäcke: ${count} (Anforderung ${reserve})`,
  sand: (tons, cubic) => `Sand: ${tons} t (${cubic} m³)`,
  trucks: (count) => `LKW-Fuhren: ${count}`,
  foil: (squareMetres) => `Folie: ${squareMetres} m²`,
  work: (hours, personal) => `Bauzeit: ${hours} h mit ${personal} Kräften`,
  targetTime: (hours, personal) => `Für ${hours} h: ${personal} Kräfte`,
  totalTitle: (count) => `Summe über ${count} Abschnitte`,
  totalBags: (count) => `Säcke gesamt: ${count}`,
  totalSand: (tons) => `Sand gesamt: ${tons} t`,
  totalTrucks: (count) => `Fuhren gesamt: ${count}`,
};

const line = (fields: Partial<Line> = {}): Line =>
  ({
    type: 'line',
    name: 'Uferstraße',
    dammbau: 'true',
    positions: JSON.stringify([
      [47.9, 16.84],
      [47.9 + 100 / 111_320, 16.84],
    ]),
    ...fields,
  }) as Line;

describe('buildDammbauDiaryEntry', () => {
  const view = dammbauView(line({ dammHoehe: 1 }))!;

  it('schreibt einen Materialeintrag mit dem Namen der Dammlinie', () => {
    const entry = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      labels,
    });
    expect(entry.type).toBe('diary');
    expect(entry.art).toBe('M');
    expect(entry.datum).toBe('2026-08-23T10:00:00.000Z');
    expect(entry.name).toBe('Sandsackdamm Uferstraße');
  });

  it('nennt Säcke, Sand, Fuhren, Folie und Personal', () => {
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      labels,
    }).beschreibung!;
    expect(text).toContain('Sandsäcke:');
    expect(text).toContain('Anforderung');
    expect(text).toContain('Sand:');
    expect(text).toContain('LKW-Fuhren:');
    expect(text).toContain('Folie:');
    expect(text).toContain('Bauzeit:');
    expect(text).toContain('Für');
  });

  it('rundet die Mengen auf brauchbare Stellen', () => {
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      labels,
    }).beschreibung!;
    // Keine Nachkommastellen bei Stückzahlen, keine Bruchteile eines Sackes
    expect(text).not.toMatch(/Sandsäcke: \d+\.\d/);
    expect(text).not.toMatch(/LKW-Fuhren: \d+\.\d/);
  });

  it('hängt die Summe an, sobald es mehr als einen Abschnitt gibt', () => {
    const summe = dammSumme([
      line({ name: 'Uferstraße' }),
      line({ name: 'Hofeinfahrt', dammHoehe: 0.5 }),
    ]);
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      summe,
      labels,
    }).beschreibung!;
    expect(text).toContain('Summe über 2 Abschnitte');
    expect(text).toContain('Säcke gesamt:');
    expect(text).toContain('Fuhren gesamt:');
  });

  it('lässt die Summe weg, wenn es nur diesen Abschnitt gibt', () => {
    const summe = dammSumme([line({ name: 'Uferstraße' })]);
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      summe,
      labels,
    }).beschreibung!;
    expect(text).not.toContain('Summe über');
  });
});
