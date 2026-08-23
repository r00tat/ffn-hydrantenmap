// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Line } from '../../../firebase/firestore';
import {
  DAMM_DEFAULTS,
  SACK_FORMATE,
  dammQuerschnitt,
  dammbauParams,
  dammbauView,
  dammbauSummary,
  sandsackBedarf,
} from './sandsack';

describe('dammQuerschnitt', () => {
  it('rechnet den einfachen Wall als Rechteck aus einer Sacklänge', () => {
    const q = dammQuerschnitt('einfach', 0.4, 0.5, 3);
    expect(q.kronenbreite).toBeCloseTo(0.5);
    expect(q.basisbreite).toBeCloseTo(0.5);
    expect(q.flaeche).toBeCloseTo(0.2);
  });

  it('rechnet den Dammbalken-Ersatz zwei Sacklängen tief', () => {
    const q = dammQuerschnitt('dammbalken', 0.8, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(1.0);
    expect(q.flaeche).toBeCloseTo(0.8);
  });

  it('rechnet den Pyramidenstapel als Trapez mit Basis = Böschung × Höhe', () => {
    const q = dammQuerschnitt('pyramide', 1, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(3);
    // (0,5 + 3) / 2 × 1
    expect(q.flaeche).toBeCloseTo(1.75);
  });

  it('lässt die Basis des Pyramidenstapels nie unter die Krone fallen', () => {
    const q = dammQuerschnitt('pyramide', 0.1, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(0.5);
    expect(q.flaeche).toBeCloseTo(0.05);
  });
});

describe('sandsackBedarf', () => {
  const basis = {
    laenge: 100,
    hoehe: 1,
    bauweise: 'pyramide' as const,
    boeschung: 3,
    format: SACK_FORMATE['30x60'],
    fuellgrad: 66,
    sandDichte: 1.5,
    reserve: 10,
    personal: 12,
    zielzeit: 4,
    fuellLeistung: 40,
    transportLeistung: 50,
    verbauLeistung: 60,
    fuhrenVolumen: 8,
    freibord: 0.3,
  };

  it('leitet die Sackzahl aus Querschnitt und verlegtem Sackvolumen ab', () => {
    const r = sandsackBedarf(basis);
    // 1,75 m² × 100 m = 175 m³ Damm, 0,015 m³ je verlegtem Sack
    expect(r.querschnitt.flaeche).toBeCloseTo(1.75);
    expect(r.dammVolumen).toBeCloseTo(175);
    expect(r.saecke).toBe(Math.ceil(175 / 0.015));
    expect(r.saeckeProMeter).toBeCloseTo(r.saecke / 100, 1);
  });

  it('rechnet die Sandmenge über den Füllgrad, nicht über das verlegte Volumen', () => {
    const r = sandsackBedarf(basis);
    // 66 % von 15 l je Sack
    expect(r.sandVolumen).toBeCloseTo(r.saecke * 0.0099, 1);
    expect(r.sandMasse).toBeCloseTo(r.sandVolumen * 1.5, 3);
    expect(r.masseJeSack).toBeCloseTo(0.0099 * 1500, 0);
  });

  it('rundet die LKW-Fuhren auf', () => {
    const r = sandsackBedarf({ ...basis, laenge: 10 });
    expect(r.fuhren).toBe(Math.ceil(r.sandVolumen / 8));
    expect(r.fuhren).toBeGreaterThan(0);
  });

  it('schlägt die Reserve nur auf die zu bestellenden Säcke', () => {
    const r = sandsackBedarf(basis);
    expect(r.saeckeBestellen).toBe(Math.ceil(r.saecke * 1.1));
    expect(r.saeckeBestellen).toBeGreaterThan(r.saecke);
  });

  it('summiert die Personenstunden aus Füllen, Transport und Verbauen', () => {
    const r = sandsackBedarf(basis);
    const erwartet =
      r.saecke / 40 + r.saecke / 50 + r.saecke / 60;
    expect(r.personenstunden).toBeCloseTo(erwartet, 6);
    expect(r.bauzeit).toBeCloseTo(erwartet / 12, 6);
  });

  it('nennt das Personal für die gewünschte Fertigstellungszeit', () => {
    const r = sandsackBedarf(basis);
    expect(r.personalFuerZielzeit).toBe(
      Math.ceil(r.personenstunden / 4)
    );
  });

  it('verteilt das vorhandene Personal nach dem Arbeitsanfall', () => {
    const r = sandsackBedarf(basis);
    const summe =
      r.personalVerteilung.fuellen +
      r.personalVerteilung.transport +
      r.personalVerteilung.verbauen;
    expect(summe).toBe(12);
    // Füllen ist die langsamste Tätigkeit und bekommt die meisten Kräfte
    expect(r.personalVerteilung.fuellen).toBeGreaterThan(
      r.personalVerteilung.verbauen
    );
  });

  it('nennt die Wasserhöhe, die der Damm mit dem Freibord hält', () => {
    const r = sandsackBedarf(basis);
    expect(r.wasserstand).toBeCloseTo(0.7);
  });

  it('meldet einen negativen Wasserstand, wenn das Freibord die Höhe frisst', () => {
    const r = sandsackBedarf({ ...basis, hoehe: 0.2, bauweise: 'einfach' });
    expect(r.wasserstand).toBe(0);
    expect(r.warnings).toContain('freibordUeberHoehe');
  });

  it('warnt, wenn der einfache Wall über 0,5 m hoch werden soll', () => {
    expect(
      sandsackBedarf({ ...basis, bauweise: 'einfach', hoehe: 0.8 }).warnings
    ).toContain('einfachZuHoch');
    expect(
      sandsackBedarf({ ...basis, bauweise: 'einfach', hoehe: 0.4 }).warnings
    ).not.toContain('einfachZuHoch');
  });

  it('warnt bei einem Füllgrad, für den das verlegte Maß nicht mehr gilt', () => {
    expect(
      sandsackBedarf({ ...basis, fuellgrad: 95 }).warnings
    ).toContain('fuellgradHoch');
  });

  it('warnt, wenn der Damm für Sandsäcke zu hoch geplant ist', () => {
    expect(sandsackBedarf({ ...basis, hoehe: 2.5 }).warnings).toContain(
      'hoeheUngewoehnlich'
    );
  });

  it('warnt ohne gezeichnete Strecke und rechnet dann nichts', () => {
    const r = sandsackBedarf({ ...basis, laenge: 0 });
    expect(r.warnings).toContain('keineStrecke');
    expect(r.saecke).toBe(0);
    expect(r.bauzeit).toBe(0);
  });

  it('warnt, wenn der Damm mit dem vorhandenen Personal die Zielzeit reißt', () => {
    const r = sandsackBedarf({ ...basis, personal: 2, zielzeit: 2 });
    expect(r.warnings).toContain('zielzeitVerfehlt');
  });

  it('rechnet die Folienbahn aus Höhe und Länge', () => {
    const r = sandsackBedarf({ ...basis, laenge: 50, hoehe: 1 });
    // (2 × 1 m + 1 m) Bahnbreite × 50 m × 10 % Überlappung
    expect(r.folieFlaeche).toBeCloseTo(165);
  });

  it('kommt ohne Personal ohne Division durch Null aus', () => {
    const r = sandsackBedarf({ ...basis, personal: 0 });
    expect(Number.isFinite(r.bauzeit)).toBe(true);
    expect(r.bauzeit).toBe(0);
    expect(r.warnings).toContain('keinPersonal');
  });
});

describe('dammbauParams', () => {
  it('füllt fehlende Felder mit den Vorbelegungen', () => {
    const params = dammbauParams({ type: 'line', name: 'Damm' } as Line);
    expect(params).toMatchObject(DAMM_DEFAULTS);
  });

  it('übernimmt gesetzte Felder und verwirft unbrauchbare', () => {
    const params = dammbauParams({
      type: 'line',
      name: 'Damm',
      dammHoehe: 1.2,
      dammPersonal: Number.NaN,
      sackFormat: '40x60',
      dammBauweise: 'einfach',
    } as Line);
    expect(params.dammHoehe).toBe(1.2);
    expect(params.dammPersonal).toBe(DAMM_DEFAULTS.dammPersonal);
    expect(params.sackFormat).toBe('40x60');
    expect(params.dammBauweise).toBe('einfach');
  });

  it('fällt bei unbekanntem Sackformat auf den Standardsack zurück', () => {
    const params = dammbauParams({
      type: 'line',
      name: 'Damm',
      sackFormat: 'gibtesnicht',
    } as Line);
    expect(params.sackFormat).toBe(DAMM_DEFAULTS.sackFormat);
  });

  it('lässt das Personal nicht negativ werden', () => {
    expect(
      dammbauParams({ type: 'line', name: 'D', dammPersonal: -3 } as Line)
        .dammPersonal
    ).toBe(0);
  });
});

const dammLine = (fields: Partial<Line> = {}): Line =>
  ({
    type: 'line',
    name: 'Dammlinie',
    dammbau: 'true',
    // rund 111 m entlang eines Breitengrades
    positions: JSON.stringify([
      [47.9, 16.84],
      [47.901, 16.84],
    ]),
    ...fields,
  }) as Line;

describe('dammbauView', () => {
  it('liefert kein Ergebnis, solange der Rechner nicht aktiv ist', () => {
    expect(dammbauView(dammLine({ dammbau: undefined }))).toBeUndefined();
    expect(dammbauView(dammLine({ dammbau: 'false' }))).toBeUndefined();
  });

  it('nimmt die Länge aus der gezeichneten Linie', () => {
    const view = dammbauView(dammLine());
    expect(view?.laenge).toBeGreaterThan(100);
    expect(view?.laenge).toBeLessThan(120);
    expect(view?.bedarf.saecke).toBeGreaterThan(0);
  });

  it('rechnet mit Überschreibungen, ohne sie zu speichern', () => {
    const view = dammbauView(dammLine(), { dammHoehe: 2 });
    const ohne = dammbauView(dammLine());
    expect(view!.bedarf.saecke).toBeGreaterThan(ohne!.bedarf.saecke);
    expect(view!.params.dammHoehe).toBe(2);
  });
});

describe('dammbauSummary', () => {
  it('bleibt ohne aktiven Rechner leer', () => {
    expect(dammbauSummary(dammLine({ dammbau: undefined }))).toBeUndefined();
  });

  it('nennt Höhe und Sackzahl', () => {
    const summary = dammbauSummary(dammLine({ dammHoehe: 1 }));
    expect(summary).toMatch(/Sandsäcke/);
    expect(summary).toMatch(/1(,0)? m/);
  });

  it('bleibt ohne gezeichnete Strecke leer', () => {
    expect(
      dammbauSummary(dammLine({ positions: JSON.stringify([]) }))
    ).toBeUndefined();
  });
});
