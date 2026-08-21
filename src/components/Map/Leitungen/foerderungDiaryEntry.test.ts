import { describe, expect, it } from 'vitest';
import type { FoerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { buildFoerderungDiaryEntry } from './foerderungDiaryEntry';

const labels = {
  title: (name: string) => `Löschwasserförderung ${name}`,
  flow: (value: number) => `Fördermenge: ${value} l/min`,
  pumps: (count: number) => `${count} Verstärkerpumpen`,
  length: (metres: number, hoses: number) =>
    `Leitung: ${metres} m, ${hoses} Schlauchlängen`,
  elevation: (metres: number) => `Höhenunterschied: ${metres} m`,
  friction: (bar: number) => `Reibungsverlust: ${bar} bar je 100 m`,
  targetPressure: (bar: number) => `Druck am Ende: ${bar} bar`,
  outputPressure: (bar: number) => `Ausgangsdruck der Pumpen: ${bar} bar`,
  manualElevation: 'Höhenunterschied von Hand eingegeben',
  notFeasible: 'Achtung: nicht darstellbar',
};

const view = (overrides: Partial<FoerderungView> = {}): FoerderungView =>
  ({
    params: {
      foerderMenge: 1000,
      zielDruck: 6,
      pumpenAusgangsdruck: 8,
      pumpenEingangsdruck: 1.5,
      pumpenNennstrom: 1000,
      paralleleLeitungen: 1,
    },
    length: 2000.4,
    hoehenunterschied: 12.6,
    elevationSource: 'profile',
    frictionPer100m: 1.5,
    frictionTabulated: true,
    dimension: 'B',
    profile: [],
    pumps: [],
    hoseCount: 101,
    warnings: [],
    result: {
      pumps: [],
      verstaerkerpumpen: 3,
      abschnitte: [],
      reibungsverlustBar: 30,
      hoehenverlustBar: 1.26,
      enddruck: 6.2,
      darstellbar: true,
    },
    ...overrides,
  }) as FoerderungView;

describe('buildFoerderungDiaryEntry', () => {
  it('baut einen Eintrag mit Menge, Pumpen und Randwerten', () => {
    const entry = buildFoerderungDiaryEntry({
      leitungName: 'Zubringleitung 1',
      view: view(),
      timestamp: '2026-08-21T10:00:00.000Z',
      labels,
    });

    expect(entry.type).toBe('diary');
    expect(entry.art).toBe('M');
    expect(entry.datum).toBe('2026-08-21T10:00:00.000Z');
    expect(entry.name).toBe('Löschwasserförderung Zubringleitung 1');
    expect(entry.beschreibung).toContain('Fördermenge: 1000 l/min');
    expect(entry.beschreibung).toContain('3 Verstärkerpumpen');
    expect(entry.beschreibung).toContain('Leitung: 2000 m, 101 Schlauchlängen');
    expect(entry.beschreibung).toContain('Höhenunterschied: 13 m');
    expect(entry.beschreibung).toContain('Reibungsverlust: 1.5 bar je 100 m');
    expect(entry.beschreibung).toContain('Druck am Ende: 6 bar');
    expect(entry.beschreibung).toContain('Ausgangsdruck der Pumpen: 8 bar');
  });

  it('hält fest, wenn der Höhenunterschied von Hand kam', () => {
    const entry = buildFoerderungDiaryEntry({
      view: view({ elevationSource: 'manual' }),
      timestamp: '2026-08-21T10:00:00.000Z',
      labels,
    });
    expect(entry.beschreibung).toContain('von Hand eingegeben');
  });

  it('warnt im Eintrag, wenn die Förderung nicht darstellbar ist', () => {
    const entry = buildFoerderungDiaryEntry({
      view: view({
        result: { ...view().result!, darstellbar: false },
      }),
      timestamp: '2026-08-21T10:00:00.000Z',
      labels,
    });
    expect(entry.beschreibung).toContain('nicht darstellbar');
  });

  it('lässt die Reibungszeile weg, wenn kein Wert bekannt ist', () => {
    const entry = buildFoerderungDiaryEntry({
      view: view({ frictionPer100m: undefined }),
      timestamp: '2026-08-21T10:00:00.000Z',
      labels,
    });
    expect(entry.beschreibung).not.toContain('Reibungsverlust');
  });

  it('verträgt eine Leitung ohne Namen', () => {
    const entry = buildFoerderungDiaryEntry({
      view: view(),
      timestamp: '2026-08-21T10:00:00.000Z',
      labels,
    });
    expect(entry.name).toBe('Löschwasserförderung ');
  });
});
