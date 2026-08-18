import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  buildEinsatzRows,
  einsatzTimes,
  kmPreview,
  mergeRowEdits,
  partitionEinsatzRows,
  unitsWithoutVehicle,
  type EinsatzRow,
  type EinsatzTimes,
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

/**
 * Die gemeinsamen Zeiten des Kopfblocks. `buildEinsatzRows` leitet keine Zeiten
 * mehr ab — das macht `einsatzTimes`, mit eigenen Tests weiter unten.
 */
/** Eine Schätzung von 24 km Gesamtstrecke, wie sie der Client berechnet. */
const ESTIMATE_24 = {
  distance: { roundTripKm: 24, source: 'estimate' as const },
};

const TIMES: EinsatzTimes = {
  abfahrt: '2026-08-03T10:00:00.000Z',
  ankunft: '2026-08-03T12:00:00.000Z',
};

describe('buildEinsatzRows', () => {
  it('bildet je Fzg-Item eine Zeile und matcht das Gruppen-Fahrzeug über den Namen', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA-3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
    }, TIMES);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleId).toBe('gv1');
    expect(rows[0].vehicleName).toBe('RLFA 3000/100');
  });

  it('lässt eine Einheit ohne Fahrzeug in den Stammdaten ganz weg', () => {
    // Ein Wechselladeaufbau oder ein Gerät auf der Einsatzkarte hat kein
    // eigenes Fahrtenbuch. Eine Zeile dafür könnte niemand ausfüllen.
    const rows = buildEinsatzRows({
      fzgItems: [
        { id: 'i1', name: 'RLFA 3000/100' },
        { id: 'i2', name: 'WLA-Bergung' },
      ],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
    }, TIMES);
    expect(rows).toHaveLength(1);
    expect(rows[0].vehicleId).toBe('gv1');
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
    expect(rows[0].driverName).toBe('');
  });

  it('belegt die Startzähler aus lastCounters', () => {
    const rows = buildEinsatzRows({
      fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
      crew: [],
      vehicles: [vehicle],
      persons: [],
      entries: [],
      firecall,
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
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
    }, TIMES);
    expect(rows[0].driverId).toBeUndefined();
    expect(rows[0].driverName).toBe('Max Mustermann');
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
    }, TIMES);
    expect(rows[0].existingEntry).toBeUndefined();
  });
});

describe('unitsWithoutVehicle', () => {
  it('nennt die Einheiten, für die kein Fahrzeug hinterlegt ist', () => {
    // Der Gegenwert zum Weglassen: Ein Fahrzeug, das in den Stammdaten anders
    // geschrieben steht, bliebe sonst unbemerkt ohne Fahrt.
    expect(
      unitsWithoutVehicle({
        fzgItems: [
          { id: 'i1', name: 'RLFA 3000/100' },
          { id: 'i2', name: 'TLFA 4000' },
        ],
        crew: [],
        vehicles: [vehicle],
      }),
    ).toEqual(['TLFA 4000']);
  });

  it('nennt jede Einheit nur einmal', () => {
    expect(
      unitsWithoutVehicle({
        fzgItems: [
          { id: 'i1', name: 'TLFA 4000' },
          { id: 'i2', name: 'TLFA 4000' },
        ],
        crew: [],
        vehicles: [vehicle],
      }),
    ).toEqual(['TLFA 4000']);
  });

  it('meldet Anhänger und Wechselladeaufbauten nicht', () => {
    // Sie fahren nicht selbst und führen kein eigenes Fahrtenbuch. Als Hinweis
    // wären sie Rauschen und ließen ein wirklich fehlendes Fahrzeug untergehen.
    expect(
      unitsWithoutVehicle({
        fzgItems: [
          { id: 'i1', name: 'WLA-Bergung' },
          { id: 'i2', name: 'WLA-Logistik' },
          { id: 'i3', name: 'Bootsanhänger' },
          { id: 'i4', name: 'Öl Einachsanhänger' },
        ],
        crew: [],
        vehicles: [vehicle],
      }),
    ).toEqual([]);
  });

  it('erfasst auch Einheiten, die nur über die Mannschaftszuordnung bekannt sind', () => {
    expect(
      unitsWithoutVehicle({
        fzgItems: [],
        crew: [
          { name: 'Max Muster', vehicleId: 'i9', vehicleName: 'TLFA 4000' },
        ],
        vehicles: [vehicle],
      }),
    ).toEqual(['TLFA 4000']);
  });

  it('meldet nichts, wenn jede Einheit ein Fahrzeug hat', () => {
    expect(
      unitsWithoutVehicle({
        fzgItems: [{ id: 'i1', name: 'RLFA 3000/100' }],
        crew: [],
        vehicles: [vehicle],
      }),
    ).toEqual([]);
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
    expect(result.existing).toHaveLength(0);
  });

  it('nimmt Zeilen eines namenlosen Einsatzes auf', () => {
    // Der Einsatzname wird als Ziel durchgereicht — ist er leer, trägt allein
    // der Einsatzbezug die Angabe. Ohne den Gleichlauf meldete die Vorprüfung
    // eine Zeile als unvollständig, die der Server anstandslos speichert.
    const result = partitionEinsatzRows([row()], [vehicle], '', undefined, 'fc1');
    expect(result.incomplete).toHaveLength(0);
    expect(result.ready).toHaveLength(1);
  });

  it('meldet eine Zeile ohne Ziel und ohne Einsatzbezug als unvollständig', () => {
    const result = partitionEinsatzRows([row()], [vehicle], '');
    expect(result.ready).toHaveLength(0);
    expect(result.incomplete[0].errors).toContain('zielMissing');
  });

  it('nimmt eine Einheit ohne Zähler auch ohne Fahrer und ohne Kilometer auf', () => {
    // WLA-Bergung, WLA-Logistik und Anhänger haben keinen eigenen Fahrer und
    // keine eigene Wegstrecke. Zuvor blockierte `driverMissing` ihre Zeile, und
    // die Fahrt fehlte im Fahrtenbuch.
    const wla: FahrtenbuchVehicle = {
      ...boot,
      id: 'gv3',
      name: 'WLA-Bergung',
      counters: VEHICLE_PRESETS.none,
      lastCounters: {},
    };
    const result = partitionEinsatzRows(
      [
        row({
          vehicleId: 'gv3',
          vehicleName: 'WLA-Bergung',
          sourceName: 'WLA-Bergung',
          driverName: '',
          counters: {},
        }),
      ],
      [wla],
      'Brand B2',
    );

    expect(result.incomplete).toHaveLength(0);
    expect(result.ready).toHaveLength(1);
  });

  it('hält eine Zeile ohne Endstand für speicherbar', () => {
    // Zählerstände sind in der Sammelerfassung nicht verpflichtend: Was der
    // Server ableiten kann, füllt er auf; der Rest wird nachgetragen. Früher
    // blockierte hier `counterMissing:km` die ganze Fahrt.
    const result = partitionEinsatzRows(
      [row({ counters: { km: { start: 1000 } } })],
      [vehicle],
      'Brand B2',
    );
    expect(result.ready).toHaveLength(1);
    expect(result.incomplete).toHaveLength(0);
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

  it('hält ein Boot auch ohne die Ablesewerte der Lenzpumpen für speicherbar', () => {
    const bootRow = row({
      vehicleId: 'gv2',
      vehicleName: 'MZB',
      counters: { betriebsstundenBb: { start: 20, end: 22 } },
    });
    expect(
      partitionEinsatzRows([bootRow], [boot], 'Brand B2').ready,
    ).toHaveLength(1);

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

  it('bestimmt den bestehenden Eintrag neu und übernimmt ihn nicht aus den Eingaben', () => {
    // Sonst ließe sich die Duplikatserkennung über eine untergeschobene
    // Eingabe umgehen — oder eine Zeile behielte einen Eintrag, den ein
    // frischer Snapshot längst nicht mehr kennt.
    const merged = mergeRowEdits(
      [row({ existingEntry: undefined })],
      { i1: { existingEntry: undefined, driverName: 'J. Müller' } },
      entries,
      'f1',
    );
    expect(merged[0].existingEntry?.id).toBe('e1');
    expect(merged[0].driverName).toBe('J. Müller');
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

describe('einsatzTimes', () => {
  /** Einsatz von vorgestern, erfasst wird heute. */
  const gestern = {
    id: 'f2',
    name: 'Brand B2',
    date: '2026-08-01T18:45:00.000Z',
  };
  const heute = '2026-08-03T09:00:00.000Z';

  it('legt eine Alarmierung ohne Datum auf den Einsatztag, nicht auf heute', () => {
    // `alarmierung: '19:00'` hat kein Datum. Ohne Verankerung landete die
    // Abfahrt auf dem heutigen Tag und damit zwei Tage nach dem Einsatz.
    const { abfahrt } = einsatzTimes(
      [{ id: 'i1', name: 'RLFA 3000/100', alarmierung: '19:00' }],
      gestern,
      heute,
    );

    const parsed = new Date(abfahrt);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(1);
    expect(parsed.getHours()).toBe(19);
  });

  it('legt ein Abrücken ohne Datum auf den Tag der Abfahrt', () => {
    const { abfahrt, ankunft } = einsatzTimes(
      [
        {
          id: 'i1',
          name: 'RLFA 3000/100',
          alarmierung: '19:00',
          abruecken: '21:30',
        },
      ],
      gestern,
      heute,
    );

    const parsed = new Date(ankunft);
    expect(parsed.getDate()).toBe(new Date(abfahrt).getDate());
    expect(parsed.getHours()).toBe(21);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('rollt ein Abrücken nach Mitternacht auf den nächsten Tag', () => {
    const { ankunft } = einsatzTimes(
      [
        {
          id: 'i1',
          name: 'RLFA 3000/100',
          alarmierung: '23:50',
          abruecken: '01:15',
        },
      ],
      gestern,
      heute,
    );

    expect(new Date(ankunft).getDate()).toBe(2);
    expect(new Date(ankunft).getHours()).toBe(1);
  });

  it('schlägt ohne Abrücken eine Ankunft am Tag der Abfahrt vor', () => {
    // Ohne diese Regel stand hier die aktuelle Uhrzeit von heute — bei einem
    // Einsatz von vorgestern zwei Tage nach der Abfahrt.
    const { abfahrt, ankunft } = einsatzTimes(
      [{ id: 'i1', name: 'RLFA 3000/100', alarmierung: '19:00' }],
      gestern,
      heute,
    );

    expect(new Date(ankunft).getDate()).toBe(new Date(abfahrt).getDate());
    expect(new Date(ankunft).getTime()).toBeGreaterThanOrEqual(
      new Date(abfahrt).getTime(),
    );
  });

  it('nimmt die früheste Alarmierung und das späteste Abrücken', () => {
    // Eine Zeit für alle Fahrzeuge: Die gemeinsame Spanne muss jede einzelne
    // Fahrt umfassen. Die späteste Abfahrt zu nehmen behauptete für ein früher
    // ausgerücktes Fahrzeug eine Abfahrt nach seiner eigenen Ankunft.
    const { abfahrt, ankunft } = einsatzTimes(
      [
        {
          id: 'i1',
          name: 'RLFA',
          alarmierung: '2026-08-03T10:05:00.000Z',
          abruecken: '2026-08-03T11:30:00.000Z',
        },
        {
          id: 'i2',
          name: 'MZB',
          alarmierung: '2026-08-03T10:02:00.000Z',
          abruecken: '2026-08-03T12:40:00.000Z',
        },
      ],
      firecall,
      now,
    );

    expect(abfahrt).toBe('2026-08-03T10:02:00.000Z');
    expect(ankunft).toBe('2026-08-03T12:40:00.000Z');
  });

  it('fällt ohne Alarmierung auf den Einsatzzeitpunkt zurück', () => {
    const { abfahrt } = einsatzTimes(
      [{ id: 'i1', name: 'RLFA' }],
      firecall,
      now,
    );
    expect(abfahrt).toBe(firecall.date);
  });

  it('normalisiert Zeitstempel, die nicht ISO-8601 sind', () => {
    // So schreibt der KI-Assistent `alarmierung` in die Fzg-Items; Importe
    // liefern deutsches Datumsformat. Ohne Normalisierung stünde das Feld im
    // Formular leer und die Validierung meldete einen ungültigen Wert.
    const { abfahrt } = einsatzTimes(
      [
        { id: 'i1', name: 'RLFA 3000/100', alarmierung: '10:05' },
        { id: 'i2', name: 'MZB', alarmierung: '03.08.2026 10:07:00' },
      ],
      firecall,
      now,
    );

    const parsed = new Date(abfahrt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getHours()).toBe(10);
    expect(parsed.getMinutes()).toBe(5);
  });

  it('nutzt jetzt als Ankunft, wenn der Einsatz noch läuft', () => {
    const { ankunft } = einsatzTimes(
      [{ id: 'i1', name: 'RLFA 3000/100' }],
      { ...firecall, abruecken: undefined },
      now,
    );
    expect(ankunft).toBe(now);
  });

  it('ignoriert eine unlesbare Alarmierung', () => {
    const { abfahrt } = einsatzTimes(
      [{ id: 'i1', name: 'RLFA', alarmierung: 'sofort' }],
      firecall,
      now,
    );
    expect(abfahrt).toBe(firecall.date);
  });
});

describe('kmPreview', () => {
  const kmDefs = VEHICLE_PRESETS.fahrzeug;

  it('zeigt einen eingetragenen Endstand ohne Herkunftsvermerk', () => {
    expect(
      kmPreview(kmDefs, { km: { start: 1000, end: 1042 } }, ESTIMATE_24),
    ).toEqual({ start: 1000, end: 1042 });
  });

  it('rechnet den Endstand aus der Strecke und vermerkt die Herkunft', () => {
    expect(kmPreview(kmDefs, { km: { start: 1000 } }, ESTIMATE_24)).toEqual({
      start: 1000,
      end: 1024,
      derived: 'estimate',
    });
  });

  it('lässt den Endstand offen, wenn keine Strecke bekannt ist', () => {
    expect(kmPreview(kmDefs, { km: { start: 1000 } })).toEqual({ start: 1000 });
  });

  it('lässt den Endstand offen, wenn der Startstand fehlt', () => {
    expect(kmPreview(kmDefs, {}, ESTIMATE_24)).toEqual({ start: undefined });
  });

  it('liefert nichts für ein Fahrzeug ohne Kilometerzähler', () => {
    expect(
      kmPreview(VEHICLE_PRESETS.boot, { betriebsstundenBb: { start: 20 } }, ESTIMATE_24),
    ).toBeUndefined();
  });
});

describe('buildEinsatzRows — gemeinsame Zeiten', () => {
  it('setzt bei allen Zeilen dieselben Zeiten', () => {
    const rows = buildEinsatzRows(
      {
        fzgItems: [
          // Beide tragen eigene Zeiten in der Quelle — die Sammelerfassung
          // führt sie bewusst nicht mehr je Zeile, sondern einmal im Kopfblock.
          { id: 'i1', name: 'RLFA 3000/100', alarmierung: '10:05' },
          { id: 'i2', name: 'MZB', alarmierung: '10:42' },
        ],
        crew: [],
        vehicles: [vehicle, boot],
        persons: [],
        entries: [],
        firecall,
      },
      TIMES,
    );

    expect(rows.map((r) => r.abfahrt)).toEqual([TIMES.abfahrt, TIMES.abfahrt]);
    expect(rows.map((r) => r.ankunft)).toEqual([TIMES.ankunft, TIMES.ankunft]);
  });
});

describe('partitionEinsatzRows — automatische Endstände', () => {
  const kmVehicle: FahrtenbuchVehicle = {
    id: 'gv1',
    name: 'RLFA',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: [],
    lastCounters: { km: 1000 },
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  };

  const kmRow: EinsatzRow = {
    key: 'i1',
    sourceName: 'RLFA',
    vehicleId: 'gv1',
    vehicleName: 'RLFA',
    driverName: 'Max Muster',
    abfahrt: '2026-08-04T09:00:00.000Z',
    ankunft: '2026-08-04T09:45:00.000Z',
    counters: { km: { start: 1000 } },
  };

  it('hält eine Zeile ohne Endstand für speicherbar, wenn eine Schätzung vorliegt', () => {
    const result = partitionEinsatzRows([kmRow], [kmVehicle], 'Brand', ESTIMATE_24);
    expect(result.ready).toHaveLength(1);
    expect(result.incomplete).toHaveLength(0);
  });

  it('schickt den Endstand nicht mit — den setzt der Server', () => {
    const result = partitionEinsatzRows([kmRow], [kmVehicle], 'Brand', ESTIMATE_24);
    expect(result.ready[0].counters.km).toEqual({ start: 1000 });
  });

  it('lässt einen selbst eingetragenen Endstand unangetastet', () => {
    const result = partitionEinsatzRows(
      [{ ...kmRow, counters: { km: { start: 1000, end: 1042 } } }],
      [kmVehicle],
      'Brand',
      ESTIMATE_24,
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].counters.km).toEqual({ start: 1000, end: 1042 });
  });

  it('bleibt auch ohne Schätzung speicherbar', () => {
    // Ein fehlender Kilometerstand hält die Fahrt nicht auf: Der Eintrag
    // entsteht ohne Kilometer und wird nachgetragen. Eine gar nicht erfasste
    // Fahrt wäre eine Lücke im Nachweis und schwerer zu heilen.
    const result = partitionEinsatzRows([kmRow], [kmVehicle], 'Brand');
    expect(result.ready).toHaveLength(1);
    expect(result.incomplete).toHaveLength(0);
  });

  it('bleibt speicherbar, wenn auch der Startstand fehlt', () => {
    const result = partitionEinsatzRows(
      [{ ...kmRow, counters: {} }],
      [kmVehicle],
      'Brand',
      ESTIMATE_24,
    );
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].counters.km).toBeUndefined();
  });

  it('lehnt einen Endstand unter dem Startstand weiterhin ab', () => {
    // Gelockert ist nur die Pflicht, nicht die Plausibilität: Ein Endstand
    // unter dem Startstand ist kein fehlender, sondern ein falscher Wert.
    const result = partitionEinsatzRows(
      [{ ...kmRow, counters: { km: { start: 1000, end: 900 } } }],
      [kmVehicle],
      'Brand',
      ESTIMATE_24,
    );
    expect(result.ready).toHaveLength(0);
    expect(result.incomplete[0].errors).toContain('counterEndBeforeStart:km');
  });

  it('hält ein Boot mit bekannten Ständen für speicherbar', () => {
    const bootVehicle: FahrtenbuchVehicle = {
      ...kmVehicle,
      id: 'gv2',
      name: 'MZB',
      counters: VEHICLE_PRESETS.boot,
      lastCounters: { betriebsstundenBb: 20, lenzpumpeStb: 5, lenzpumpeBb: 7 },
    };
    const result = partitionEinsatzRows(
      [
        {
          ...kmRow,
          key: 'i2',
          vehicleId: 'gv2',
          vehicleName: 'MZB',
          counters: { betriebsstundenBb: { start: 20 } },
        },
      ],
      [bootVehicle],
      'Brand',
      ESTIMATE_24,
    );
    expect(result.ready).toHaveLength(1);
  });
});
