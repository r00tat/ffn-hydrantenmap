// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Line } from '../../../firebase/firestore';
import {
  DAMM_DEFAULTS,
  PALETTE_MASSE_T,
  SACK_FORMATE,
  SAECKE_JE_PALETTE,
  arbeitsaufwand,
  dammQuerschnitt,
  dammbauParams,
  dammbauSummary,
  dammbauView,
  querschnittAusSaecken,
  sandsackBedarf,
} from './sandsack';

const format = SACK_FORMATE['30x60'];

/** Der Standardsack bei 66 % Füllgrad und 1,5 t/m³ — die Quellenkalibrierung. */
const SAND_JE_SACK = 0.66 * 0.015;
const VERLEGT_JE_SACK = SAND_JE_SACK * 1.25;

const basis = {
  laenge: 100,
  hoehe: 1,
  bauweise: 'pyramide' as const,
  format,
  fuellgrad: 66,
  sandDichte: 1.5,
  reserve: 10,
  personal: 12,
  zielzeit: 4,
  trichter: false,
  roedeln: false,
  transportWeite: 10,
  lkwNutzlast: 10,
  freibord: 0.3,
};

describe('Sackkennzahlen der Lehrunterlage', () => {
  it('trifft die 80 Säcke je m³ und die 15 kg je Sack', () => {
    const r = sandsackBedarf(basis);
    // „Sandsäcke je Volumen: 80 Säcke / m3" (S. 37). Bei 66 % statt genau
    // zwei Dritteln landet das Modell bei 80,8 — ein Prozent mehr Säcke, und
    // das ist die richtige Seite.
    expect(Math.abs(r.saeckeJeKubikmeter - 80)).toBeLessThan(1);
    // „30x60 cm trocken: ca. 15 kg (nass: ca. 20 kg)" (S. 35)
    expect(r.masseJeSack).toBeCloseTo(15, 0);
    expect(r.masseJeSackNass).toBeCloseTo(20, 0);
    expect(r.verlegtesVolumen).toBeCloseTo(VERLEGT_JE_SACK, 6);
  });

  it('macht einen voller gefüllten Sack schwerer und raumgreifender', () => {
    const voll = sandsackBedarf({ ...basis, fuellgrad: 100 });
    expect(voll.masseJeSack).toBeGreaterThan(
      sandsackBedarf(basis).masseJeSack
    );
    expect(voll.saeckeJeKubikmeter).toBeLessThan(80);
  });

  it('warnt über „max. 2/3 des Volumens" und beim untragbaren Sack', () => {
    expect(sandsackBedarf({ ...basis, fuellgrad: 80 }).warnings).toContain(
      'fuellgradHoch'
    );
    expect(sandsackBedarf({ ...basis, fuellgrad: 66 }).warnings).not.toContain(
      'fuellgradHoch'
    );
    // 100 % wären nass 30 kg
    expect(sandsackBedarf({ ...basis, fuellgrad: 100 }).warnings).toContain(
      'sackZuSchwer'
    );
  });
});

describe('Sackbedarf aus der Verlegetabelle', () => {
  it('nimmt beim Pyramidenstapel die Säcke je Meter aus der Tabelle', () => {
    const r = sandsackBedarf(basis);
    expect(r.saeckeSource).toBe('tabelle');
    // 120 Säcke je Meter bei 1 m Höhe, 100 m lang
    expect(r.saecke).toBe(12_000);
    expect(r.saeckeProMeter).toBeCloseTo(120, 3);
  });

  it('trifft alle vier Zeilen der Tabelle', () => {
    for (const [hoehe, jeMeter] of [
      [0.5, 40],
      [1.0, 120],
      [1.5, 275],
      [2.0, 500],
    ]) {
      const r = sandsackBedarf({ ...basis, hoehe, laenge: 100 });
      expect(r.saecke).toBe(jeMeter * 100);
    }
  });

  it('rechnet den Notdamm mit der Hälfte der Säcke und der Hälfte der Zeit', () => {
    const stapel = sandsackBedarf(basis);
    const notdamm = sandsackBedarf({ ...basis, bauweise: 'notdamm' });
    expect(notdamm.saecke).toBe(stapel.saecke / 2);
    expect(notdamm.bauzeit).toBeCloseTo(stapel.bauzeit / 2, 6);
  });

  it('leitet den Querschnitt aus der Sackzahl ab, nicht umgekehrt', () => {
    const r = sandsackBedarf(basis);
    // 120 Säcke/m × verlegtes Volumen
    expect(r.querschnitt.flaeche).toBeCloseTo(120 * VERLEGT_JE_SACK, 6);
    // Trapez mit einer Sacklänge Krone: Basis = 2A/h − Krone
    expect(r.querschnitt.basisbreite).toBeCloseTo(
      2 * r.querschnitt.flaeche - 0.5,
      6
    );
    // Das ist rund das Zweieinhalbfache der Höhe
    expect(r.querschnitt.basisbreite / basis.hoehe).toBeGreaterThan(2.3);
    expect(r.querschnitt.basisbreite / basis.hoehe).toBeLessThan(2.7);
  });

  it('warnt über der letzten Tabellenzeile', () => {
    expect(sandsackBedarf({ ...basis, hoehe: 2.5 }).warnings).toContain(
      'ueberTabelle'
    );
    expect(sandsackBedarf({ ...basis, hoehe: 2 }).warnings).not.toContain(
      'ueberTabelle'
    );
  });

  it('schaltet mit einer gesetzten Böschung auf die Geometrie um', () => {
    const r = sandsackBedarf({ ...basis, boeschung: 3 });
    expect(r.saeckeSource).toBe('geometrie');
    expect(r.warnings).toContain('geometrieStattTabelle');
    // 1 m × (0,5 + 3) / 2 = 1,75 m²
    expect(r.querschnitt.flaeche).toBeCloseTo(1.75, 6);
    expect(r.saecke).toBe(Math.ceil((1.75 * 100) / VERLEGT_JE_SACK));
  });

  it('rechnet Wall und Dammbalken immer über die Geometrie', () => {
    const wall = sandsackBedarf({ ...basis, hoehe: 0.3, bauweise: 'einfach' });
    expect(wall.saeckeSource).toBe('geometrie');
    expect(wall.warnings).not.toContain('geometrieStattTabelle');
    expect(wall.querschnitt.flaeche).toBeCloseTo(0.15, 6);

    const balken = sandsackBedarf({
      ...basis,
      hoehe: 0.8,
      bauweise: 'dammbalken',
    });
    expect(balken.querschnitt.basisbreite).toBeCloseTo(1, 6);
    expect(balken.querschnitt.flaeche).toBeCloseTo(0.8, 6);
  });

  it('warnt beim einreihigen Wall über 30 cm', () => {
    expect(
      sandsackBedarf({ ...basis, bauweise: 'einfach', hoehe: 0.5 }).warnings
    ).toContain('einfachZuHoch');
    expect(
      sandsackBedarf({ ...basis, bauweise: 'einfach', hoehe: 0.3 }).warnings
    ).not.toContain('einfachZuHoch');
  });
});

describe('Sand, Paletten und Fuhren', () => {
  it('rechnet die Sandmenge über den Füllgrad', () => {
    const r = sandsackBedarf(basis);
    expect(r.sandVolumen).toBeCloseTo(r.saecke * SAND_JE_SACK, 6);
    expect(r.sandMasse).toBeCloseTo(r.sandVolumen * 1.5, 6);
  });

  it('rechnet Paletten und LKW-Fuhren nach der Unterlage', () => {
    const r = sandsackBedarf(basis);
    // „Sandsäcke pro Palette 50 Stück"
    expect(r.paletten).toBe(Math.ceil(r.saecke / SAECKE_JE_PALETTE));
    // „Ladekapazität LKW 10 t = 10 Paletten = 500 Säcke"
    expect(r.lkwFuhrenSaecke).toBe(Math.ceil(r.saecke / 500));
    expect(SAECKE_JE_PALETTE * PALETTE_MASSE_T).toBe(50);
  });

  it('rechnet den losen Sand über die Nutzlast', () => {
    const r = sandsackBedarf(basis);
    expect(r.lkwFuhrenSand).toBe(Math.ceil(r.sandMasse / 10));
  });

  it('schlägt die Reserve nur auf die zu bestellenden Säcke', () => {
    const r = sandsackBedarf(basis);
    expect(r.saeckeBestellen).toBe(Math.ceil(r.saecke * 1.1));
  });

  it('rechnet die Folienbahn aus Höhe und Länge', () => {
    const r = sandsackBedarf({ ...basis, laenge: 50, hoehe: 1 });
    // (2 × 1 m + 1 m) Bahnbreite × 50 m × 10 % Überlappung
    expect(r.folieFlaeche).toBeCloseTo(165, 6);
  });
});

describe('arbeitsaufwand', () => {
  const quellen = {
    fuellenJePerson: () => 50,
    transport: 80,
    verbauen: 80,
  };

  it('summiert die Personenstunden je Sack aus den drei Tätigkeiten', () => {
    const a = arbeitsaufwand(12, quellen);
    expect(a.personenstundenJeSack).toBeCloseTo(1 / 50 + 1 / 80 + 1 / 80, 9);
  });

  it('verteilt die Kräfte nach dem Arbeitsanfall und trifft die Summe', () => {
    const a = arbeitsaufwand(12, quellen);
    const summe =
      a.verteilung.fuellen + a.verteilung.transport + a.verteilung.verbauen;
    expect(summe).toBe(12);
    // Füllen ist die langsamste Tätigkeit und bekommt die meisten Kräfte
    expect(a.verteilung.fuellen).toBeGreaterThan(a.verteilung.verbauen);
  });

  it('nimmt die Füllleistung bei der Truppgröße der ganzen Mannschaft', () => {
    // Ein Zweiertrupp bringt 30 Säcke je Person, ein Zehnertrupp 50 (S. 36)
    const klein = arbeitsaufwand(2, {
      ...quellen,
      fuellenJePerson: (personen) => (personen <= 2 ? 30 : 50),
    });
    expect(klein.leistung.fuellen).toBe(30);
  });

  it('bleibt ohne Kräfte bei einer leeren Verteilung', () => {
    const a = arbeitsaufwand(0, quellen);
    expect(a.verteilung).toEqual({ fuellen: 0, transport: 0, verbauen: 0 });
    expect(Number.isFinite(a.personenstundenJeSack)).toBe(true);
  });

  it('kommt mit einer Leistung von null ohne Division durch Null aus', () => {
    const a = arbeitsaufwand(10, {
      fuellenJePerson: () => 0,
      transport: 0,
      verbauen: 0,
    });
    expect(a.personenstundenJeSack).toBe(0);
  });
});

describe('Personal und Bauzeit', () => {
  it('rechnet die Bauzeit aus den Personenstunden', () => {
    const r = sandsackBedarf(basis);
    expect(r.personenstunden).toBeCloseTo(
      r.saecke * r.personenstundenJeSack,
      6
    );
    expect(r.bauzeit).toBeCloseTo(r.personenstunden / 12, 6);
    expect(
      r.personalVerteilung.fuellen +
        r.personalVerteilung.transport +
        r.personalVerteilung.verbauen
    ).toBe(12);
  });

  it('reproduziert die Verlegezeit der Unterlage', () => {
    // 100 m × 1 m sind 12.000 Säcke; bei 80 Säcken je Person und Stunde und
    // 10 Helfern entfallen 15 h aufs Verlegen — genau die 9 Minuten je Meter
    // mal 100 Meter aus der Verlegetabelle.
    const r = sandsackBedarf({ ...basis, personal: 10 });
    expect(r.saecke).toBe(12_000);
    expect(r.saecke / r.leistung.verbauen / 10).toBeCloseTo(15, 6);
    expect((9 * 100) / 60).toBeCloseTo(15, 6);
  });

  it('wird mit mehr Kräften nie langsamer', () => {
    let vorher = Number.POSITIVE_INFINITY;
    for (let personal = 1; personal <= 80; personal += 1) {
      const { bauzeit } = sandsackBedarf({ ...basis, personal });
      expect(bauzeit).toBeLessThanOrEqual(vorher);
      vorher = bauzeit;
    }
  });

  it('nennt die Verlegeleistung der Unterlage', () => {
    const r = sandsackBedarf(basis);
    // 0,75 Personenminuten je Sack
    expect(r.leistung.verbauen).toBe(80);
    expect(r.leistung.transport).toBe(80);
  });

  it('macht die Füllhilfe und das Zubinden in der Leistung sichtbar', () => {
    const ohne = sandsackBedarf(basis);
    const mitTrichter = sandsackBedarf({ ...basis, trichter: true });
    const geroedelt = sandsackBedarf({ ...basis, roedeln: true });

    expect(mitTrichter.leistung.fuellen).toBeGreaterThan(
      ohne.leistung.fuellen
    );
    expect(mitTrichter.bauzeit).toBeLessThan(ohne.bauzeit);
    // Zubinden halbiert die Füllleistung
    expect(geroedelt.leistung.fuellen * 2).toBeCloseTo(
      ohne.leistung.fuellen,
      6
    );
    expect(geroedelt.bauzeit).toBeGreaterThan(ohne.bauzeit);
  });

  it('macht die längere Trageweite in der Bauzeit sichtbar', () => {
    const kurz = sandsackBedarf({ ...basis, transportWeite: 10 });
    const weit = sandsackBedarf({ ...basis, transportWeite: 40 });
    expect(weit.bauzeit).toBeGreaterThan(kurz.bauzeit);
    expect(weit.leistung.transport).toBeCloseTo(20, 6);
    expect(weit.kettenHelfer).toBe(40);
  });

  it('nennt das Personal für die gewünschte Fertigstellungszeit', () => {
    const r = sandsackBedarf(basis);
    expect(r.personalFuerZielzeit).toBeGreaterThan(basis.personal);
    // Mit dieser Mannschaft trägt es dann auch
    const mit = sandsackBedarf({
      ...basis,
      personal: r.personalFuerZielzeit,
    });
    expect(mit.bauzeit).toBeLessThanOrEqual(basis.zielzeit);
  });

  it('lässt die Leistungswerte von Hand überschreiben', () => {
    // Eine Füllanlage schafft ein Mehrfaches der Handarbeit.
    const r = sandsackBedarf({ ...basis, fuellLeistung: 250 });
    expect(r.leistung.fuellen).toBe(250);
    expect(r.bauzeit).toBeLessThan(sandsackBedarf(basis).bauzeit);
  });

  it('kommt ohne Personal ohne Division durch Null aus', () => {
    const r = sandsackBedarf({ ...basis, personal: 0 });
    expect(r.bauzeit).toBe(0);
    expect(r.warnings).toContain('keinPersonal');
  });

  it('warnt, wenn die Zielzeit mit den Kräften nicht zu halten ist', () => {
    expect(
      sandsackBedarf({ ...basis, personal: 4, zielzeit: 2 }).warnings
    ).toContain('zielzeitVerfehlt');
  });
});

describe('Wasserstand und Freibord', () => {
  it('nennt die Wasserhöhe, die der Damm mit dem Freibord hält', () => {
    expect(sandsackBedarf(basis).wasserstand).toBeCloseTo(0.7, 6);
  });

  it('meldet einen aufgezehrten Wasserstand', () => {
    const r = sandsackBedarf({ ...basis, hoehe: 0.2, bauweise: 'einfach' });
    expect(r.wasserstand).toBe(0);
    expect(r.warnings).toContain('freibordUeberHoehe');
  });
});

describe('ohne gezeichnete Strecke', () => {
  it('warnt und rechnet nichts', () => {
    const r = sandsackBedarf({ ...basis, laenge: 0 });
    expect(r.warnings).toContain('keineStrecke');
    expect(r.saecke).toBe(0);
    expect(r.bauzeit).toBe(0);
    expect(r.paletten).toBe(0);
  });
});

describe('dammQuerschnitt', () => {
  it('rechnet den einfachen Wall als Rechteck aus einer Sacklänge', () => {
    const q = dammQuerschnitt('einfach', 0.3, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(0.5, 6);
    expect(q.flaeche).toBeCloseTo(0.15, 6);
  });

  it('rechnet den Dammbalken-Ersatz zwei Sacklängen tief', () => {
    const q = dammQuerschnitt('dammbalken', 0.8, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(1, 6);
    expect(q.flaeche).toBeCloseTo(0.8, 6);
  });

  it('rechnet den Stapel als Trapez mit Basis = Böschung × Höhe', () => {
    const q = dammQuerschnitt('pyramide', 1, 0.5, 3);
    expect(q.basisbreite).toBeCloseTo(3, 6);
    expect(q.flaeche).toBeCloseTo(1.75, 6);
  });

  it('lässt die Basis nie unter die Krone fallen', () => {
    expect(dammQuerschnitt('pyramide', 0.1, 0.5, 3).basisbreite).toBeCloseTo(
      0.5,
      6
    );
  });
});

describe('querschnittAusSaecken', () => {
  it('rechnet aus der Sackzahl auf Fläche und Basis zurück', () => {
    const q = querschnittAusSaecken(120, 1, 0.5, 0.0125);
    expect(q.flaeche).toBeCloseTo(1.5, 6);
    // 2 × 1,5 / 1 − 0,5
    expect(q.basisbreite).toBeCloseTo(2.5, 6);
  });

  it('bleibt ohne Höhe bei der Kronenbreite', () => {
    const q = querschnittAusSaecken(120, 0, 0.5, 0.0125);
    expect(q.basisbreite).toBeCloseTo(0.5, 6);
    expect(q.flaeche).toBe(0);
  });
});

describe('dammbauParams', () => {
  it('füllt fehlende Felder mit den Vorbelegungen', () => {
    const params = dammbauParams({ type: 'line', name: 'Damm' } as Line);
    expect(params).toMatchObject(DAMM_DEFAULTS);
    // Ohne Handeingabe rechnet die Tabelle.
    expect(params.dammBoeschung).toBeUndefined();
    expect(params.fuellLeistung).toBeUndefined();
  });

  it('übernimmt gesetzte Felder und verwirft unbrauchbare', () => {
    const params = dammbauParams({
      type: 'line',
      name: 'Damm',
      dammHoehe: 1.2,
      dammPersonal: Number.NaN,
      sackFormat: '40x70',
      dammBauweise: 'notdamm',
      fuellTrichter: 'true',
      saeckeRoedeln: 'true',
      dammBoeschung: 2.5,
    } as Line);
    expect(params.dammHoehe).toBe(1.2);
    expect(params.dammPersonal).toBe(DAMM_DEFAULTS.dammPersonal);
    expect(params.sackFormat).toBe('40x70');
    expect(params.dammBauweise).toBe('notdamm');
    expect(params.fuellTrichter).toBe(true);
    expect(params.saeckeRoedeln).toBe(true);
    expect(params.dammBoeschung).toBe(2.5);
  });

  it('fällt bei unbekanntem Sackformat auf den Standardsack zurück', () => {
    expect(
      dammbauParams({
        type: 'line',
        name: 'D',
        sackFormat: 'gibtesnicht',
      } as Line).sackFormat
    ).toBe(DAMM_DEFAULTS.sackFormat);
  });

  it('nimmt eine Null-Böschung nicht als Handeingabe', () => {
    expect(
      dammbauParams({ type: 'line', name: 'D', dammBoeschung: 0 } as Line)
        .dammBoeschung
    ).toBeUndefined();
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
    const hoch = dammbauView(dammLine(), { dammHoehe: 1.5 })!;
    const flach = dammbauView(dammLine(), { dammHoehe: 1 })!;
    expect(hoch.bedarf.saecke).toBeGreaterThan(flach.bedarf.saecke);
    expect(hoch.params.dammHoehe).toBe(1.5);
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
