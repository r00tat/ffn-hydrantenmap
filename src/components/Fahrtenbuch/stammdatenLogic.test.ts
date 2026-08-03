import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
  type VehiclePresetId,
} from '../../common/fahrtenbuch';
import {
  planPersonSync,
  planVehicleImport,
  resolveVehicleImportSelection,
  sanitizeCounterDefinitions,
  sanitizeFuelTypes,
  sanitizeSortOrder,
} from './stammdatenLogic';

function person(overrides: Partial<FahrtenbuchPerson>): FahrtenbuchPerson {
  return {
    id: 'p1',
    name: 'Max Mustermann',
    active: true,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

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

describe('planPersonSync', () => {
  const recipients = [
    { id: 'r1', name: 'Max Mustermann' },
    { id: 'r2', name: 'Erika Musterfrau' },
  ];

  it('legt unbekannte Empfänger neu an', () => {
    const plan = planPersonSync(recipients, []);
    expect(plan.create.map((c) => c.blaulichtSmsRecipientId)).toEqual([
      'r1',
      'r2',
    ]);
    expect(plan.link).toEqual([]);
  });

  it('verknüpft bestehende Personen über den normalisierten Namen', () => {
    const plan = planPersonSync(recipients, [
      person({ id: 'p1', name: 'max mustermann' }),
    ]);
    expect(plan.link).toEqual([
      { personId: 'p1', blaulichtSmsRecipientId: 'r1' },
    ]);
    expect(plan.create.map((c) => c.blaulichtSmsRecipientId)).toEqual(['r2']);
  });

  it('lässt bereits verknüpfte Personen unangetastet', () => {
    const existing = [
      person({ id: 'p1', name: 'Max Mustermann', blaulichtSmsRecipientId: 'r1' }),
    ];
    const plan = planPersonSync(recipients, existing);
    expect(plan.link).toEqual([]);
    expect(plan.create.map((c) => c.blaulichtSmsRecipientId)).toEqual(['r2']);
  });

  it('meldet mehrdeutige Namen, ohne zu verknüpfen', () => {
    const existing = [
      person({ id: 'p1', name: 'Max Mustermann' }),
      person({ id: 'p2', name: 'max mustermann' }),
    ];
    const plan = planPersonSync(recipients, existing);
    expect(plan.ambiguous).toEqual([
      { blaulichtSmsRecipientId: 'r1', name: 'Max Mustermann' },
    ]);
    expect(plan.link).toEqual([]);
    expect(plan.create.map((c) => c.blaulichtSmsRecipientId)).toEqual(['r2']);
  });

  it('meldet einen Namenstreffer mit abweichender Empfänger-ID, statt eine zweite Person anzulegen', () => {
    const existing = [
      person({ id: 'p1', name: 'Max Mustermann', blaulichtSmsRecipientId: 'r1' }),
    ];
    const plan = planPersonSync(
      [{ id: 'r9', name: 'Max Mustermann' }],
      existing,
    );
    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([]);
    expect(plan.ambiguous).toEqual([
      { blaulichtSmsRecipientId: 'r9', name: 'Max Mustermann' },
    ]);
  });

  it('verknüpft eine Person nicht mit zwei gleichnamigen Empfängern', () => {
    const plan = planPersonSync(
      [
        { id: 'r1', name: 'Max Mustermann' },
        { id: 'r2', name: 'max  mustermann' },
      ],
      [person({ id: 'p1', name: 'Max Mustermann' })],
    );
    expect(plan.link).toEqual([
      { personId: 'p1', blaulichtSmsRecipientId: 'r1' },
    ]);
    expect(plan.create).toEqual([]);
    expect(plan.ambiguous).toEqual([
      { blaulichtSmsRecipientId: 'r2', name: 'max  mustermann' },
    ]);
  });
});
