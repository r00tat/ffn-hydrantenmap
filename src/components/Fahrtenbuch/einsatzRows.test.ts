import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  buildEinsatzRows,
  mergeRowEdits,
  partitionEinsatzRows,
  type EinsatzRow,
} from './einsatzRows';

const vehicle: FahrtenbuchVehicle = {
  id: 'gv1',
  name: 'RLFA 3000/100',
  active: true,
  counters: VEHICLE_PRESETS.fahrzeug,
  fuelTypes: [],
  lastCounters: { km: 1000 },
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const boot: FahrtenbuchVehicle = {
  id: 'gv2',
  name: 'MZB',
  active: true,
  counters: VEHICLE_PRESETS.boot,
  fuelTypes: [],
  lastCounters: { betriebsstundenBb: 20 },
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const person: FahrtenbuchPerson = {
  id: 'p1',
  name: 'Max Mustermann',
  active: true,
  blaulichtSmsRecipientId: 'r1',
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
};

const firecall = {
  id: 'f1',
  name: 'Brand B2',
  date: '2026-08-03T10:00:00.000Z',
  abruecken: '2026-08-03T12:00:00.000Z',
};

const now = '2026-08-03T13:00:00.000Z';

describe('buildEinsatzRows', () => {
  it('bildet je Fzg-Item eine Zeile und matcht das Gruppen-Fahrzeug über den Namen', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA-3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleId).toBe('gv1');
    expect(rows[0].vehicleName).toBe('RLFA 3000/100');
  });

  it('lässt vehicleId leer, wenn kein Gruppen-Fahrzeug passt', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'Drehleiter' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].vehicleId).toBeUndefined();
    expect(rows[0].sourceName).toBe('Drehleiter');
  });

  it('übernimmt den Maschinisten über die BlaulichtSMS-ID', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r1',
          name: 'M. Mustermann',
          vehicleId: 'i1',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [person],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverId).toBe('p1');
    expect(rows[0].driverName).toBe('Max Mustermann');
  });

  it('fällt auf den Namensmatch zurück', () => {
    const withoutRecipient = { ...person, blaulichtSmsRecipientId: undefined };
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r9',
          name: 'Max Mustermann',
          vehicleId: 'i1',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [withoutRecipient],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverId).toBe('p1');
  });

  it('nutzt den Crew-Namen als Freitext, wenn keine Person passt', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r9',
          name: 'Unbekannt',
          vehicleId: 'i1',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [person],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverId).toBeUndefined();
    expect(rows[0].driverName).toBe('Unbekannt');
  });

  it('ignoriert Crew-Mitglieder ohne Maschinisten-Funktion', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r1',
          name: 'Max',
          vehicleId: 'i1',
          funktion: 'Feuerwehrmann',
        },
      ],
      vehicles: [vehicle],
      persons: [person],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverName).toBe('');
  });

  it('belegt Zeiten aus dem Fzg-Item, sonst aus dem Einsatz', () => {
    const rows = buildEinsatzRows({
      fzgItems: [
        { id: 'i1', name: 'RLFA 3000/100', alarmierung: '2026-08-03T10:05:00.000Z' },
        { id: 'i2', name: 'MZB' },
      ],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].abfahrt).toBe('2026-08-03T10:05:00.000Z');
    expect(rows[0].ankunft).toBe('2026-08-03T12:00:00.000Z');
    expect(rows[1].abfahrt).toBe('2026-08-03T10:00:00.000Z');
  });

  it('nutzt jetzt als Ankunft, wenn der Einsatz noch läuft', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall: { ...firecall, abruecken: undefined },
      now,
    });
    expect(rows[0].ankunft).toBe(now);
  });

  it('belegt die Startzähler aus lastCounters', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].counters).toEqual({ km: { start: 1000 } });
  });

  it('markiert Fahrzeuge mit bestehendem Eintrag', () => {
    const existing = {
      id: 'e1',
      firecallId: 'f1',
      vehicleId: 'gv1',
      deleted: false,
    } as FahrtenbuchEntry;
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [existing],
      firecall,
      now,
    });
    expect(rows[0].existingEntry?.id).toBe('e1');
  });

  it('ergänzt Fahrzeuge, die nur über die Crew zugeordnet sind', () => {
    const rows = buildEinsatzRows({
      fzgItems: [],
      crew: [
        {
          recipientId: 'r1',
          name: 'Max',
          vehicleId: 'i9',
          vehicleName: 'RLFA 3000/100',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [person],
      entries: [],
      firecall,
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleId).toBe('gv1');
    expect(rows[0].driverId).toBe('p1');
  });

  it('legt für ein Boot Betriebsstunden statt Kilometer an', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'MZB' }],
      crew: [],
      vehicles: [vehicle, boot],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].vehicleId).toBe('gv2');
    expect(rows[0].counters).toEqual({ betriebsstundenBb: { start: 20 } });
    expect(rows[0].counters.km).toBeUndefined();
  });

  it('ergänzt kein Fahrzeug, das schon als Fzg-Item vorliegt', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r1',
          name: 'Max',
          vehicleId: 'i1',
          vehicleName: 'RLFA 3000/100',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [person],
      entries: [],
      firecall,
      now,
    });
    expect(rows).toHaveLength(1);
  });

  it('bevorzugt die Empfänger-ID vor dem Namen, wenn beide auf verschiedene Personen zeigen', () => {
    const personB: FahrtenbuchPerson = {
      ...person,
      id: 'p2',
      name: 'Max Mustermann',
      blaulichtSmsRecipientId: 'r2',
    };
    const personA: FahrtenbuchPerson = {
      ...person,
      id: 'p1',
      name: 'Maximilian Mustermann',
      blaulichtSmsRecipientId: 'r1',
    };
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      // Der Crew-Name passt exakt auf Person B, die ID auf Person A.
      crew: [
        {
          recipientId: 'r1',
          name: 'Max Mustermann',
          vehicleId: 'i1',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [personB, personA],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverId).toBe('p1');
    expect(rows[0].driverName).toBe('Maximilian Mustermann');
  });

  it('verknüpft bei Namensgleichheit keine Person', () => {
    const twin: FahrtenbuchPerson = {
      ...person,
      id: 'p2',
      blaulichtSmsRecipientId: 'r2',
    };
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [
        {
          recipientId: 'r9',
          name: 'Max Mustermann',
          vehicleId: 'i1',
          funktion: 'Maschinist',
        },
      ],
      vehicles: [vehicle],
      persons: [person, twin],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].driverId).toBeUndefined();
    expect(rows[0].driverName).toBe('Max Mustermann');
  });

  it('normalisiert Zeitstempel, die nicht ISO-8601 sind', () => {
    const rows = buildEinsatzRows({
      fzgItems: [
        // So schreibt der KI-Assistent `alarmierung` in die Fzg-Items.
        { id: 'i1', name: 'RLFA 3000/100', alarmierung: '10:05' },
        { id: 'i2', name: 'MZB', alarmierung: '03.08.2026 10:07:00' },
      ],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    const first = new Date(rows[0].abfahrt);
    expect(Number.isNaN(first.getTime())).toBe(false);
    expect(first.getHours()).toBe(10);
    expect(first.getMinutes()).toBe(5);

    const second = new Date(rows[1].abfahrt);
    expect(second.getFullYear()).toBe(2026);
    expect(second.getHours()).toBe(10);
    expect(second.getMinutes()).toBe(7);
  });

  it('fällt bei unlesbarem Zeitstempel auf den Einsatz zurück', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100', alarmierung: 'sofort' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
      now,
    });
    expect(rows[0].abfahrt).toBe(firecall.date);
  });

  it('ignoriert einen gelöschten Eintrag desselben Einsatzes', () => {
    const deleted = {
      id: 'e1',
      firecallId: 'f1',
      vehicleId: 'gv1',
      deleted: true,
    } as FahrtenbuchEntry;
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [deleted],
      firecall,
      now,
    });
    expect(rows[0].existingEntry).toBeUndefined();
  });
});

function row(overrides: Partial<EinsatzRow> = {}): EinsatzRow {
  return {
    key: 'i1',
    sourceName: 'RLFA 3000/100',
    vehicleId: 'gv1',
    vehicleName: 'RLFA 3000/100',
    driverName: 'Max Mustermann',
    abfahrt: '2026-08-03T10:00:00.000Z',
    ankunft: '2026-08-03T12:00:00.000Z',
    counters: { km: { start: 1000, end: 1050 } },
    ...overrides,
  };
}

describe('partitionEinsatzRows', () => {
  it('nimmt vollständige Zeilen auf', () => {
    const result = partitionEinsatzRows([row()], [vehicle], 'Brand B2');
    expect(result.ready).toHaveLength(1);
    expect(result.incomplete).toHaveLength(0);
    expect(result.unassigned).toHaveLength(0);
    expect(result.existing).toHaveLength(0);
  });

  it('sammelt Zeilen ohne Endstand als unvollständig und nennt den Grund', () => {
    const result = partitionEinsatzRows(
      [row({ counters: { km: { start: 1000 } } })],
      [vehicle],
      'Brand B2',
    );
    expect(result.ready).toHaveLength(0);
    expect(result.incomplete).toHaveLength(1);
    expect(result.incomplete[0].errors).toEqual(['counterMissing:km']);
  });

  it('sammelt Zeilen ohne Fahrer als unvollständig und nennt den Grund', () => {
    const result = partitionEinsatzRows(
      [row({ driverName: '' })],
      [vehicle],
      'Brand B2',
    );
    expect(result.incomplete).toHaveLength(1);
    expect(result.incomplete[0].errors).toContain('driverMissing');
  });

  it('meldet eine unlesbare Abfahrtszeit als solche, nicht als fehlenden Endstand', () => {
    const result = partitionEinsatzRows(
      [row({ abfahrt: 'sofort' })],
      [vehicle],
      'Brand B2',
    );
    expect(result.incomplete[0].errors).toContain('abfahrtInvalid');
    expect(result.incomplete[0].errors).not.toContain('counterMissing:km');
  });

  it('schreibt für dasselbe Fahrzeug nur eine Zeile — auch aus zwei Fzg-Items', () => {
    const result = partitionEinsatzRows(
      [row({ key: 'i1' }), row({ key: 'i2' })],
      [vehicle],
      'Brand B2',
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].key).toBe('i1');
    expect(result.existing).toHaveLength(1);
    expect(result.existing[0].key).toBe('i2');
  });

  it('sammelt Zeilen ohne Fahrzeugzuordnung getrennt', () => {
    const result = partitionEinsatzRows(
      [row({ vehicleId: undefined })],
      [vehicle],
      'Brand B2',
    );
    expect(result.unassigned).toHaveLength(1);
    expect(result.incomplete).toHaveLength(0);
    expect(result.ready).toHaveLength(0);
  });

  it('überspringt bereits erfasste Fahrzeuge, ohne sie zu melden', () => {
    const result = partitionEinsatzRows(
      [row({ existingEntry: { id: 'e1' } as FahrtenbuchEntry })],
      [vehicle],
      'Brand B2',
    );
    expect(result.ready).toHaveLength(0);
    expect(result.incomplete).toHaveLength(0);
    expect(result.existing).toHaveLength(1);
  });

  it('behandelt eine nachträglich zugeordnete Doppelung wie einen bestehenden Eintrag', () => {
    const result = partitionEinsatzRows(
      [
        row({ key: 'i1', existingEntry: { id: 'e1' } as FahrtenbuchEntry }),
        // Manuell auf dasselbe Fahrzeug zugeordnet
        row({ key: 'i2' }),
      ],
      [vehicle],
      'Brand B2',
    );
    expect(result.ready).toHaveLength(0);
    expect(result.existing).toHaveLength(2);
  });

  it('verlangt beim Boot die Ablesewerte der Lenzpumpen', () => {
    const bootRow = row({
      vehicleId: 'gv2',
      vehicleName: 'MZB',
      counters: { betriebsstundenBb: { start: 20, end: 22 } },
    });
    expect(partitionEinsatzRows([bootRow], [boot], 'Brand B2').incomplete).toHaveLength(
      1,
    );

    const complete = row({
      vehicleId: 'gv2',
      vehicleName: 'MZB',
      counters: {
        betriebsstundenBb: { start: 20, end: 22 },
        lenzpumpeStb: { end: 5 },
        lenzpumpeBb: { end: 6 },
      },
    });
    expect(partitionEinsatzRows([complete], [boot], 'Brand B2').ready).toHaveLength(1);
  });

  it('meldet eine Ankunft vor der Abfahrt als unvollständig', () => {
    const result = partitionEinsatzRows(
      [row({ ankunft: '2026-08-03T09:00:00.000Z' })],
      [vehicle],
      'Brand B2',
    );
    expect(result.incomplete).toHaveLength(1);
  });
});

describe('mergeRowEdits', () => {
  const entries: FahrtenbuchEntry[] = [
    {
      id: 'e1',
      firecallId: 'f1',
      vehicleId: 'gv1',
      deleted: false,
    } as FahrtenbuchEntry,
  ];

  it('lässt unveränderte Zeilen unangetastet', () => {
    const rows = [row({ vehicleId: 'gv2', counters: {} })];
    expect(mergeRowEdits(rows, {}, [], 'f1')).toEqual(rows);
  });

  it('behält Eingaben, wenn die Zeilen neu berechnet werden', () => {
    const recomputed = [row({ driverName: 'Max Mustermann', vehicleId: 'gv2' })];
    const merged = mergeRowEdits(
      recomputed,
      { i1: { driverName: 'J. Müller', driverId: undefined } },
      [],
      'f1',
    );
    expect(merged[0].driverName).toBe('J. Müller');
  });

  it('erkennt einen bestehenden Eintrag nach manueller Fahrzeugzuordnung', () => {
    const merged = mergeRowEdits(
      [row({ vehicleId: undefined, vehicleName: '', sourceName: 'RLF' })],
      { i1: { vehicleId: 'gv1', vehicleName: 'RLFA 3000/100' } },
      entries,
      'f1',
    );
    expect(merged[0].existingEntry?.id).toBe('e1');
  });

  it('verwirft einen bestehenden Eintrag, wenn die Zuordnung zurückgenommen wird', () => {
    const merged = mergeRowEdits(
      [row({ existingEntry: entries[0] })],
      { i1: { vehicleId: undefined, vehicleName: '' } },
      entries,
      'f1',
    );
    expect(merged[0].existingEntry).toBeUndefined();
  });

  it('übernimmt frische Daten für Felder, die niemand angefasst hat', () => {
    const merged = mergeRowEdits(
      [row({ counters: { km: { start: 1234 } } })],
      { i1: { driverName: 'J. Müller' } },
      [],
      'f1',
    );
    expect(merged[0].counters).toEqual({ km: { start: 1234 } });
    expect(merged[0].driverName).toBe('J. Müller');
  });
});
