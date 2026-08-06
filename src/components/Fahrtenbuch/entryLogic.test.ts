import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type CounterReading,
  type CounterSource,
  type FahrtenbuchEntry,
} from '../../common/fahrtenbuch';
import {
  buildEntryDocument,
  canModifyEntry,
  computeLastCounters,
  computeVehicleCache,
  survivingCounterSources,
  type VehicleCacheEntry,
} from './entryLogic';

const KM = VEHICLE_PRESETS.fahrzeug;
const VEHICLE = { name: 'RLFA 2000', counters: KM };

const input = {
  vehicleId: 'v1',
  driverId: 'p1',
  driverName: 'Max Mustermann',
  zweck: 'einsatz' as const,
  firecallId: 'f1',
  firecallName: 'Brand B2',
  ziel: 'Hauptplatz',
  abfahrt: '2026-08-03T10:00:00.000Z',
  ankunft: '2026-08-03T11:00:00.000Z',
  counters: { km: { start: 1000, end: 1042 } },
  betriebsmittel: { diesel: 40 },
  hinweise: 'nichts besonderes',
  defekt: false,
};

const actor = {
  userId: 'u1',
  userName: 'Max Mustermann',
  now: '2026-08-03T11:05:00.000Z',
};

describe('buildEntryDocument', () => {
  it('setzt Gruppe, Ersteller, Zeitstempel und deleted serverseitig', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor);
    expect(doc.group).toBe('ffnd');
    expect(doc.createdBy).toBe('u1');
    expect(doc.createdByName).toBe('Max Mustermann');
    expect(doc.createdAt).toBe(actor.now);
    expect(doc.updatedAt).toBe(actor.now);
    expect(doc.deleted).toBe(false);
  });

  it('berechnet die Zähler-Differenz', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor);
    expect(doc.counters.km).toEqual({ start: 1000, end: 1042, diff: 42 });
  });

  it('ignoriert vom Client mitgeschickte Systemfelder', () => {
    const doc = buildEntryDocument(
      VEHICLE,
      {
        ...input,
        group: 'fremd',
        createdBy: 'fremd',
        deleted: true,
        // Die Trennung von `EntryDerivation` beruht heute darauf, dass
        // `buildEntryDocument` Felder einzeln kopiert statt `input` zu spreaden
        // — ein Client darf keine Herkunft behaupten, ohne dass der Server sie
        // abgeleitet hat.
        counterSources: { km: 'route' },
        routeOutboundMeters: 12000,
        routeReturnMeters: 14000,
      } as never,
      'ffnd',
      actor,
    );
    expect(doc.group).toBe('ffnd');
    expect(doc.createdBy).toBe('u1');
    expect(doc.deleted).toBe(false);
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc).not.toHaveProperty('routeOutboundMeters');
    expect(doc).not.toHaveProperty('routeReturnMeters');
  });

  it('entfernt firecall-Felder, wenn der Zweck nicht einsatz ist', () => {
    const doc = buildEntryDocument(VEHICLE, { ...input, zweck: 'uebung' }, 'ffnd', actor);
    expect(doc.firecallId).toBeUndefined();
    expect(doc.firecallName).toBeUndefined();
  });

  it('wirft bei ungültiger Eingabe', () => {
    expect(() =>
      buildEntryDocument(VEHICLE, { ...input, ankunft: '2026-08-03T09:00:00.000Z' }, 'ffnd', actor),
    ).toThrow(/ankunftBeforeAbfahrt/);
  });

  it('wirft bei einem unbekannten Zweck', () => {
    expect(() =>
      buildEntryDocument(VEHICLE, { ...input, zweck: 'x' } as never, 'ffnd', actor),
    ).toThrow(/zweckInvalid/);
  });

  it('übernimmt den Fahrzeugnamen aus dem Fahrzeug, nicht aus der Eingabe', () => {
    const doc = buildEntryDocument(
      VEHICLE,
      { ...input, vehicleName: 'MTF' } as never,
      'ffnd',
      actor,
    );
    expect(doc.vehicleName).toBe('RLFA 2000');
  });

  it('verwendet die Zählerdefinitionen des Fahrzeugs', () => {
    const doc = buildEntryDocument(
      { name: 'WLA', counters: [] },
      { ...input, counters: { km: { start: 1000, end: 1042 } } },
      'ffnd',
      actor,
    );
    expect(doc.counters).toEqual({});
  });

  it('verwirft unbekannte Betriebsmittel und nicht-numerische Werte', () => {
    const doc = buildEntryDocument(
      VEHICLE,
      {
        ...input,
        betriebsmittel: {
          diesel: 40,
          benzin: 'viel',
          kerosin: { a: { b: 1 } },
          adblue: Number.NaN,
        },
      } as never,
      'ffnd',
      actor,
    );
    expect(doc.betriebsmittel).toEqual({ diesel: 40 });
  });

  it('lässt betriebsmittel weg, wenn nichts Gültiges übrig bleibt', () => {
    const doc = buildEntryDocument(
      VEHICLE,
      { ...input, betriebsmittel: { kerosin: 100 } } as never,
      'ffnd',
      actor,
    );
    expect(doc).not.toHaveProperty('betriebsmittel');
  });
});

describe('buildEntryDocument beim Bearbeiten', () => {
  const existing = {
    createdBy: 'u1',
    createdByName: 'Max Mustermann',
    createdAt: '2026-08-03T11:05:00.000Z',
  };

  /** So baut updateFahrtenbuchEntry das Dokument neu auf. */
  function rebuild(clientInput: unknown) {
    const rebuilt = buildEntryDocument(
      VEHICLE,
      clientInput as typeof input,
      'ffnd',
      {
        userId: existing.createdBy,
        userName: existing.createdByName,
        now: existing.createdAt,
      },
    );
    return {
      ...rebuilt,
      updatedAt: '2026-08-04T08:00:00.000Z',
      updatedBy: 'admin',
    };
  }

  it('behält Ersteller und Erstellzeitpunkt des Originals', () => {
    const doc = rebuild({ ...input, ziel: 'Bahnhof' });
    expect(doc.createdBy).toBe('u1');
    expect(doc.createdByName).toBe('Max Mustermann');
    expect(doc.createdAt).toBe('2026-08-03T11:05:00.000Z');
    expect(doc.ziel).toBe('Bahnhof');
  });

  it('lässt sich nicht durch mitgeschickte Systemfelder umschreiben', () => {
    const doc = rebuild({
      ...input,
      createdBy: 'angreifer',
      createdByName: 'Angreifer',
      createdAt: '2020-01-01T00:00:00.000Z',
      group: 'fremd',
      deleted: true,
      updatedBy: 'angreifer',
    });
    expect(doc.createdBy).toBe('u1');
    expect(doc.createdByName).toBe('Max Mustermann');
    expect(doc.createdAt).toBe('2026-08-03T11:05:00.000Z');
    expect(doc.group).toBe('ffnd');
    expect(doc.deleted).toBe(false);
    expect(doc.updatedBy).toBe('admin');
    expect(doc.updatedAt).toBe('2026-08-04T08:00:00.000Z');
  });

  it('entfernt beim Bearbeiten gelöschte optionale Felder vollständig', () => {
    const doc = rebuild({
      ...input,
      hinweise: '   ',
      defekt: false,
      betriebsmittel: {},
      driverId: undefined,
    });
    expect(doc).not.toHaveProperty('hinweise');
    expect(doc).not.toHaveProperty('defekt');
    expect(doc).not.toHaveProperty('betriebsmittel');
    expect(doc).not.toHaveProperty('driverId');
  });
});

describe('buildEntryDocument — Nachweis abgeleiteter Zählerstände', () => {
  /** Hin- und Rückweg als Belegstelle einer gefahrenen Route. */
  const ROUTE = { routeOutboundMeters: 12000, routeReturnMeters: 14000 };

  it('schreibt Herkunft sowie Hin- und Rückweg, wenn sie übergeben werden', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: { km: 'route' }, ...ROUTE },
    });
    expect(doc.counterSources).toEqual({ km: 'route' });
    expect(doc.routeOutboundMeters).toBe(12000);
    expect(doc.routeReturnMeters).toBe(14000);
  });

  it('lässt counterSources weg, wenn die Herkunftsliste leer ist', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: {} },
    });
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc).not.toHaveProperty('routeOutboundMeters');
    expect(doc).not.toHaveProperty('routeReturnMeters');
  });

  it('lässt alle Felder weg, wenn gar keine Ableitung übergeben wird', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor);
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc).not.toHaveProperty('routeOutboundMeters');
    expect(doc).not.toHaveProperty('routeReturnMeters');
  });

  it('schreibt nie ein neues routeDistanceMeters aus den Wegstrecken', () => {
    // Das Feld steht für die alte, verdoppelte einfache Strecke. Stünde es
    // neben Hin- und Rückweg, wäre später nicht mehr erkennbar, welche der
    // beiden Angaben in den Kilometerstand eingegangen ist.
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: { km: 'route' }, ...ROUTE },
    });
    expect(doc).not.toHaveProperty('routeDistanceMeters');
  });

  it('führt ein altes routeDistanceMeters weiter, wenn es übergeben wird', () => {
    // Der Bearbeitungspfad: Ein Eintrag aus der Zeit vor der getrennten Messung
    // darf seinen Nachweis nicht durch eine Korrektur der Hinweise verlieren.
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: { km: 'route' }, routeDistanceMeters: 8000 },
    });
    expect(doc.routeDistanceMeters).toBe(8000);
    expect(doc).not.toHaveProperty('routeOutboundMeters');
  });

  it('schreibt die Wegstrecken auch, wenn kein Zähler als abgeleitet gilt', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: {}, ...ROUTE },
    });
    expect(doc).not.toHaveProperty('counterSources');
    expect(doc.routeOutboundMeters).toBe(12000);
    expect(doc.routeReturnMeters).toBe(14000);
  });

  it('schreibt eine Wegstrecke auch, wenn sie 0 ist', () => {
    // 0 unterscheidet „Weg war 0 m" von „kein Weg bekannt" — ein
    // versehentliches `if (derivation?.routeOutboundMeters)` müsste hier
    // durchfallen.
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: {
        counterSources: {},
        routeOutboundMeters: 0,
        routeReturnMeters: 0,
      },
    });
    expect(doc.routeOutboundMeters).toBe(0);
    expect(doc.routeReturnMeters).toBe(0);
  });

  it('lässt eine Herkunftsangabe für einen Zähler weg, den das Fahrzeug nicht hat', () => {
    const doc = buildEntryDocument(
      { name: 'WLA', counters: [] },
      input,
      'ffnd',
      actor,
      { derivation: { counterSources: { km: 'route' }, ...ROUTE } },
    );
    expect(doc).not.toHaveProperty('counterSources');
  });

  it('wirft, wenn ein Zähler als Route ausgewiesen wird, ohne die Wegstrecken mitzuliefern', () => {
    // Die Invariante von `EntryDerivation`: Ohne nachprüfbare Route darf kein
    // Dokument behaupten, ein Stand sei daraus berechnet worden.
    expect(() =>
      buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
        derivation: { counterSources: { km: 'route' } },
      }),
    ).toThrow(/route distance/);
  });

  it('wirft, wenn nur eine der beiden Wegstrecken mitkommt', () => {
    // Ein einzelner Weg belegt keine Gesamtstrecke — sonst könnte ein halbes
    // Routing-Ergebnis als voller Nachweis durchgehen.
    expect(() =>
      buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
        derivation: {
          counterSources: { km: 'route' },
          routeOutboundMeters: 12000,
        },
      }),
    ).toThrow(/route distance/);
  });

  it('wirft nicht, wenn nur unveränderte Herkunftsangaben ohne Distanz kommen', () => {
    const doc = buildEntryDocument(VEHICLE, input, 'ffnd', actor, {
      derivation: { counterSources: { km: 'unchanged' } },
    });
    expect(doc.counterSources).toEqual({ km: 'unchanged' });
  });
});

describe('survivingCounterSources', () => {
  const previous: Record<string, CounterSource> = {
    km: 'route',
    betriebsstunden: 'unchanged',
  };
  const previousCounters: Record<string, CounterReading> = {
    km: { start: 1000, end: 1024 },
    betriebsstunden: { start: 10 },
  };

  it('behält die Herkunft, wenn der Endstand unverändert bleibt', () => {
    const result = survivingCounterSources(previous, previousCounters, {
      km: { start: 1000, end: 1024 },
      betriebsstunden: { start: 10 },
    });
    expect(result).toEqual(previous);
  });

  it('verliert die Herkunft, wenn der Endstand geändert wurde', () => {
    const result = survivingCounterSources(previous, previousCounters, {
      km: { start: 1000, end: 1030 },
      betriebsstunden: { start: 10 },
    });
    expect(result).toEqual({ betriebsstunden: 'unchanged' });
  });

  it('verliert die Herkunft, wenn der Startstand korrigiert wird', () => {
    // `end - start` entspräche danach nicht mehr der Gesamtstrecke — der
    // Eintrag behauptete eine Ableitung, der seine eigenen Zahlen
    // widersprechen.
    const result = survivingCounterSources(previous, previousCounters, {
      km: { start: 900, end: 1024 },
      betriebsstunden: { start: 10 },
    });
    expect(result).toEqual({ betriebsstunden: 'unchanged' });
  });

  it('verliert die Herkunft, wenn der Endstand von undefined auf einen Wert wechselt', () => {
    const result = survivingCounterSources(previous, previousCounters, {
      km: { start: 1000, end: 1024 },
      betriebsstunden: { start: 10, end: 12 },
    });
    expect(result).toEqual({ km: 'route' });
  });

  it('behält die Herkunft, wenn der Endstand bei undefined bleibt', () => {
    const withoutEnd: Record<string, CounterSource> = { betriebsstunden: 'unchanged' };
    const withoutEndCounters: Record<string, CounterReading> = {
      betriebsstunden: { start: 10 },
    };
    const result = survivingCounterSources(withoutEnd, withoutEndCounters, {
      betriebsstunden: { start: 10 },
    });
    expect(result).toEqual({ betriebsstunden: 'unchanged' });
  });

  it('kennt keinen Zähler ohne vorherige Herkunft', () => {
    const result = survivingCounterSources(previous, previousCounters, {
      km: { start: 1000, end: 1024 },
      neu: { start: 5, end: 5 },
    });
    expect(result).not.toHaveProperty('neu');
  });

  it('liefert ein leeres Objekt, wenn keine vorherige Herkunft übergeben wird', () => {
    expect(survivingCounterSources(undefined, previousCounters, previousCounters)).toEqual(
      {},
    );
  });
});

describe('canModifyEntry', () => {
  const entry = { createdBy: 'u1' } as FahrtenbuchEntry;

  it('erlaubt dem Ersteller', () => {
    expect(canModifyEntry(entry, 'u1', false)).toBe(true);
  });

  it('erlaubt einem Admin', () => {
    expect(canModifyEntry(entry, 'u2', true)).toBe(true);
  });

  it('verbietet allen anderen', () => {
    expect(canModifyEntry(entry, 'u2', false)).toBe(false);
  });
});

describe('computeLastCounters', () => {
  it('liest die Endwerte des jüngsten Eintrags', () => {
    const entry: Pick<FahrtenbuchEntry, 'counters'> = {
      counters: { km: { start: 1000, end: 1042, diff: 42 } },
    };
    expect(computeLastCounters(entry)).toEqual({ km: 1042 });
  });

  it('liefert ein leeres Objekt ohne Eintrag', () => {
    expect(computeLastCounters(undefined)).toEqual({});
  });

  it('überspringt Zähler ohne Endwert', () => {
    const entry: Pick<FahrtenbuchEntry, 'counters'> = {
      counters: { km: { start: 1000 } },
    };
    expect(computeLastCounters(entry)).toEqual({});
  });
});

describe('computeVehicleCache', () => {
  const entry: VehicleCacheEntry = {
    counters: { km: { start: 1000, end: 1042, diff: 42 } },
    abfahrt: '2026-03-12T09:15:00.000Z',
    driverName: 'Max Mustermann',
    defekt: true,
  };

  it('übernimmt Zähler, Zeitpunkt, Fahrer und Defekt der jüngsten Fahrt', () => {
    expect(computeVehicleCache(entry)).toEqual({
      lastCounters: { km: 1042 },
      lastEntryAt: '2026-03-12T09:15:00.000Z',
      lastDriverName: 'Max Mustermann',
      lastEntryHasDefect: true,
    });
  });

  it('meldet keinen Defekt, wenn die jüngste Fahrt keinen hat', () => {
    expect(computeVehicleCache({ ...entry, defekt: undefined })).toMatchObject({
      lastEntryHasDefect: false,
    });
  });

  it('leert den Cache, wenn keine Fahrt mehr übrig ist', () => {
    // Nach dem Löschen der letzten Fahrt darf kein alter Fahrername und kein
    // alter Defekt-Hinweis am Fahrzeug hängen bleiben — die Felder müssen
    // explizit auf null bzw. false zurückfallen, damit `merge: true` sie
    // tatsächlich überschreibt.
    expect(computeVehicleCache(undefined)).toEqual({
      lastCounters: {},
      lastEntryAt: null,
      lastDriverName: null,
      lastEntryHasDefect: false,
    });
  });

  it('setzt den Fahrernamen auf null, wenn er leer ist', () => {
    expect(computeVehicleCache({ ...entry, driverName: '' })).toMatchObject({
      lastDriverName: null,
    });
  });
});
