import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import {
  buildFahrtenbuchExport,
  chunkFahrtenbuchExport,
  exportFileName,
  formatDayLabel,
  zonedDayRange,
  type ExportSection,
  type ExportTranslate,
  type FahrtenbuchExportModel,
} from './fahrtenbuchExportModel';

/** Gibt Schlüssel und Werte wörtlich zurück — die Zuordnung ist damit prüfbar. */
const t: ExportTranslate = (key, values) =>
  values
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key;

function vehicle(overrides: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'RLFA 2000',
    kennzeichen: 'FW-100ND',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel'],
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

function entry(overrides: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'RLFA 2000',
    driverName: 'Markus Scharinger',
    zweck: 'einsatz',
    ziel: 'N/S Ölspur',
    // 08.06.2025 08:45 - 10:00 Ortszeit Wien (UTC+2)
    abfahrt: '2025-06-08T06:45:00.000Z',
    ankunft: '2025-06-08T08:00:00.000Z',
    counters: { km: { start: 14664, end: 14672, diff: 8 } },
    group: 'ffnd',
    deleted: false,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const vienna = 'Europe/Vienna';

const baseOptions = {
  vehicles: [vehicle()],
  entries: [entry()],
  from: '2025-06-01',
  to: '2025-06-30',
  timeZone: vienna,
};

describe('zonedDayRange', () => {
  it('umfasst den ganzen ersten und letzten Tag in der Zeitzone', () => {
    expect(zonedDayRange('2025-06-01', '2025-06-30', vienna)).toEqual({
      fromIso: '2025-05-31T22:00:00.000Z',
      toIso: '2025-06-30T21:59:59.999Z',
    });
  });

  it('berücksichtigt den Winterzeit-Offset', () => {
    expect(zonedDayRange('2025-01-15', '2025-01-15', vienna)).toEqual({
      fromIso: '2025-01-14T23:00:00.000Z',
      toIso: '2025-01-15T22:59:59.999Z',
    });
  });

  it('fällt bei unbekannter Zeitzone auf UTC zurück', () => {
    expect(zonedDayRange('2025-01-15', '2025-01-15', 'Nicht/Existent')).toEqual({
      fromIso: '2025-01-15T00:00:00.000Z',
      toIso: '2025-01-15T23:59:59.999Z',
    });
  });
});

describe('formatDayLabel', () => {
  it('formatiert einen Tag ohne Zeitzonenrechnung', () => {
    expect(formatDayLabel('2025-06-01')).toBe('01.06.2025');
  });
});

describe('exportFileName', () => {
  it('nennt Zeitraum und Gruppe und ersetzt Sonderzeichen', () => {
    expect(exportFileName('2025-06-01', '2025-06-30', 'FF Neusiedl/See')).toBe(
      'Fahrtenbuch_FF_Neusiedl_See_2025-06-01_2025-06-30.pdf',
    );
  });

  it('kommt ohne Gruppenname aus', () => {
    expect(exportFileName('2025-06-01', '2025-06-30')).toBe(
      'Fahrtenbuch_2025-06-01_2025-06-30.pdf',
    );
  });
});

describe('buildFahrtenbuchExport', () => {
  it('setzt Titel, Zeitraum und Fahrzeugüberschrift', () => {
    const model = buildFahrtenbuchExport(
      { ...baseOptions, groupName: 'FF Neusiedl' },
      t,
    );

    expect(model.title).toBe('export.documentTitleGroup(group=FF Neusiedl)');
    expect(model.period).toBe('export.period(from=01.06.2025,to=30.06.2025)');
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].heading).toBe('RLFA 2000 (FW-100ND)');
  });

  it('baut die Spalten eines Kilometerfahrzeugs in der Reihenfolge des Vorbilds', () => {
    const model = buildFahrtenbuchExport(baseOptions, t);

    expect(model.sections[0].columns.map((c) => c.key)).toEqual([
      'datum',
      'zeit',
      'fahrer',
      'grund',
      'ziel',
      'counter:km:start',
      'counter:km:end',
      'counter:km:diff',
      'fuel:diesel',
      'notizen',
    ]);
    expect(
      model.sections[0].columns.find((c) => c.key === 'counter:km:start')?.label,
    ).toBe('export.columns.counterStart(unit=km)');
  });

  it('formatiert Datum, Zeit und Werte einer Fahrt', () => {
    const model = buildFahrtenbuchExport(baseOptions, t);

    expect(model.sections[0].rows).toHaveLength(1);
    expect(model.sections[0].rows[0].cells).toEqual([
      '08.06.2025',
      '08:45 - 10:00',
      'Markus Scharinger',
      'zwecke.einsatz',
      'N/S Ölspur',
      '14664',
      '14672',
      '8',
      '',
      '',
    ]);
  });

  it('sortiert die Fahrten aufsteigend nach Abfahrt', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({ id: 'b', abfahrt: '2025-06-10T06:00:00.000Z' }),
          entry({ id: 'a', abfahrt: '2025-06-02T06:00:00.000Z' }),
        ],
      },
      t,
    );

    expect(model.sections[0].rows.map((r) => r.cells[0])).toEqual([
      '02.06.2025',
      '10.06.2025',
    ]);
  });

  it('weist eine Fahrt über Mitternacht mit dem Ankunftstag aus', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({
            abfahrt: '2025-06-08T21:50:00.000Z',
            ankunft: '2025-06-08T23:30:00.000Z',
          }),
        ],
      },
      t,
    );

    expect(model.sections[0].rows[0].cells[1]).toBe('23:50 - 09.06. 01:30');
  });

  it('rechnet die Differenz neu und rundet Fließkommareste weg', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        vehicles: [
          vehicle({ counters: VEHICLE_PRESETS.boot, fuelTypes: ['benzin'] }),
        ],
        entries: [
          entry({
            counters: {
              betriebsstundenBb: { start: 1245, end: 1246.1, diff: 99 },
              lenzpumpeStb: { end: 39 },
              lenzpumpeBb: { end: 39 },
            },
          }),
        ],
      },
      t,
    );

    const cells = model.sections[0].rows[0].cells;
    expect(model.sections[0].columns.map((c) => c.key)).toEqual([
      'datum',
      'zeit',
      'fahrer',
      'grund',
      'ziel',
      'counter:betriebsstundenBb:start',
      'counter:betriebsstundenBb:end',
      'counter:betriebsstundenBb:diff',
      'counter:lenzpumpeStb:end',
      'counter:lenzpumpeBb:end',
      'fuel:benzin',
      'notizen',
    ]);
    expect(cells.slice(5, 10)).toEqual(['1245', '1246,1', '1,1', '39', '39']);
  });

  it('beschriftet die Zähler bei mehreren Start/Ende-Zählern mit ihrem Namen', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        vehicles: [
          vehicle({
            counters: [
              ...VEHICLE_PRESETS.fahrzeug,
              {
                id: 'pumpe',
                label: 'Pumpenstunden',
                unit: 'h',
                mode: 'startEnd',
                changeWarning: 'decrease',
                required: false,
              },
            ],
          }),
        ],
      },
      t,
    );

    const labels = model.sections[0].columns
      .filter((c) => c.key.startsWith('counter:'))
      .map((c) => c.label);
    expect(labels).toEqual([
      'export.columns.counterStartLabeled(label=counters.km)',
      'export.columns.counterEndLabeled(label=counters.km)',
      'export.columns.counterDiffLabeled(label=counters.km)',
      'export.columns.counterStartLabeled(label=Pumpenstunden)',
      'export.columns.counterEndLabeled(label=Pumpenstunden)',
      'export.columns.counterDiffLabeled(label=Pumpenstunden)',
    ]);
  });

  it('kennzeichnet geschätzte Endstände und ergänzt die Legende', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({
            counters: { km: { start: 14664, end: 14672, diff: 8 } },
            counterSources: { km: 'estimate' },
          }),
        ],
      },
      t,
    );

    expect(model.sections[0].rows[0].cells[6]).toBe(
      'export.estimatePrefix(value=14672)',
    );
    expect(model.sections[0].rows[0].cells[7]).toBe(
      'export.estimatePrefix(value=8)',
    );
    expect(model.legend).toBe('export.estimateLegend');
    expect(model.sections[0].hasEstimates).toBe(true);
  });

  it('lässt die Legende weg, wenn nichts geschätzt ist', () => {
    const model = buildFahrtenbuchExport(baseOptions, t);
    expect(model.legend).toBeUndefined();
    expect(model.sections[0].hasEstimates).toBeUndefined();
  });

  it('trägt Betriebsmittel, Hinweise und Defekt in die Zeile', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({
            betriebsmittel: { diesel: 42.5, adblue: 0 },
            hinweise: 'Scheibenwischer erneuert',
            defekt: true,
          }),
        ],
      },
      t,
    );

    const cells = model.sections[0].rows[0].cells;
    expect(cells[8]).toBe('42,5');
    expect(cells[9]).toBe('Scheibenwischer erneuert — defectReported');
    expect(model.sections[0].rows[0].defekt).toBe(true);
  });

  it('hängt die Mangelbeschreibung an den Defekt-Vermerk', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({
            hinweise: 'Scheibenwischer erneuert',
            defekt: true,
            mangel: 'Bremse zieht nach links',
          }),
        ],
      },
      t,
    );

    expect(model.sections[0].rows[0].cells[9]).toBe(
      'Scheibenwischer erneuert — defectReported: Bremse zieht nach links',
    );
  });

  it('ergänzt eine Betriebsmittelspalte, die nur in den Fahrten vorkommt', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        vehicles: [vehicle({ fuelTypes: [] })],
        entries: [entry({ betriebsmittel: { benzin: 5 } })],
      },
      t,
    );

    expect(
      model.sections[0].columns.filter((c) => c.key.startsWith('fuel:')),
    ).toHaveLength(1);
    expect(model.sections[0].columns.find((c) => c.key === 'fuel:benzin')).toBeDefined();
  });

  it('nimmt einen Zähler auf, den nur die Fahrt kennt', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        vehicles: [vehicle({ counters: [] })],
        entries: [entry({ counters: { km: { start: 10, end: 12, diff: 2 } } })],
      },
      t,
    );

    const keys = model.sections[0].columns.map((c) => c.key);
    expect(keys).toContain('counter:km:start');
    expect(keys).toContain('counter:km:diff');
  });

  it('nimmt den Einsatznamen als Strecke, wenn kein Ziel erfasst ist', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [entry({ ziel: '', firecallName: 'B2 Wohnhausbrand' })],
      },
      t,
    );

    expect(model.sections[0].rows[0].cells[4]).toBe('B2 Wohnhausbrand');
  });

  it('führt jedes gewählte Fahrzeug auf, auch ohne Fahrten im Zeitraum', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        vehicles: [vehicle(), vehicle({ id: 'v2', name: 'MTF', kennzeichen: undefined })],
      },
      t,
    );

    expect(model.sections.map((s) => s.heading)).toEqual([
      'RLFA 2000 (FW-100ND)',
      'MTF',
    ]);
    expect(model.sections[1].rows).toHaveLength(0);
    expect(model.sections[1].emptyText).toBe('export.noEntriesInPeriod');
  });

  it('ignoriert Fahrten fremder und gelöschter Einträge', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        entries: [
          entry({ id: 'other', vehicleId: 'v9' }),
          entry({ id: 'gone', deleted: true }),
          entry({ id: 'keep' }),
        ],
      },
      t,
    );

    expect(model.sections[0].rows).toHaveLength(1);
  });

  it('nennt Erstellungszeitpunkt und Ersteller im Fuß, wenn bekannt', () => {
    const model = buildFahrtenbuchExport(
      {
        ...baseOptions,
        generatedAt: '2025-07-01T10:30:00.000Z',
        generatedBy: 'Paul Wölfel',
      },
      t,
    );

    expect(model.footer).toBe(
      'export.generatedBy(date=01.07.2025 12:30,user=Paul Wölfel)',
    );
  });

  it('nennt nur den Zeitpunkt, wenn der Ersteller unbekannt ist', () => {
    const model = buildFahrtenbuchExport(
      { ...baseOptions, generatedAt: '2025-07-01T10:30:00.000Z' },
      t,
    );

    expect(model.footer).toBe('export.generated(date=01.07.2025 12:30)');
  });
});

describe('chunkFahrtenbuchExport', () => {
  function section(
    vehicleId: string,
    rowCount: number,
    overrides: Partial<ExportSection> = {},
  ): ExportSection {
    return {
      vehicleId,
      heading: `Fahrzeug ${vehicleId}`,
      columns: [{ key: 'datum', label: 'Datum', flex: 1 }],
      rows: Array.from({ length: rowCount }, (_, i) => ({
        cells: [`${vehicleId}-${i}`],
      })),
      ...overrides,
    };
  }

  function model(
    sections: ExportSection[],
    overrides: Partial<FahrtenbuchExportModel> = {},
  ): FahrtenbuchExportModel {
    return {
      title: 'Fahrtenbuch FFND',
      period: '01.01.2026 - 31.12.2026',
      footer: 'Erstellt am …',
      sections,
      ...overrides,
    };
  }

  it('gibt je Teilmodell genau einen Abschnitt aus', () => {
    const chunks = chunkFahrtenbuchExport(
      model([section('v1', 3), section('v2', 2)]),
      10,
    );

    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.sections.length)).toEqual([1, 1]);
    expect(chunks.map((c) => c.sections[0].vehicleId)).toEqual(['v1', 'v2']);
  });

  it('zerlegt einen Abschnitt in Teile der vorgegebenen Größe', () => {
    const chunks = chunkFahrtenbuchExport(model([section('v1', 250)]), 100);

    expect(chunks.map((c) => c.sections[0].rows.length)).toEqual([100, 100, 50]);
    // Keine Zeile darf verloren gehen oder doppelt vorkommen.
    expect(
      chunks.flatMap((c) => c.sections[0].rows.map((r) => r.cells[0])),
    ).toEqual(Array.from({ length: 250 }, (_, i) => `v1-${i}`));
  });

  it('behält Kopf, Zeitraum und Fuß in jedem Teil', () => {
    const chunks = chunkFahrtenbuchExport(model([section('v1', 250)]), 100);

    for (const chunk of chunks) {
      expect(chunk.title).toBe('Fahrtenbuch FFND');
      expect(chunk.period).toBe('01.01.2026 - 31.12.2026');
      expect(chunk.footer).toBe('Erstellt am …');
      expect(chunk.sections[0].heading).toBe('Fahrzeug v1');
      expect(chunk.sections[0].columns).toHaveLength(1);
    }
  });

  it('setzt die Legende nur unter den letzten Teil eines Abschnitts', () => {
    // Sonst stünde die Erklärung der „ca."-Werte mitten in der Tabelle
    // desselben Fahrzeugs — einmal je Teil.
    const chunks = chunkFahrtenbuchExport(
      model([section('v1', 250, { hasEstimates: true })], {
        legend: 'export.estimateLegend',
      }),
      100,
    );

    expect(chunks.map((c) => c.sections[0].hasEstimates)).toEqual([
      undefined,
      undefined,
      true,
    ]);
  });

  it('behält ein Fahrzeug ohne Fahrten als eigenen Teil', () => {
    // „keine Fahrten" ist eine Aussage; ein weggelassener Abschnitt sähe wie
    // ein vergessenes Fahrzeug aus.
    const chunks = chunkFahrtenbuchExport(
      model([section('v1', 0, { emptyText: 'export.noEntriesInPeriod' })]),
      100,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].sections[0].emptyText).toBe('export.noEntriesInPeriod');
    expect(chunks[0].sections[0].rows).toEqual([]);
  });

  it('behandelt eine unsinnige Teilgröße wie eine Zeile je Teil', () => {
    expect(chunkFahrtenbuchExport(model([section('v1', 3)]), 0)).toHaveLength(3);
  });
});
