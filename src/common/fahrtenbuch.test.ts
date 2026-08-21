import { describe, expect, it } from 'vitest';
import {
  applyCounterDiffs,
  arrivalFromTimeOnly,
  arrivalOnDepartureDay,
  counterWarnings,
  driverNamesOf,
  FAHRT_ZWECKE,
  FAHRTENBUCH_MAX_CO_DRIVERS,
  FUEL_TYPES,
  isPropellant,
  isTimeOnlyTimestamp,
  findEntryForFirecallVehicle,
  overlappingVehicleEntries,
  matchVehicleByName,
  normalizeName,
  normalizePersonName,
  personDisplayName,
  PROPELLANTS,
  referenceCounters,
  requiresDriver,
  suggestPresetForVehicleName,
  validateEntryInput,
  VEHICLE_PRESETS,
  type CounterDefinition,
  type EntryInput,
  type FahrtenbuchDriverRef,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from './fahrtenbuch';

const KM = VEHICLE_PRESETS.fahrzeug;
const BOOT = VEHICLE_PRESETS.boot;

function vehicle(
  overrides: Partial<FahrtenbuchVehicle> = {},
): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    active: true,
    counters: KM,
    fuelTypes: ['diesel'],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

describe('applyCounterDiffs', () => {
  it('berechnet die Differenz im Modus startEnd', () => {
    const result = applyCounterDiffs(KM, { km: { start: 1000, end: 1042 } });
    expect(result.km).toEqual({ start: 1000, end: 1042, diff: 42 });
  });

  it('lässt diff weg, solange ein Wert fehlt', () => {
    const result = applyCounterDiffs(KM, { km: { start: 1000 } });
    expect(result.km.diff).toBeUndefined();
  });

  it('lässt bei einem unvollständigen Wert den fehlenden Key komplett weg (kein literales undefined)', () => {
    const result = applyCounterDiffs(KM, { km: { start: 1000 } });
    expect(Object.keys(result.km)).toEqual(['start']);
  });

  it('setzt bei mode reading keine Differenz und keinen Startwert', () => {
    const result = applyCounterDiffs(BOOT, { lenzpumpeStb: { end: 39 } });
    expect(result.lenzpumpeStb).toEqual({ end: 39 });
  });

  it('ignoriert Zähler, die am Fahrzeug nicht definiert sind', () => {
    const result = applyCounterDiffs(KM, {
      km: { start: 1, end: 2 },
      fremd: { start: 5, end: 9 },
    });
    expect(result.fremd).toBeUndefined();
  });
});

describe('counterWarnings', () => {
  it('warnt bei decrease, wenn der Startwert unter dem letzten Endwert liegt', () => {
    const warnings = counterWarnings(
      KM,
      { km: { start: 900, end: 950 } },
      { km: 1000 },
    );
    expect(warnings).toEqual([
      { counterId: 'km', type: 'decrease', lastValue: 1000, value: 900 },
    ]);
  });

  it('warnt bei decrease nicht, wenn der Startwert passt', () => {
    expect(
      counterWarnings(KM, { km: { start: 1000, end: 1010 } }, { km: 1000 }),
    ).toEqual([]);
  });

  it('warnt bei anyChange, sobald der Stand vom letzten Wert abweicht', () => {
    const warnings = counterWarnings(
      BOOT,
      { lenzpumpeBb: { end: 41 } },
      { lenzpumpeBb: 39 },
    );
    expect(warnings).toEqual([
      { counterId: 'lenzpumpeBb', type: 'changed', lastValue: 39, value: 41 },
    ]);
  });

  it('warnt bei anyChange nicht, wenn der Stand gleich bleibt', () => {
    expect(
      counterWarnings(BOOT, { lenzpumpeBb: { end: 39 } }, { lenzpumpeBb: 39 }),
    ).toEqual([]);
  });

  it('warnt nie ohne bekannten Vorwert', () => {
    expect(counterWarnings(KM, { km: { start: 900, end: 950 } }, {})).toEqual(
      [],
    );
  });

  it('warnt nie bei changeWarning none', () => {
    const defs = [{ ...KM[0], changeWarning: 'none' as const }];
    expect(
      counterWarnings(defs, { km: { start: 1, end: 2 } }, { km: 500 }),
    ).toEqual([]);
  });
});

describe('requiresDriver', () => {
  it('verlangt einen Fahrer für Einheiten mit Zähler', () => {
    expect(requiresDriver(VEHICLE_PRESETS.fahrzeug)).toBe(true);
    expect(requiresDriver(VEHICLE_PRESETS.boot)).toBe(true);
  });

  it('verlangt keinen Fahrer für Einheiten ohne Zähler', () => {
    // Die Zähler-Vorlage „Ohne Zähler" ist genau die von WLA-Aufbauten und
    // Anhängern (siehe `suggestPresetForVehicleName`).
    expect(requiresDriver(VEHICLE_PRESETS.none)).toBe(false);
    expect(requiresDriver([])).toBe(false);
  });

  it('deckt sich mit der Vorlage, die für WLA und Anhänger vorgeschlagen wird', () => {
    for (const name of ['WLA-Bergung', 'WLA-Logistik', 'Anhänger Notstrom']) {
      const preset = suggestPresetForVehicleName(name);
      expect(requiresDriver(VEHICLE_PRESETS[preset])).toBe(false);
    }
  });
});

describe('validateEntryInput', () => {
  const base = {
    vehicleId: 'v1',
    driverName: 'Max Mustermann',
    zweck: 'einsatz',
    ziel: 'Feuerwehrhaus',
    abfahrt: '2026-08-03T10:00:00.000Z',
    ankunft: '2026-08-03T11:00:00.000Z',
    counters: { km: { start: 1000, end: 1042 } },
  };

  it('akzeptiert einen vollständigen Eintrag', () => {
    expect(validateEntryInput(KM, base)).toEqual([]);
  });

  it('meldet eine Ankunft vor der Abfahrt', () => {
    expect(
      validateEntryInput(KM, { ...base, ankunft: '2026-08-03T09:00:00.000Z' }),
    ).toEqual(['ankunftBeforeAbfahrt']);
  });

  it('meldet einen fehlenden Pflichtzähler', () => {
    expect(
      validateEntryInput(KM, { ...base, counters: { km: { start: 1000 } } }),
    ).toEqual(['counterMissing:km']);
  });

  it('meldet einen Endwert unter dem Startwert', () => {
    expect(
      validateEntryInput(KM, {
        ...base,
        counters: { km: { start: 1000, end: 900 } },
      }),
    ).toEqual(['counterEndBeforeStart:km']);
  });

  it('verlangt bei mode reading nur den Endwert', () => {
    const counters = {
      betriebsstundenBb: { start: 10, end: 12 },
      lenzpumpeStb: { end: 39 },
      lenzpumpeBb: { end: 39 },
    };
    expect(validateEntryInput(BOOT, { ...base, counters })).toEqual([]);
  });

  it('meldet einen fehlenden Fahrer und ein fehlendes Fahrzeug', () => {
    const errors = validateEntryInput(KM, {
      ...base,
      driverName: '  ',
      vehicleId: '',
    });
    expect(errors).toContain('driverMissing');
    expect(errors).toContain('vehicleMissing');
  });

  it('akzeptiert ein Fahrzeug ohne Zähler', () => {
    expect(validateEntryInput([], { ...base, counters: {} })).toEqual([]);
  });

  it('verlangt für eine Einheit ohne Zähler keinen Fahrer', () => {
    // WLA-Bergung, WLA-Logistik und Anhänger werden aufgenommen bzw. gezogen —
    // sie haben keinen eigenen Fahrer. Die Fahrerpflicht hätte ihre Erfassung
    // dauerhaft blockiert.
    expect(
      validateEntryInput([], { ...base, driverName: '', counters: {} }),
    ).toEqual([]);
  });

  it('akzeptiert jeden bekannten Zweck', () => {
    for (const zweck of FAHRT_ZWECKE) {
      expect(validateEntryInput(KM, { ...base, zweck })).toEqual([]);
    }
  });

  it('meldet einen unbekannten Zweck', () => {
    expect(validateEntryInput(KM, { ...base, zweck: 'x' })).toEqual([
      'zweckInvalid',
    ]);
  });

  it('meldet einen fehlenden Zweck', () => {
    expect(validateEntryInput(KM, { ...base, zweck: '' })).toEqual([
      'zweckInvalid',
    ]);
  });

  it('verlangt ein Ziel', () => {
    expect(validateEntryInput(KM, { ...base, ziel: '' })).toEqual([
      'zielMissing',
    ]);
  });

  it('lässt Leerzeichen nicht als Ziel durchgehen', () => {
    expect(validateEntryInput(KM, { ...base, ziel: '   ' })).toEqual([
      'zielMissing',
    ]);
  });

  it('verlangt kein Ziel, wenn ein Einsatz verknüpft ist', () => {
    // Der Einsatz benennt das Ziel bereits — Export und Liste zeigen seinen
    // Namen, wenn das Feld leer bleibt.
    expect(
      validateEntryInput(KM, { ...base, ziel: '', firecallId: 'fc1' }),
    ).toEqual([]);
  });

  it('verlangt das Ziel auch bei optionalen Zählern', () => {
    // Die Sammelerfassung aus dem Einsatz lockert nur die Zählerstände: Wo die
    // Fahrt hinging, muss auch dort feststehen.
    expect(
      validateEntryInput(
        KM,
        { ...base, ziel: '', counters: {} },
        { countersOptional: true },
      ),
    ).toEqual(['zielMissing']);
  });

  it('meldet eine unparsbare Abfahrt', () => {
    expect(
      validateEntryInput(KM, { ...base, abfahrt: 'nicht-ein-datum' }),
    ).toEqual(['abfahrtInvalid']);
  });

  it('verlangt zu einem gemeldeten Defekt eine Beschreibung', () => {
    expect(validateEntryInput(KM, { ...base, defekt: true })).toEqual([
      'mangelMissing',
    ]);
  });

  it('lässt Leerzeichen nicht als Mangelbeschreibung durchgehen', () => {
    expect(
      validateEntryInput(KM, { ...base, defekt: true, mangel: '   ' }),
    ).toEqual(['mangelMissing']);
  });

  it('akzeptiert einen Defekt mit Beschreibung', () => {
    expect(
      validateEntryInput(KM, {
        ...base,
        defekt: true,
        mangel: 'Bremse zieht nach links',
      }),
    ).toEqual([]);
  });

  it('verlangt ohne gemeldeten Defekt keine Mangelbeschreibung', () => {
    expect(validateEntryInput(KM, { ...base, defekt: false })).toEqual([]);
  });

  it('verlangt die Beschreibung auch bei optionalen Zählern', () => {
    // Die Sammelerfassung aus dem Einsatz darf fehlende Zählerstände
    // durchlassen — ein Mangel ohne Beschreibung ist dagegen kein
    // unvollständiger, sondern ein unbrauchbarer Eintrag: Die Meldung an die
    // Fahrzeugverantwortlichen bestünde nur aus einem Häkchen.
    expect(
      validateEntryInput(
        KM,
        { ...base, counters: {}, defekt: true },
        { countersOptional: true },
      ),
    ).toEqual(['mangelMissing']);
  });
});

describe('arrivalOnDepartureDay', () => {
  it('übernimmt den Kalendertag der Abfahrt und die Uhrzeit der Referenz', () => {
    const abfahrt = new Date(2026, 7, 1, 8, 30).toISOString();
    const now = new Date(2026, 7, 3, 14, 45);
    const result = new Date(arrivalOnDepartureDay(abfahrt, now));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(45);
  });

  it('liefert die Referenzzeit, wenn die Abfahrt unbrauchbar ist', () => {
    const now = new Date(2026, 7, 3, 14, 45);
    expect(arrivalOnDepartureDay('', now)).toBe(now.toISOString());
  });

  it('bleibt am Tag der Abfahrt, wenn die Referenzzeit davor liegt', () => {
    // Eine Fahrt dauert im Normalfall keinen Kalendertag. Früher rollte der
    // Vorschlag hier auf den nächsten Tag — bei einem Einsatz von gestern Abend
    // standen Abfahrt und Ankunft dann einen Tag auseinander.
    const abfahrt = new Date(2026, 7, 1, 23, 50).toISOString();
    const now = new Date(2026, 7, 5, 0, 15);
    expect(arrivalOnDepartureDay(abfahrt, now)).toBe(abfahrt);
  });
});

describe('arrivalFromTimeOnly', () => {
  it('legt eine Uhrzeit ohne Datum auf den Tag der Abfahrt', () => {
    const abfahrt = new Date(2026, 7, 1, 8, 30).toISOString();
    const time = new Date(2026, 7, 9, 10, 15);
    const result = new Date(arrivalFromTimeOnly(abfahrt, time));
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(15);
  });

  it('rollt auf den nächsten Tag, wenn die Uhrzeit vor der Abfahrt liegt', () => {
    // „01:30" nach einer Abfahrt um 23:50 kann nur der nächste Morgen sein —
    // anders als beim Vorschlag ist das hier eine eingetragene Uhrzeit.
    const abfahrt = new Date(2026, 7, 1, 23, 50).toISOString();
    const time = new Date(2026, 7, 9, 1, 30);
    const result = new Date(arrivalFromTimeOnly(abfahrt, time));
    expect(result.getDate()).toBe(2);
    expect(result.getHours()).toBe(1);
    expect(result.getMinutes()).toBe(30);
  });
});

describe('isTimeOnlyTimestamp', () => {
  it('erkennt Angaben ohne Datum', () => {
    expect(isTimeOnlyTimestamp('10:05')).toBe(true);
    expect(isTimeOnlyTimestamp('9:05')).toBe(true);
    expect(isTimeOnlyTimestamp(' 10:05:30 ')).toBe(true);
  });

  it('erkennt Angaben mit Datum', () => {
    expect(isTimeOnlyTimestamp('03.08.2026 10:07:00')).toBe(false);
    expect(isTimeOnlyTimestamp('2026-08-03T10:00:00.000Z')).toBe(false);
    expect(isTimeOnlyTimestamp('')).toBe(false);
    expect(isTimeOnlyTimestamp(undefined)).toBe(false);
  });
});

describe('normalizePersonName', () => {
  it('vergleicht „Nachname Vorname" mit „Vorname Nachname"', () => {
    // Aus BlaulichtSMS kommen die Personen als „Nachname Vorname", die interne
    // Personenliste führt sie als „Vorname Nachname".
    expect(normalizePersonName('Mustermann Max')).toBe(
      normalizePersonName('Max Mustermann'),
    );
  });

  it('normalisiert wie normalizeName', () => {
    expect(normalizePersonName('  MAX   Mustermann-Huber ')).toBe(
      normalizePersonName('mustermann huber max'),
    );
  });

  it('unterscheidet verschiedene Namen weiterhin', () => {
    expect(normalizePersonName('Max Mustermann')).not.toBe(
      normalizePersonName('Maximilian Mustermann'),
    );
  });

  it('bleibt leer bei leerer Eingabe', () => {
    expect(normalizePersonName('   ')).toBe('');
  });

  it('behält doppelte Namensteile', () => {
    expect(normalizePersonName('Max Max')).not.toBe(
      normalizePersonName('Max'),
    );
  });
});

describe('personDisplayName', () => {
  const persons = [{ name: 'Max Mustermann' }, { name: 'Anna Bauer' }];

  it('dreht die Reihenfolge auf die der Personenliste', () => {
    expect(personDisplayName('Mustermann Max', persons)).toBe('Max Mustermann');
  });

  it('vereinheitlicht auch Schreibweise und Leerzeichen', () => {
    expect(personDisplayName('BAUER  anna', persons)).toBe('Anna Bauer');
  });

  it('lässt einen unbekannten Namen unverändert', () => {
    // Vor- und Nachname aus einer beliebigen Zeichenkette selbst zu erkennen
    // geht nicht verlässlich.
    expect(personDisplayName('Berger Anna Maria', persons)).toBe(
      'Berger Anna Maria',
    );
  });

  it('lässt bei zwei Treffern den Namen stehen', () => {
    expect(
      personDisplayName('Mustermann Max', [
        { name: 'Max Mustermann' },
        { name: 'Mustermann Max' },
      ]),
    ).toBe('Mustermann Max');
  });

  it('lässt einen leeren Namen leer', () => {
    expect(personDisplayName('', persons)).toBe('');
  });
});

describe('normalizeName und matchVehicleByName', () => {
  it('normalisiert Groß-/Kleinschreibung, Sonderzeichen und Mehrfach-Leerzeichen', () => {
    expect(normalizeName('  RLFA-3000/100  ')).toBe(
      normalizeName('rlfa 3000 100'),
    );
  });

  it('findet ein Fahrzeug über den normalisierten Namen', () => {
    const vehicles = [
      vehicle({ id: 'a', name: 'RLFA 3000/100' }),
      vehicle({ id: 'b', name: 'MZB' }),
    ];
    expect(matchVehicleByName(vehicles, 'rlfa-3000 100')?.id).toBe('a');
  });

  it('liefert undefined ohne Treffer', () => {
    expect(matchVehicleByName([vehicle()], 'Drehleiter')).toBeUndefined();
  });

  it('liefert undefined für einen leeren/nur-Leerzeichen-Namen', () => {
    expect(matchVehicleByName([vehicle()], '   ')).toBeUndefined();
  });
});

describe('findEntryForFirecallVehicle', () => {
  const entries = [
    {
      id: 'e1',
      firecallId: 'f1',
      vehicleId: 'v1',
      deleted: false,
    } as FahrtenbuchEntry,
    {
      id: 'e2',
      firecallId: 'f1',
      vehicleId: 'v2',
      deleted: true,
    } as FahrtenbuchEntry,
  ];

  it('findet den bestehenden Eintrag', () => {
    expect(findEntryForFirecallVehicle(entries, 'f1', 'v1')?.id).toBe('e1');
  });

  it('ignoriert gelöschte Einträge', () => {
    expect(findEntryForFirecallVehicle(entries, 'f1', 'v2')).toBeUndefined();
  });

  it('lässt den bearbeiteten Eintrag selbst außen vor', () => {
    // Sonst meldete die Bearbeitung einer Fahrt sie selbst als Duplikat.
    expect(
      findEntryForFirecallVehicle(entries, 'f1', 'v1', 'e1'),
    ).toBeUndefined();
  });
});

describe('overlappingVehicleEntries', () => {
  const entry = (overrides: Partial<FahrtenbuchEntry>): FahrtenbuchEntry =>
    ({
      id: 'e1',
      vehicleId: 'v1',
      deleted: false,
      abfahrt: '2026-08-03T10:00:00.000Z',
      ankunft: '2026-08-03T12:00:00.000Z',
      ...overrides,
    }) as FahrtenbuchEntry;

  const existing = [entry({})];

  it('meldet eine überschneidende Fahrt desselben Fahrzeugs', () => {
    const found = overlappingVehicleEntries(existing, {
      vehicleId: 'v1',
      abfahrt: '2026-08-03T11:00:00.000Z',
      ankunft: '2026-08-03T13:00:00.000Z',
    });
    expect(found.map((e) => e.id)).toEqual(['e1']);
  });

  it('meldet eine vollständig umschlossene Fahrt', () => {
    const found = overlappingVehicleEntries(existing, {
      vehicleId: 'v1',
      abfahrt: '2026-08-03T09:00:00.000Z',
      ankunft: '2026-08-03T13:00:00.000Z',
    });
    expect(found).toHaveLength(1);
  });

  it('lässt eine anschließende Fahrt zu', () => {
    // Ankunft und nächste Abfahrt auf derselben Minute ist der Normalfall
    // zweier aufeinanderfolgender Fahrten, keine Überschneidung.
    const found = overlappingVehicleEntries(existing, {
      vehicleId: 'v1',
      abfahrt: '2026-08-03T12:00:00.000Z',
      ankunft: '2026-08-03T14:00:00.000Z',
    });
    expect(found).toEqual([]);
  });

  it('betrachtet nur dasselbe Fahrzeug', () => {
    const found = overlappingVehicleEntries(existing, {
      vehicleId: 'v2',
      abfahrt: '2026-08-03T11:00:00.000Z',
      ankunft: '2026-08-03T13:00:00.000Z',
    });
    expect(found).toEqual([]);
  });

  it('ignoriert gelöschte Fahrten', () => {
    const found = overlappingVehicleEntries([entry({ deleted: true })], {
      vehicleId: 'v1',
      abfahrt: '2026-08-03T11:00:00.000Z',
      ankunft: '2026-08-03T13:00:00.000Z',
    });
    expect(found).toEqual([]);
  });

  it('lässt den bearbeiteten Eintrag selbst außen vor', () => {
    const found = overlappingVehicleEntries(existing, {
      vehicleId: 'v1',
      abfahrt: '2026-08-03T11:00:00.000Z',
      ankunft: '2026-08-03T13:00:00.000Z',
      excludeEntryId: 'e1',
    });
    expect(found).toEqual([]);
  });

  it('bleibt still bei unlesbaren Zeiten', () => {
    // Eine Warnung, die auf einem kaputten Zeitstempel beruht, wäre Rauschen.
    expect(
      overlappingVehicleEntries(existing, {
        vehicleId: 'v1',
        abfahrt: '',
        ankunft: '',
      }),
    ).toEqual([]);
    expect(
      overlappingVehicleEntries([entry({ abfahrt: 'kaputt' })], {
        vehicleId: 'v1',
        abfahrt: '2026-08-03T11:00:00.000Z',
        ankunft: '2026-08-03T13:00:00.000Z',
      }),
    ).toEqual([]);
  });
});

describe('referenceCounters', () => {
  const entries = [
    {
      id: 'e2',
      vehicleId: 'v1',
      deleted: false,
      counters: { km: { end: 1100 } },
    },
    {
      id: 'e1',
      vehicleId: 'v1',
      deleted: false,
      counters: { km: { end: 1042 } },
    },
  ] as unknown as FahrtenbuchEntry[];

  it('nutzt beim Anlegen den Fahrzeug-Cache', () => {
    expect(referenceCounters(entries, 'v1', { km: 1100 })).toEqual({
      km: 1100,
    });
  });

  it('nutzt beim Bearbeiten den chronologischen Vorgänger', () => {
    expect(referenceCounters(entries, 'v1', { km: 1100 }, 'e2')).toEqual({
      km: 1042,
    });
  });

  it('liefert nichts, wenn der bearbeitete Eintrag der älteste ist', () => {
    expect(referenceCounters(entries, 'v1', { km: 1100 }, 'e1')).toEqual({});
  });
});

describe('suggestPresetForVehicleName', () => {
  it('schlägt für das MZB das Boot-Preset vor', () => {
    expect(suggestPresetForVehicleName('MZB')).toBe('boot');
  });

  it('schlägt für Anhänger kein Zähler-Preset vor', () => {
    expect(suggestPresetForVehicleName('Öl Einachsanhänger')).toBe('none');
    expect(suggestPresetForVehicleName('WLA-Bergung')).toBe('none');
  });

  it('schlägt sonst das Fahrzeug-Preset vor', () => {
    expect(suggestPresetForVehicleName('RLFA 3000/100')).toBe('fahrzeug');
  });
});

describe('validateEntryInput mit Zusatzfahrern', () => {
  const kmCounter: CounterDefinition = {
    id: 'km',
    label: 'Kilometerstand',
    unit: 'km',
    mode: 'startEnd',
    changeWarning: 'decrease',
    required: true,
  };

  const baseInput = (coDrivers?: FahrtenbuchDriverRef[]): EntryInput => ({
    vehicleId: 'v1',
    driverName: 'Max Muster',
    coDrivers,
    zweck: 'uebung',
    ziel: 'Übungsgelände',
    abfahrt: '2026-08-18T08:00:00.000Z',
    ankunft: '2026-08-18T09:00:00.000Z',
    counters: { km: { start: 1000, end: 1050 } },
  });

  const names = (count: number): FahrtenbuchDriverRef[] =>
    Array.from({ length: count }, (_, index) => ({ name: `Fahrer ${index}` }));

  it('akzeptiert die Höchstzahl an Zusatzfahrern', () => {
    expect(
      validateEntryInput([kmCounter], baseInput(names(FAHRTENBUCH_MAX_CO_DRIVERS))),
    ).toEqual([]);
  });

  it('lehnt einen Zusatzfahrer über der Höchstzahl ab', () => {
    expect(
      validateEntryInput(
        [kmCounter],
        baseInput(names(FAHRTENBUCH_MAX_CO_DRIVERS + 1)),
      ),
    ).toContain('coDriversTooMany');
  });

  it('zählt nur Zusatzfahrer mit Namen — leere Einträge sind kein Fehler', () => {
    const coDrivers = [...names(FAHRTENBUCH_MAX_CO_DRIVERS), { name: '   ' }];
    expect(validateEntryInput([kmCounter], baseInput(coDrivers))).toEqual([]);
  });

  it('ersetzt den Hauptfahrer nicht', () => {
    const input = { ...baseInput([{ name: 'Anna Bauer' }]), driverName: '' };
    expect(validateEntryInput([kmCounter], input)).toContain('driverMissing');
  });
});

describe('driverNamesOf', () => {
  it('verbindet Haupt- und Zusatzfahrer, Hauptfahrer zuerst', () => {
    expect(
      driverNamesOf({
        driverName: 'Max Muster',
        coDrivers: [{ name: 'Anna Bauer' }, { name: ' Eva Klein ' }],
      }),
    ).toBe('Max Muster, Anna Bauer, Eva Klein');
  });

  it('gibt nur den Hauptfahrer ohne Zusatzfahrer', () => {
    expect(driverNamesOf({ driverName: 'Max Muster' })).toBe('Max Muster');
  });

  it('gibt eine leere Zeichenkette bei einer Einheit ohne Fahrer', () => {
    expect(driverNamesOf({ driverName: '' })).toBe('');
  });
});

describe('Betriebsmittel', () => {
  it('führt Öl als vierte Art, ans Ende gestellt', () => {
    // Die Reihenfolge bestimmt die Spaltenfolge im PDF-Export und im
    // Wochenbericht — Öl ans Ende, damit bestehende Dokumente ihre
    // Spaltenpositionen behalten.
    expect(FUEL_TYPES).toEqual(['diesel', 'benzin', 'adblue', 'oel']);
  });

  it('zählt nur Diesel und Benzin als Antrieb', () => {
    expect(PROPELLANTS).toEqual(['diesel', 'benzin']);
    expect(isPropellant('diesel')).toBe(true);
    expect(isPropellant('benzin')).toBe(true);
    expect(isPropellant('adblue')).toBe(false);
    expect(isPropellant('oel')).toBe(false);
  });
});
