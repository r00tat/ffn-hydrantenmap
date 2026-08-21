import { describe, expect, it } from 'vitest';
import type { FoerderungView } from '../foerderung/foerderung';
import type { PendelView } from './pendelverkehr';
import {
  VERGLEICH_DEFAULTS,
  versorgungVergleich,
} from './versorgungVergleich';

/**
 * Nur die Felder, die der Vergleich liest. Der Rest der Sicht ist für ihn
 * unerheblich — würde er mehr brauchen, stünde es hier.
 */
const foerderung = (
  overrides: {
    length?: number;
    pumps?: number;
    darstellbar?: boolean;
    foerderMenge?: number;
    paralleleLeitungen?: number;
  } = {}
): FoerderungView =>
  ({
    length: overrides.length ?? 1000,
    params: {
      foerderMenge: overrides.foerderMenge ?? 800,
      paralleleLeitungen: overrides.paralleleLeitungen ?? 1,
    },
    pumps: Array.from({ length: overrides.pumps ?? 2 }, () => ({})),
    result: { darstellbar: overrides.darstellbar ?? true },
  }) as unknown as FoerderungView;

const pendel = (
  overrides: {
    menge?: number;
    umlaufzeit?: number;
    traegtSollmenge?: boolean;
    kipppunkt?: number;
    fahrzeuge?: number;
    sollMenge?: number;
  } = {}
): PendelView =>
  ({
    sollMenge: overrides.sollMenge ?? 800,
    params: { fahrzeuge: overrides.fahrzeuge ?? 4 },
    result: {
      menge: overrides.menge ?? 900,
      umlaufzeit: overrides.umlaufzeit ?? 10,
      traegtSollmenge: overrides.traegtSollmenge ?? true,
      kipppunkt: overrides.kipppunkt,
    },
  }) as unknown as PendelView;

describe('versorgungVergleich', () => {
  it('nimmt die Umlaufzeit als Aufbauzeit des Pendelverkehrs', () => {
    // Abgeleitet, ohne neue Annahme: Eingeschwungen ist der Umlauf nach einer
    // Umlaufzeit.
    const vergleich = versorgungVergleich(foerderung(), pendel({ umlaufzeit: 11 }));
    expect(vergleich.pendel.aufbauzeit).toBeCloseTo(11, 9);
  });

  it('rechnet die Aufbauzeit der Förderung aus Länge und Pumpenzahl', () => {
    // 1000 m bei 100 m/min sind 10 min, dazu 2 Pumpen à 3 min ⇒ 16 min.
    const vergleich = versorgungVergleich(
      foerderung({ length: 1000, pumps: 2 }),
      pendel()
    );
    expect(vergleich.foerderung.aufbauzeit).toBeCloseTo(16, 9);
  });

  it('zählt parallele Leitungen als doppelte Verlegearbeit', () => {
    const vergleich = versorgungVergleich(
      foerderung({ length: 1000, pumps: 2, paralleleLeitungen: 2 }),
      pendel()
    );
    expect(vergleich.foerderung.aufbauzeit).toBeCloseTo(26, 9);
  });

  it('nimmt geänderte Planungswerte', () => {
    const vergleich = versorgungVergleich(
      foerderung({ length: 600, pumps: 1 }),
      pendel(),
      { verlegeleistung: 60, pumpenRuestzeit: 5 }
    );
    expect(vergleich.foerderung.aufbauzeit).toBeCloseTo(15, 9);
  });

  it('empfiehlt den Pendelverkehr, wenn er schneller aufgebaut ist', () => {
    const vergleich = versorgungVergleich(
      foerderung({ length: 2000, pumps: 3 }),
      pendel({ umlaufzeit: 10 })
    );
    expect(vergleich.pendel.traegtSollmenge).toBe(true);
    expect(vergleich.foerderung.traegtSollmenge).toBe(true);
    expect(vergleich.empfehlung).toBe('pendel');
  });

  it('empfiehlt die Förderung, wenn sie schneller aufgebaut ist', () => {
    const vergleich = versorgungVergleich(
      foerderung({ length: 300, pumps: 1 }),
      pendel({ umlaufzeit: 20 })
    );
    expect(vergleich.empfehlung).toBe('foerderung');
  });

  it('empfiehlt die einzige Variante, die die Sollmenge trägt', () => {
    expect(
      versorgungVergleich(
        foerderung({ darstellbar: false }),
        pendel({ traegtSollmenge: true })
      ).empfehlung
    ).toBe('pendel');

    expect(
      versorgungVergleich(
        foerderung({ darstellbar: true }),
        pendel({ traegtSollmenge: false })
      ).empfehlung
    ).toBe('foerderung');
  });

  it('empfiehlt keine, wenn keine die Sollmenge trägt', () => {
    const vergleich = versorgungVergleich(
      foerderung({ darstellbar: false }),
      pendel({ traegtSollmenge: false })
    );
    expect(vergleich.empfehlung).toBe('keine');
  });

  it('bleibt unklar bei gleicher Aufbauzeit', () => {
    // 1000 m, 2 Pumpen ⇒ 16 min auf beiden Seiten. Eine Empfehlung wäre hier
    // eine Münze, nicht ein Argument.
    const vergleich = versorgungVergleich(
      foerderung({ length: 1000, pumps: 2 }),
      pendel({ umlaufzeit: 16 })
    );
    expect(vergleich.empfehlung).toBe('unklar');
  });

  it('bleibt unklar, wenn eine Seite fehlt', () => {
    expect(versorgungVergleich(undefined, pendel()).empfehlung).toBe('unklar');
    expect(versorgungVergleich(foerderung(), undefined).empfehlung).toBe(
      'unklar'
    );
  });

  it('gibt Menge, Fahrzeuge und Kipppunkt weiter', () => {
    const vergleich = versorgungVergleich(
      foerderung({ foerderMenge: 800, pumps: 3 }),
      pendel({ menge: 900, fahrzeuge: 5, kipppunkt: 2600 })
    );
    expect(vergleich.sollMenge).toBe(800);
    expect(vergleich.pendel.menge).toBe(900);
    expect(vergleich.pendel.fahrzeuge).toBe(5);
    expect(vergleich.foerderung.menge).toBe(800);
    expect(vergleich.foerderung.fahrzeuge).toBe(3);
    expect(vergleich.kipppunkt).toBe(2600);
  });

  it('weist die Menge der Förderung nur aus, wenn sie darstellbar ist', () => {
    // Eine Leitung, die mit diesen Mitteln nicht zu legen ist, liefert nicht
    // „800 l/min" — sie liefert nichts.
    expect(
      versorgungVergleich(foerderung({ darstellbar: false }), pendel())
        .foerderung.menge
    ).toBeUndefined();
  });

  it('lässt die Vorgabewerte stehen, wenn am Element nichts steht', () => {
    // Ein fehlendes Feld kommt als `undefined` an. Würde es die Vorbelegung
    // überschreiben, wäre die Aufbauzeit NaN und die Empfehlung schwiege.
    const vergleich = versorgungVergleich(
      foerderung({ length: 1000, pumps: 2 }),
      pendel({ umlaufzeit: 30 }),
      { verlegeleistung: undefined, pumpenRuestzeit: undefined }
    );
    expect(vergleich.annahmen).toEqual(VERGLEICH_DEFAULTS);
    expect(vergleich.foerderung.aufbauzeit).toBeCloseTo(16, 9);
    expect(vergleich.empfehlung).toBe('foerderung');
  });

  it('hat belegbare Vorgabewerte', () => {
    expect(VERGLEICH_DEFAULTS.verlegeleistung).toBe(100);
    expect(VERGLEICH_DEFAULTS.pumpenRuestzeit).toBe(3);
  });
});
