import { describe, expect, it } from 'vitest';
import type { FahrtenbuchEntry } from './fahrtenbuch';
import {
  EMPTY_FAHRTENBUCH_LIST_FILTER,
  driverOptionsOf,
  entrySearchText,
  fahrtenbuchListFilterRange,
  fahrtenbuchListFilterToParams,
  filterFahrtenbuchEntries,
  hasActiveFahrtenbuchListFilter,
  normalizeSearch,
  parseFahrtenbuchListFilter,
  type FahrtenbuchListFilter,
} from './fahrtenbuchListFilter';

function entry(overrides: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Max Mustermann',
    zweck: 'einsatz',
    ziel: 'Hauptplatz',
    abfahrt: '2026-08-05T08:00:00.000Z',
    ankunft: '2026-08-05T09:00:00.000Z',
    counters: {},
    group: 'ffnd',
    deleted: false,
    createdAt: '',
    createdBy: 'u1',
    createdByName: 'Max Mustermann',
    updatedAt: '',
    updatedBy: 'u1',
    ...overrides,
  };
}

const filter = (
  overrides: Partial<FahrtenbuchListFilter> = {},
): FahrtenbuchListFilter => ({
  ...EMPTY_FAHRTENBUCH_LIST_FILTER,
  ...overrides,
});

const TZ = 'Europe/Vienna';

describe('normalizeSearch', () => {
  it('ignoriert Groß-/Kleinschreibung und Umlaute', () => {
    expect(normalizeSearch('Grüne STRASSE')).toBe('grune strasse');
    expect(normalizeSearch('Grüne Straße')).toBe('grune strasse');
  });

  it('fasst Leerraum zusammen', () => {
    expect(normalizeSearch('  a   b  ')).toBe('a b');
  });
});

describe('entrySearchText', () => {
  it('enthält Ziel, Einsatz, Hinweise, Mangel, Fahrer und Fahrzeug', () => {
    const text = entrySearchText(
      entry({
        ziel: 'Hauptplatz 1',
        firecallName: 'Brand B2 Kirche',
        hinweise: 'Tank halb voll',
        mangel: 'Bremse zieht',
        driverName: 'Max Mustermann',
        vehicleName: 'RLFA 2000',
      }),
    );

    for (const needle of [
      'hauptplatz 1',
      'brand b2 kirche',
      'tank halb voll',
      'bremse zieht',
      'max mustermann',
      'rlfa 2000',
    ]) {
      expect(text).toContain(needle);
    }
  });
});

describe('filterFahrtenbuchEntries', () => {
  it('gibt ohne Filter alles zurück', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(filterFahrtenbuchEntries(entries, filter(), TZ)).toHaveLength(2);
  });

  it('findet über die Fahrstrecke', () => {
    const entries = [
      entry({ id: 'a', ziel: 'Untere Hauptstraße 12' }),
      entry({ id: 'b', ziel: 'Seepark' }),
    ];

    const found = filterFahrtenbuchEntries(
      entries,
      filter({ search: 'hauptstrasse' }),
      TZ,
    );

    expect(found.map((e) => e.id)).toEqual(['a']);
  });

  it('findet über den Kommentar und den Mangel', () => {
    const entries = [
      entry({ id: 'a', hinweise: 'Getankt in Parndorf' }),
      entry({ id: 'b', mangel: 'Blinker hinten links defekt' }),
      entry({ id: 'c' }),
    ];

    expect(
      filterFahrtenbuchEntries(entries, filter({ search: 'parndorf' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['a']);
    expect(
      filterFahrtenbuchEntries(entries, filter({ search: 'blinker' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
  });

  it('verlangt alle Suchwörter, egal in welchem Feld', () => {
    const entries = [
      entry({ id: 'a', ziel: 'Seepark', hinweise: 'Schlauch getauscht' }),
      entry({ id: 'b', ziel: 'Seepark' }),
    ];

    const found = filterFahrtenbuchEntries(
      entries,
      filter({ search: 'seepark schlauch' }),
      TZ,
    );

    expect(found.map((e) => e.id)).toEqual(['a']);
  });

  it('grenzt den Zeitraum einschließlich der Randtage ein', () => {
    // Verglichen wird der Ortstag: Im August liegt Wien zwei Stunden vor UTC,
    // die beiden Randfahrten stehen in UTC deshalb am jeweiligen Nachbartag.
    const entries = [
      entry({ id: 'vorher', abfahrt: '2026-08-04T20:00:00.000Z' }),
      // UTC 04.08. 22:30 = Ortszeit 05.08. 00:30 — der erste Tag zählt mit.
      entry({ id: 'erster', abfahrt: '2026-08-04T22:30:00.000Z' }),
      entry({ id: 'letzter', abfahrt: '2026-08-06T21:30:00.000Z' }),
      // UTC 06.08. 22:30 = Ortszeit 07.08. 00:30 — schon der nächste Tag.
      entry({ id: 'danach', abfahrt: '2026-08-06T22:30:00.000Z' }),
    ];

    const found = filterFahrtenbuchEntries(
      entries,
      filter({ from: '2026-08-05', to: '2026-08-06' }),
      TZ,
    );

    expect(found.map((e) => e.id)).toEqual(['erster', 'letzter']);
  });

  it('lässt eine offene Zeitraumgrenze zu', () => {
    const entries = [
      entry({ id: 'alt', abfahrt: '2026-07-01T08:00:00.000Z' }),
      entry({ id: 'neu', abfahrt: '2026-08-05T08:00:00.000Z' }),
    ];

    expect(
      filterFahrtenbuchEntries(entries, filter({ from: '2026-08-01' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['neu']);
    expect(
      filterFahrtenbuchEntries(entries, filter({ to: '2026-07-31' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['alt']);
  });

  it('filtert nach dem Fahrer über den Fahrer-Schlüssel', () => {
    const entries = [
      entry({ id: 'a', driverId: 'p1', driverName: 'Max Mustermann' }),
      // Derselbe Fahrer, aber frei eingetippt: der Namensschlüssel greift.
      entry({ id: 'b', driverName: 'Max  MUSTERMANN' }),
      entry({ id: 'c', driverName: 'Erika Musterfrau' }),
    ];

    expect(
      filterFahrtenbuchEntries(entries, filter({ driverKey: 'p1' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['a']);
    expect(
      filterFahrtenbuchEntries(
        entries,
        filter({ driverKey: 'max mustermann' }),
        TZ,
      ).map((e) => e.id),
    ).toEqual(['b']);
  });

  it('kombiniert die Filter zur Schnittmenge', () => {
    const entries = [
      entry({
        id: 'treffer',
        driverName: 'Max Mustermann',
        zweck: 'uebung',
        defekt: true,
        ziel: 'Seepark',
        abfahrt: '2026-08-05T08:00:00.000Z',
      }),
      // Passt bis auf den Zweck.
      entry({
        id: 'zweck',
        driverName: 'Max Mustermann',
        zweck: 'einsatz',
        defekt: true,
        ziel: 'Seepark',
        abfahrt: '2026-08-05T08:00:00.000Z',
      }),
      // Passt bis auf den Defekt.
      entry({
        id: 'defekt',
        driverName: 'Max Mustermann',
        zweck: 'uebung',
        ziel: 'Seepark',
        abfahrt: '2026-08-05T08:00:00.000Z',
      }),
      // Passt bis auf den Zeitraum.
      entry({
        id: 'zeitraum',
        driverName: 'Max Mustermann',
        zweck: 'uebung',
        defekt: true,
        ziel: 'Seepark',
        abfahrt: '2026-07-05T08:00:00.000Z',
      }),
    ];

    const found = filterFahrtenbuchEntries(
      entries,
      filter({
        search: 'seepark',
        from: '2026-08-01',
        to: '2026-08-31',
        driverKey: 'max mustermann',
        zweck: 'uebung',
        onlyDefects: true,
      }),
      TZ,
    );

    expect(found.map((e) => e.id)).toEqual(['treffer']);
  });

  it('filtert nach Fahrzeug', () => {
    const entries = [
      entry({ id: 'a', vehicleId: 'v1' }),
      entry({ id: 'b', vehicleId: 'v2' }),
    ];

    expect(
      filterFahrtenbuchEntries(entries, filter({ vehicleId: 'v2' }), TZ).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
  });
});

describe('fahrtenbuchListFilterRange', () => {
  it('lässt ohne Zeitraum beide Grenzen offen', () => {
    expect(fahrtenbuchListFilterRange(filter(), TZ)).toEqual({
      fromIso: undefined,
      toIso: undefined,
    });
  });

  it('spannt die Grenzen über die vollen Ortstage', () => {
    expect(
      fahrtenbuchListFilterRange(
        filter({ from: '2026-08-05', to: '2026-08-06' }),
        TZ,
      ),
    ).toEqual({
      // Ortszeit 00:00 bzw. 23:59:59.999 — im Sommer zwei Stunden vor UTC.
      fromIso: '2026-08-04T22:00:00.000Z',
      toIso: '2026-08-06T21:59:59.999Z',
    });
  });

  it('setzt nur die angegebene Grenze', () => {
    expect(fahrtenbuchListFilterRange(filter({ to: '2026-08-06' }), TZ)).toEqual(
      { fromIso: undefined, toIso: '2026-08-06T21:59:59.999Z' },
    );
  });
});

describe('driverOptionsOf', () => {
  it('führt jeden Fahrer einmal, alphabetisch', () => {
    const options = driverOptionsOf([
      entry({ driverName: 'Max Mustermann' }),
      entry({ driverName: 'Erika Musterfrau' }),
      entry({ driverName: 'Max  MUSTERMANN' }),
    ]);

    expect(options).toEqual([
      { key: 'erika musterfrau', name: 'Erika Musterfrau' },
      { key: 'max mustermann', name: 'Max Mustermann' },
    ]);
  });

  it('lässt Fahrten ohne Fahrer aus', () => {
    // Ein Anhänger fährt nicht selbst — eine leere Auswahlzeile wäre nur
    // verwirrend.
    expect(driverOptionsOf([entry({ driverName: '' })])).toEqual([]);
  });
});

describe('Query-Parameter', () => {
  it('schreibt nur gesetzte Filter', () => {
    expect(fahrtenbuchListFilterToParams(filter())).toEqual({});
    expect(
      fahrtenbuchListFilterToParams(
        filter({
          search: 'seepark',
          from: '2026-08-01',
          to: '2026-08-31',
          driverKey: 'p1',
          vehicleId: 'v1',
          zweck: 'uebung',
          onlyDefects: true,
        }),
      ),
    ).toEqual({
      q: 'seepark',
      von: '2026-08-01',
      bis: '2026-08-31',
      fahrer: 'p1',
      fahrzeug: 'v1',
      zweck: 'uebung',
      defekte: '1',
    });
  });

  it('liest den Filter aus den Parametern zurück', () => {
    const original = filter({
      search: 'seepark',
      from: '2026-08-01',
      to: '2026-08-31',
      driverKey: 'p1',
      vehicleId: 'v1',
      zweck: 'uebung',
      onlyDefects: true,
    });

    const params = new URLSearchParams(fahrtenbuchListFilterToParams(original));

    expect(parseFahrtenbuchListFilter(params)).toEqual(original);
  });

  it('ergibt bei leeren Parametern den leeren Filter', () => {
    expect(parseFahrtenbuchListFilter(new URLSearchParams())).toEqual(
      EMPTY_FAHRTENBUCH_LIST_FILTER,
    );
  });

  it('verwirft einen unbekannten Zweck und ein unsinniges Datum', () => {
    const params = new URLSearchParams({
      zweck: 'kaffeefahrt',
      von: 'gestern',
      bis: '2026-13-99',
    });

    expect(parseFahrtenbuchListFilter(params)).toEqual(
      EMPTY_FAHRTENBUCH_LIST_FILTER,
    );
  });
});

describe('hasActiveFahrtenbuchListFilter', () => {
  it('erkennt einen leeren und einen gesetzten Filter', () => {
    expect(hasActiveFahrtenbuchListFilter(filter())).toBe(false);
    expect(hasActiveFahrtenbuchListFilter(filter({ search: 'a' }))).toBe(true);
    expect(hasActiveFahrtenbuchListFilter(filter({ onlyDefects: true }))).toBe(
      true,
    );
    expect(hasActiveFahrtenbuchListFilter(filter({ from: '2026-01-01' }))).toBe(
      true,
    );
  });
});
