import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchVehicle,
  type VehiclePresetId,
} from '../../common/fahrtenbuch';
import {
  planVehicleImport,
  resolveVehicleImportSelection,
  sanitizeCounterDefinitions,
  sanitizeFuelTypes,
  sanitizeSortOrder,
  sanitizeStandort,
} from './stammdatenLogic';

function vehicle(overrides: Partial<FahrtenbuchVehicle>): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 3000/100',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: [],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

describe('planVehicleImport', () => {
  const source = [
    { id: 'kdtfa', name: 'KDTFA', sortOrder: 1 },
    { id: 'mzb', name: 'MZB', sortOrder: 2 },
    { id: 'anh', name: 'Öl Einachsanhänger', sortOrder: 3 },
  ];

  it('schlägt je Quell-Fahrzeug ein Preset vor', () => {
    const plan = planVehicleImport(source, []);
    expect(plan.map((p) => [p.name, p.preset])).toEqual([
      ['KDTFA', 'fahrzeug'],
      ['MZB', 'boot'],
      ['Öl Einachsanhänger', 'none'],
    ]);
    expect(plan.every((p) => !p.alreadyImported)).toBe(true);
  });

  it('markiert Fahrzeuge mit passender kostenersatzVehicleId als importiert', () => {
    const plan = planVehicleImport(source, [
      vehicle({ kostenersatzVehicleId: 'mzb' }),
    ]);
    expect(plan.find((p) => p.sourceId === 'mzb')?.alreadyImported).toBe(true);
    expect(plan.find((p) => p.sourceId === 'kdtfa')?.alreadyImported).toBe(
      false,
    );
  });

  it('erkennt bereits importierte Fahrzeuge über den normalisierten Namen', () => {
    const plan = planVehicleImport(source, [vehicle({ name: 'kdtfa' })]);
    expect(plan.find((p) => p.sourceId === 'kdtfa')?.alreadyImported).toBe(true);
  });
});

describe('resolveVehicleImportSelection', () => {
  const rows = planVehicleImport(
    [
      { id: 'kdtfa', name: 'KDTFA', sortOrder: 1 },
      { id: 'mzb', name: 'MZB', sortOrder: 2 },
    ],
    [vehicle({ kostenersatzVehicleId: 'mzb' })],
  );

  it('legt nur die ausgewählten Fahrzeuge an', () => {
    const result = resolveVehicleImportSelection(rows, [
      { sourceId: 'kdtfa', preset: 'fahrzeug' },
    ]);
    expect(result.create).toEqual([
      { sourceId: 'kdtfa', name: 'KDTFA', sortOrder: 1, preset: 'fahrzeug' },
    ]);
    expect(result.skipped).toBe(0);
  });

  it('überspringt ausgewählte Fahrzeuge, die bereits importiert sind', () => {
    const result = resolveVehicleImportSelection(rows, [
      { sourceId: 'kdtfa', preset: 'fahrzeug' },
      { sourceId: 'mzb', preset: 'boot' },
    ]);
    expect(result.create.map((c) => c.sourceId)).toEqual(['kdtfa']);
    expect(result.skipped).toBe(1);
  });

  it('zählt eine Auswahl ohne passende Quellzeile als übersprungen', () => {
    const result = resolveVehicleImportSelection(rows, [
      { sourceId: 'gibtsnicht', preset: 'fahrzeug' },
    ]);
    expect(result.create).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('verwirft ein unbekanntes Preset, statt es zu übernehmen', () => {
    const result = resolveVehicleImportSelection(rows, [
      { sourceId: 'kdtfa', preset: 'kaputt' as VehiclePresetId },
    ]);
    expect(result.create).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('verwirft Prototyp-Schlüssel als Preset', () => {
    const result = resolveVehicleImportSelection(rows, [
      { sourceId: 'kdtfa', preset: 'constructor' as VehiclePresetId },
    ]);
    expect(result.create).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('legt denselben Namen innerhalb eines Laufs nur einmal an', () => {
    const doubled = planVehicleImport(
      [
        { id: 'a', name: 'KDTFA', sortOrder: 1 },
        { id: 'b', name: 'kdtfa', sortOrder: 2 },
      ],
      [],
    );
    const result = resolveVehicleImportSelection(doubled, [
      { sourceId: 'a', preset: 'fahrzeug' },
      { sourceId: 'b', preset: 'fahrzeug' },
    ]);
    expect(result.create.map((c) => c.sourceId)).toEqual(['a']);
    expect(result.skipped).toBe(1);
  });
});

describe('sanitizeCounterDefinitions', () => {
  it('behält nur die bekannten Felder', () => {
    const result = sanitizeCounterDefinitions([
      {
        id: ' km ',
        label: 'Kilometerstand',
        labelKey: 'counters.km',
        unit: 'km',
        mode: 'startEnd',
        changeWarning: 'decrease',
        required: true,
        evil: 'dropMe',
      },
    ]);
    expect(result).toEqual([
      {
        id: 'km',
        label: 'Kilometerstand',
        labelKey: 'counters.km',
        unit: 'km',
        mode: 'startEnd',
        changeWarning: 'decrease',
        required: true,
      },
    ]);
  });

  it('verwirft Zähler ohne brauchbare id', () => {
    expect(
      sanitizeCounterDefinitions([
        { label: 'ohne id' },
        { id: '   ', label: 'leer' },
        { id: 42, label: 'keine Zeichenkette' },
        'kein Objekt',
        null,
      ]),
    ).toEqual([]);
  });

  it('verwirft doppelte Zähler-ids', () => {
    const result = sanitizeCounterDefinitions([
      { id: 'km', label: 'Erster' },
      { id: 'km', label: 'Zweiter' },
    ]);
    expect(result.map((c) => c.label)).toEqual(['Erster']);
  });

  it('setzt ungültige mode- und changeWarning-Werte auf sichere Vorgaben', () => {
    const [counter] = sanitizeCounterDefinitions([
      { id: 'km', mode: 'irgendwas', changeWarning: 'immer' },
    ]);
    expect(counter.mode).toBe('startEnd');
    expect(counter.changeWarning).toBe('none');
    expect(counter.required).toBe(false);
    expect(counter.label).toBe('km');
    expect(counter.unit).toBe('');
    expect(counter).not.toHaveProperty('labelKey');
  });

  it('liefert für Nicht-Arrays eine leere Liste', () => {
    expect(sanitizeCounterDefinitions(undefined)).toEqual([]);
    expect(sanitizeCounterDefinitions('km')).toEqual([]);
  });
});

describe('sanitizeFuelTypes', () => {
  it('behält nur bekannte Treibstoffarten und entfernt Duplikate', () => {
    expect(
      sanitizeFuelTypes(['diesel', 'kerosin', 'diesel', 'adblue', 7, null]),
    ).toEqual(['diesel', 'adblue']);
  });

  it('liefert für Nicht-Arrays eine leere Liste', () => {
    expect(sanitizeFuelTypes(undefined)).toEqual([]);
    expect(sanitizeFuelTypes('diesel')).toEqual([]);
  });
});

describe('sanitizeSortOrder', () => {
  it('übernimmt endliche Zahlen', () => {
    expect(sanitizeSortOrder(3)).toBe(3);
    expect(sanitizeSortOrder(-2.5)).toBe(-2.5);
  });

  it('wandelt numerische Zeichenketten in Zahlen', () => {
    expect(sanitizeSortOrder('7')).toBe(7);
  });

  it('fällt bei unbrauchbaren Werten auf 0 zurück', () => {
    expect(sanitizeSortOrder(undefined)).toBe(0);
    expect(sanitizeSortOrder('viertes')).toBe(0);
    expect(sanitizeSortOrder(Number.NaN)).toBe(0);
    expect(sanitizeSortOrder(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeSortOrder(true)).toBe(0);
    expect(sanitizeSortOrder({})).toBe(0);
  });
});

describe('sanitizeStandort', () => {
  it('übernimmt gültige Koordinaten', () => {
    expect(sanitizeStandort({ lat: 47.94, lng: 16.84 })).toEqual({
      lat: 47.94,
      lng: 16.84,
    });
  });

  it('verwirft Werte außerhalb des gültigen Bereichs', () => {
    expect(sanitizeStandort({ lat: 91, lng: 16.84 })).toBeUndefined();
    expect(sanitizeStandort({ lat: 47.94, lng: 181 })).toBeUndefined();
  });

  it('verwirft nicht-endliche und fehlende Werte', () => {
    expect(sanitizeStandort({ lat: Number.NaN, lng: 16.84 })).toBeUndefined();
    expect(sanitizeStandort(undefined)).toBeUndefined();
  });

  it('akzeptiert die Randwerte des gültigen Bereichs', () => {
    expect(sanitizeStandort({ lat: 90, lng: 180 })).toEqual({
      lat: 90,
      lng: 180,
    });
    expect(sanitizeStandort({ lat: -90, lng: -180 })).toEqual({
      lat: -90,
      lng: -180,
    });
  });

  it('verwirft Werte knapp außerhalb der Randwerte', () => {
    expect(sanitizeStandort({ lat: -91, lng: 16.84 })).toBeUndefined();
    expect(sanitizeStandort({ lat: 47.94, lng: -181 })).toBeUndefined();
  });

  it('verwirft Infinity als Wert', () => {
    expect(
      sanitizeStandort({ lat: Number.POSITIVE_INFINITY, lng: 16.84 }),
    ).toBeUndefined();
    expect(
      sanitizeStandort({ lat: 47.94, lng: Number.NEGATIVE_INFINITY }),
    ).toBeUndefined();
  });

  it('übernimmt nur lat und lng, keine Zusatzfelder wie alt', () => {
    expect(
      sanitizeStandort({ lat: 47.94, lng: 16.84, alt: 123 }),
    ).toStrictEqual({
      lat: 47.94,
      lng: 16.84,
    });
  });

  it('verwirft Null Island (0,0) als Sentinel eines leeren Formulars', () => {
    expect(sanitizeStandort({ lat: 0, lng: 0 })).toBeUndefined();
  });

  it('akzeptiert lat 0 für sich allein — der Äquator ist eine gültige Breite', () => {
    expect(sanitizeStandort({ lat: 0, lng: 16.84 })).toEqual({
      lat: 0,
      lng: 16.84,
    });
  });

  it('verwirft Nicht-Objekte', () => {
    expect(sanitizeStandort(null)).toBeUndefined();
    expect(sanitizeStandort('47.94,16.84')).toBeUndefined();
    expect(sanitizeStandort([47.94, 16.84])).toBeUndefined();
    expect(sanitizeStandort({})).toBeUndefined();
  });

  it('wandelt numerische Zeichenketten in Zahlen', () => {
    expect(sanitizeStandort({ lat: '47.94', lng: '16.84' })).toEqual({
      lat: 47.94,
      lng: 16.84,
    });
  });
});
