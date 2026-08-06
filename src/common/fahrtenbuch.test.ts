import { describe, expect, it } from 'vitest';
import {
  applyCounterDiffs,
  arrivalFromTimeOnly,
  arrivalOnDepartureDay,
  counterWarnings,
  FAHRT_ZWECKE,
  isTimeOnlyTimestamp,
  findEntryForFirecallVehicle,
  matchVehicleByName,
  normalizeName,
  referenceCounters,
  requiresDriver,
  suggestPresetForVehicleName,
  validateEntryInput,
  VEHICLE_PRESETS,
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
