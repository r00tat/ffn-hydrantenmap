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
  bags: (order, needed, reserve) =>
    `Sandsäcke: ${order} anfordern (Bedarf ${needed} + ${reserve} % Reserve)`,
  sand: (tons, cubic) => `Sand: ${tons} t (${cubic} m³)`,
  pallets: (count) => `Paletten: ${count}`,
  trucksBags: (count) => `LKW-Fuhren Säcke: ${count}`,
  trucksSand: (count) => `LKW-Fuhren Sand: ${count}`,
  foil: (squareMetres) => `Folie: ${squareMetres} m²`,
  bagFormat: (format, fillLevel, weightWet) =>
    `Sackformat ${format}, ${fillLevel} %, ${weightWet} kg nass`,
  tools: (shovels, funnels) =>
    `Schaufeln: ${shovels}, Füllhilfen: ${funnels}`,
  waterLevel: (level, freeboard) =>
    `Hält ${level} m bei ${freeboard} m Freibord`,
  crossSection: (base, crown, layers) =>
    `Querschnitt: Basis ${base} m, Krone ${crown} m, ${layers} Lagen`,
  split: (fill, transport, lay) =>
    `Aufteilung: ${fill}/${transport}/${lay}`,
  carry: (metres, helpers) => `Trageweite ${metres} m, ${helpers} Helfer`,
  source: 'Sackzahl aus der Verlegetabelle',
  funnel: 'Mit Füllhilfe',
  tie: 'Säcke zugebunden',
  work: (hours, personal) => `Bauzeit: ${hours} h mit ${personal} Kräften`,
  totalTitle: (count) => `Summe über ${count} Abschnitte`,
  totalBags: (count) => `Säcke gesamt: ${count}`,
  totalSand: (tons) => `Sand gesamt: ${tons} t`,
  totalTrucks: (count) => `Fuhren gesamt: ${count}`,
  totalPersonnel: (count, hours) =>
    `Kräfte gesamt: ${count} für ${hours} h`,
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
      formatLabel: '30 × 60 cm',
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
      formatLabel: '30 × 60 cm',
      labels,
    }).beschreibung!;
    expect(text).toContain('Sandsäcke:');
    expect(text).toContain('anfordern');
    expect(text).toContain('Sand:');
    expect(text).toContain('Paletten:');
    expect(text).toContain('LKW-Fuhren Säcke:');
    expect(text).toContain('LKW-Fuhren Sand:');
    expect(text).toContain('Folie:');
    expect(text).toContain('Bauzeit:');
  });

  it('trägt alles mit, was im Formular steht', () => {
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      formatLabel: '30 × 60 cm',
      labels,
    }).beschreibung!;

    expect(text).toContain('Hält');
    expect(text).toContain('Freibord');
    expect(text).toContain('Querschnitt:');
    expect(text).toContain('Sackzahl aus der Verlegetabelle');
    expect(text).toContain('Sackformat');
    expect(text).toContain('kg nass');
    expect(text).toContain('Schaufeln:');
    expect(text).toContain('Aufteilung:');
    expect(text).toContain('Trageweite');
  });

  it('nennt Füllhilfe und Zubinden nur, wenn sie zutreffen', () => {
    const ohne = buildDammbauDiaryEntry({
      dammName: 'A',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      formatLabel: '30 × 60 cm',
      labels,
    }).beschreibung!;
    expect(ohne).not.toContain('Mit Füllhilfe');
    expect(ohne).not.toContain('zugebunden');

    const mit = buildDammbauDiaryEntry({
      dammName: 'A',
      view: dammbauView(
        line({ fuellTrichter: 'true', saeckeRoedeln: 'true' })
      )!,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      formatLabel: '30 × 60 cm',
      labels,
    }).beschreibung!;
    expect(mit).toContain('Mit Füllhilfe');
    expect(mit).toContain('zugebunden');
  });

  it('rundet die Mengen auf brauchbare Stellen', () => {
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      formatLabel: '30 × 60 cm',
      labels,
    }).beschreibung!;
    // Keine Nachkommastellen bei Stückzahlen, keine Bruchteile eines Sackes
    expect(text).not.toMatch(/Sandsäcke: \d+\.\d/);
    // Angefordert wird mehr als der reine Bedarf — die Reserve ist drin.
    const [, order, needed] =
      /Sandsäcke: (\d+) anfordern \(Bedarf (\d+)/.exec(text) ?? [];
    expect(Number(order)).toBeGreaterThan(Number(needed));
    expect(text).not.toMatch(/LKW-Fuhren Säcke: \d+\.\d/);
    expect(text).not.toMatch(/Paletten: \d+\.\d/);
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
      formatLabel: '30 × 60 cm',
      summe,
      labels,
    }).beschreibung!;
    expect(text).toContain('Summe über 2 Abschnitte');
    expect(text).toContain('Säcke gesamt:');
    expect(text).toContain('Fuhren gesamt:');
    expect(text).toContain('Kräfte gesamt:');
  });

  it('lässt die Summe weg, wenn es nur diesen Abschnitt gibt', () => {
    const summe = dammSumme([line({ name: 'Uferstraße' })]);
    const text = buildDammbauDiaryEntry({
      dammName: 'Uferstraße',
      view,
      timestamp: '2026-08-23T10:00:00.000Z',
      bauweiseLabel: 'Pyramidenstapel',
      formatLabel: '30 × 60 cm',
      summe,
      labels,
    }).beschreibung!;
    expect(text).not.toContain('Summe über');
  });
});
