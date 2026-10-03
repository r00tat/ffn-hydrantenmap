import { describe, expect, it } from 'vitest';
import type { AtemschutzTrupp } from '../../../common/atemschutz';
import type { FahrtenbuchEntry } from '../../../common/fahrtenbuch';
import type {
  FcMarker,
  Firecall,
  FirecallItem,
  FirecallLayer,
  Spectrum,
} from '../../firebase/firestore';
import {
  buildAtemschutzText,
  buildAusgabeRows,
  buildGeraeteRows,
  buildTruppProtokoll,
  truppProtokollText,
  buildFahrtenRows,
  buildMeasurementTables,
  buildSpectrumRows,
  buildTruppRows,
  collectAttachments,
  measurementCsv,
  measurementSummary,
} from './sybosExtras';

const truppBase = {
  status: 'zurueck',
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
} as const;

const truppB: AtemschutzTrupp = {
  ...truppBase,
  id: 't2',
  truppKey: 'b',
  laufendeNummer: 1,
  feuerwehr: 'Weiden',
  truppName: 'Trupp 1',
  mitglieder: ['Anna Muster', 'Bernd Beispiel'],
  bereitSeit: '2026-03-01T14:05:00',
};

const truppA1: AtemschutzTrupp = {
  ...truppBase,
  id: 't1',
  truppKey: 'a',
  laufendeNummer: 1,
  feuerwehr: 'Neusiedl',
  truppName: 'Trupp 2',
  mitglieder: ['Max Muster', 'Erika Beispiel'],
  bereitSeit: '2026-03-01T14:00:00',
  entsendetAn: 'TLFA 4000',
  auftrag: 'Brandbekämpfung',
  einsatzziel: 'Keller',
  abmarschZeit: '2026-03-01T14:10:00',
  druckAbmarsch: 300,
  rueckkehrZeit: '2026-03-01T14:35:00',
  druckRueckkehr: 120,
};

const truppA2: AtemschutzTrupp = {
  ...truppA1,
  id: 't3',
  laufendeNummer: 2,
  bereitSeit: '2026-03-01T15:00:00',
  abmarschZeit: '2026-03-01T15:05:00',
  rueckkehrZeit: undefined,
  druckRueckkehr: undefined,
};

describe('buildTruppRows', () => {
  it('sortiert alphabetisch nach Trupp und dann nach Bereitstellung', () => {
    const rows = buildTruppRows([truppA2, truppB, truppA1]);
    expect(rows.map((r) => r.trupp)).toEqual([
      'Neusiedl Trupp 2',
      'Neusiedl Trupp 2 (2.)',
      'Weiden Trupp 1',
    ]);
  });

  it('fasst Auftrag, Zeiten und Drücke zusammen', () => {
    const [row] = buildTruppRows([truppA1]);
    expect(row.mitglieder).toBe('Max Muster, Erika Beispiel');
    expect(row.einheit).toBe('TLFA 4000');
    expect(row.auftrag).toBe('Brandbekämpfung – Keller');
    expect(row.abmarsch).toBe('01.03.2026 14:10');
    expect(row.rueckkehr).toBe('01.03.2026 14:35');
    expect(row.dauer).toBe('25 min');
    expect(row.druck).toBe('300 → 120 bar');
  });

  it('nimmt den Abmarschdruck allein, solange der Trupp draußen ist', () => {
    const rows = buildTruppRows([truppA2]);
    expect(rows[0].druck).toBe('300 bar');
    expect(rows[0].dauer).toBe('');
  });
});

describe('buildAtemschutzText', () => {
  it('schreibt eine Zeile je Einsatz unter Atemschutz, ohne Namen', () => {
    const text = buildAtemschutzText(buildTruppRows([truppA1, truppB]));
    expect(text).toBe(
      'Neusiedl Trupp 2 (2 Personen) – Brandbekämpfung – Keller, ' +
        'Abmarsch 01.03.2026 14:10, Rückkehr 01.03.2026 14:35, 25 min, 300 → 120 bar',
    );
    expect(text).not.toContain('Muster');
  });
});

const layer: FirecallLayer = {
  id: 'l1',
  type: 'layer',
  name: 'Strahlenmessung',
  dataSchema: [
    { key: 'dl', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' },
    { key: 'kontaminiert', label: 'Kontaminiert', unit: '', type: 'boolean' },
    {
      key: 'dosis',
      label: 'Dosis',
      unit: 'µSv',
      type: 'computed',
      formula: 'dl * 2',
    },
  ],
};

const point = (id: string, datum: string, dl: number): FirecallItem => ({
  id,
  type: 'marker',
  name: `Messpunkt ${id}`,
  layer: 'l1',
  datum,
  fieldData: { dl, kontaminiert: dl > 1 },
});

describe('buildMeasurementTables', () => {
  const items = [
    point('p2', '2026-03-01T14:20:00', 2.5),
    point('p1', '2026-03-01T14:10:00', 0.12),
    { id: 'x', type: 'marker', name: 'ohne Ebene', fieldData: { dl: 1 } },
  ];

  it('baut je Ebene mit Datenfeldern eine Tabelle, nach Zeit sortiert', () => {
    const [table] = buildMeasurementTables(items, [layer], {
      p1: { dosis: 0.24 },
      p2: { dosis: 5 },
    });
    expect(table.layerName).toBe('Strahlenmessung');
    expect(table.columns.map((c) => c.header)).toEqual([
      'Dosisleistung (µSv/h)',
      'Kontaminiert',
      'Dosis (µSv)',
    ]);
    expect(table.rows.map((r) => r.name)).toEqual(['Messpunkt p1', 'Messpunkt p2']);
    expect(table.rows[0].time).toBe('01.03.2026 14:10');
    expect(table.rows[0].values).toEqual(['0,12', 'nein', '0,24']);
    expect(table.rows[1].values).toEqual(['2,5', 'ja', '5']);
  });

  it('lässt Ebenen ohne Messwerte weg', () => {
    expect(buildMeasurementTables([], [layer], {})).toEqual([]);
  });

  it('fasst Zahlenfelder als Anzahl und Spanne zusammen', () => {
    const [table] = buildMeasurementTables(items, [layer], {});
    expect(measurementSummary(table)).toBe(
      'Strahlenmessung: 2 Messpunkte; Dosisleistung (µSv/h) 0,12–2,5',
    );
  });

  it('exportiert als CSV mit Semikolon', () => {
    const [table] = buildMeasurementTables(items, [layer], {});
    expect(measurementCsv(table).split('\r\n')).toEqual([
      'Messpunkt;Zeit;Dosisleistung (µSv/h);Kontaminiert;Dosis (µSv)',
      'Messpunkt p1;01.03.2026 14:10;0,12;nein;',
      'Messpunkt p2;01.03.2026 14:20;2,5;ja;',
    ]);
  });
});

describe('measurementCsv – Formeln', () => {
  it('entschärft Formeln in Freitext, lässt negative Zahlen stehen', () => {
    const [table] = buildMeasurementTables(
      [
        {
          id: 'p',
          type: 'marker',
          name: '=HYPERLINK("x")',
          layer: 'l1',
          fieldData: { dl: -0.5 },
        },
      ],
      [layer],
      {},
    );
    const line = measurementCsv(table).split('\r\n')[1];
    expect(line).toBe(`"'=HYPERLINK(""x"")";;-0,5;;`);
  });
});

describe('buildSpectrumRows', () => {
  it('nimmt das manuell bestimmte Nuklid vor dem erkannten', () => {
    const spectrum = {
      id: 's1',
      type: 'spectrum',
      name: 'Probe 1',
      sampleName: 'Probe Keller',
      deviceName: 'RC-102',
      measurementTime: 300,
      liveTime: 298,
      startTime: '2026-03-01T14:30:00',
      endTime: '2026-03-01T14:35:00',
      coefficients: [],
      counts: [],
      matchedNuclide: 'Cs-137',
      matchedConfidence: 0.87,
    } as Spectrum;
    expect(buildSpectrumRows([spectrum])).toEqual([
      {
        probe: 'Probe Keller',
        geraet: 'RC-102',
        nuklid: 'Cs-137 (87 %)',
        beginn: '01.03.2026 14:30',
        dauer: '5 min',
        beschreibung: '',
      },
    ]);
    expect(buildSpectrumRows([{ ...spectrum, manualNuclide: 'Co-60' } as Spectrum])[0].nuklid).toBe(
      'Co-60',
    );
  });
});

describe('buildFahrtenRows', () => {
  it('sortiert nach Fahrzeug und rechnet die gefahrenen Kilometer', () => {
    const base = {
      zweck: 'einsatz',
      ziel: 'Neusiedl',
      group: 'g',
      deleted: false,
      createdAt: '',
      createdBy: '',
      createdByName: '',
      updatedAt: '',
      updatedBy: '',
    } as const;
    const rows = buildFahrtenRows([
      {
        ...base,
        vehicleId: 'v2',
        vehicleName: 'TLFA 4000',
        driverName: 'Max Muster',
        abfahrt: '2026-03-01T14:03:00',
        ankunft: '2026-03-01T15:40:00',
        counters: { km: { start: 1000, end: 1012, diff: 12 } },
      },
      {
        ...base,
        vehicleId: 'v1',
        vehicleName: 'KDOF',
        driverName: 'Erika Beispiel',
        coDrivers: [{ name: 'Hans Probe' }],
        abfahrt: '2026-03-01T14:04:00',
        ankunft: '2026-03-01T15:00:00',
        counters: {},
      },
    ] as unknown as FahrtenbuchEntry[]);
    expect(rows).toEqual([
      {
        fahrzeug: 'KDOF',
        fahrer: 'Erika Beispiel, Hans Probe',
        abfahrt: '01.03.2026 14:04',
        ankunft: '01.03.2026 15:00',
        km: '',
        ziel: 'Neusiedl',
      },
      {
        fahrzeug: 'TLFA 4000',
        fahrer: 'Max Muster',
        abfahrt: '01.03.2026 14:03',
        ankunft: '01.03.2026 15:40',
        km: '12',
        ziel: 'Neusiedl',
      },
    ]);
  });
});

describe('collectAttachments', () => {
  it('sammelt Anhänge von Einsatz und Elementen mit lesbarem Namen', () => {
    const firecall: Firecall = {
      name: 'Einsatz',
      attachments: ['gs://bucket/call/fc1/0f8fad5b-d9cb-469f-a165-70867728950e-Lageplan.pdf'],
    };
    const marker: FcMarker = {
      id: 'm1',
      type: 'marker',
      name: 'Gefahrgut',
      attachments: ['gs://bucket/call/fc1/foto.jpg', { name: 'inline.txt', data: 'aGFsbG8=' }],
    };
    expect(collectAttachments(firecall, [marker])).toEqual([
      {
        url: 'gs://bucket/call/fc1/0f8fad5b-d9cb-469f-a165-70867728950e-Lageplan.pdf',
        name: 'Lageplan.pdf',
        source: '',
      },
      {
        url: 'gs://bucket/call/fc1/foto.jpg',
        name: 'foto.jpg',
        source: 'Gefahrgut',
      },
    ]);
  });
});

describe('buildTruppProtokoll', () => {
  const trupp: AtemschutzTrupp = {
    ...truppA1,
    uebergabeZeit: '2026-03-01T14:06:00',
    druckUebergabe: 300,
    ueberwachtVon: 'Maschinist TLFA',
    ueberwachungSeit: '2026-03-01T14:07:00',
    ueberwachungBis: '2026-03-01T14:40:00',
    paTyp: 'standard300',
    abfragen: [
      {
        zeitpunkt: '2026-03-01T14:25:00',
        druck: 160,
        rueckzug: true,
      },
      { zeitpunkt: '2026-03-01T14:15:00', druck: 240, amZiel: true },
      { zeitpunkt: '2026-03-01T14:20:00', druck: 200 },
      {
        zeitpunkt: '2026-03-01T14:22:00',
        bemerkung: 'Starke Verrauchung',
      },
      { zeitpunkt: '2026-03-01T14:23:00', druck: 180, amZiel: true },
    ],
    warnungen: { drittel: '2026-03-01T14:18:00' },
    bemerkung: 'Flasche 2 undicht',
  };

  it('listet Kopfdaten des Trupps', () => {
    const p = buildTruppProtokoll(trupp);
    expect(p.titel).toBe('Neusiedl Trupp 2');
    expect(Object.fromEntries(p.kopf.map((k) => [k.label, k.value]))).toEqual({
      Mitglieder: 'Max Muster, Erika Beispiel',
      Einheit: 'TLFA 4000',
      Auftrag: 'Brandbekämpfung',
      Einsatzziel: 'Keller',
      'Überwacht von': 'Maschinist TLFA',
      Zeitkontrolle: '01.03.2026 14:07 – 01.03.2026 14:40',
      Gerätesatz: 'Standard-PA, 1 × 6 l / 300 bar',
      Bemerkung: 'Flasche 2 undicht',
    });
  });

  it('ordnet alle Ereignisse und Druckabfragen nach Zeit', () => {
    const p = buildTruppProtokoll(trupp);
    expect(p.ereignisse.map((e) => [e.zeit, e.ereignis, e.druck, e.bemerkung])).toEqual([
      ['01.03.2026 14:00', 'Bereitgestellt', '', ''],
      ['01.03.2026 14:06', 'Übergabe an Einheit', '300 bar', ''],
      ['01.03.2026 14:07', 'Zeitkontrolle übernommen', '', 'Maschinist TLFA'],
      ['01.03.2026 14:10', 'Abmarsch', '300 bar', ''],
      ['01.03.2026 14:15', 'Am Einsatzziel', '240 bar', ''],
      ['01.03.2026 14:18', 'Warnung: 1/3 der Einsatzzeit', '', ''],
      ['01.03.2026 14:20', 'Druckabfrage', '200 bar', ''],
      ['01.03.2026 14:22', 'Statusmeldung', '', 'Starke Verrauchung'],
      // Nur die erste Zielmeldung ist die Ankunft.
      ['01.03.2026 14:23', 'Druckabfrage', '180 bar', ''],
      ['01.03.2026 14:25', 'Rückzug angetreten', '160 bar', ''],
      ['01.03.2026 14:35', 'Rückkehr', '120 bar', ''],
      ['01.03.2026 14:40', 'Zeitkontrolle beendet', '', ''],
    ]);
  });

  it('gibt das Protokoll als Text aus', () => {
    const text = truppProtokollText(buildTruppProtokoll(trupp));
    expect(text.split('\n').slice(0, 3)).toEqual([
      'Neusiedl Trupp 2',
      'Mitglieder: Max Muster, Erika Beispiel',
      'Einheit: TLFA 4000',
    ]);
    expect(text).toContain('01.03.2026 14:22 Statusmeldung – Starke Verrauchung');
    expect(text).toContain('01.03.2026 14:25 Rückzug angetreten, 160 bar');
  });
});

describe('buildGeraeteRows', () => {
  it('listet die Geräte je Trupp, nach Trupp und Träger sortiert', () => {
    const rows = buildGeraeteRows([
      {
        ...truppB,
        truppGeraete: [
          {
            typ: 'flasche',
            bezeichnung: 'Flasche 6 l',
            kennung: 'AF-2.16.19',
            person: 'Bernd Beispiel',
          },
          { typ: 'maske', bezeichnung: 'Maske M3', person: 'Anna Muster' },
        ],
      },
      {
        ...truppA1,
        truppGeraete: [{ typ: 'pressluftatmer', bezeichnung: 'PA 7', kennung: '1234' }],
      },
    ]);
    expect(rows).toEqual([
      {
        trupp: 'Neusiedl Trupp 2',
        person: '',
        typ: 'Pressluftatmer',
        bezeichnung: 'PA 7',
        kennung: '1234',
      },
      {
        trupp: 'Weiden Trupp 1',
        person: 'Anna Muster',
        typ: 'Atemmaske',
        bezeichnung: 'Maske M3',
        kennung: '',
      },
      {
        trupp: 'Weiden Trupp 1',
        person: 'Bernd Beispiel',
        typ: 'Atemluftflasche',
        bezeichnung: 'Flasche 6 l',
        kennung: 'AF-2.16.19',
      },
    ]);
  });
});

describe('buildAusgabeRows', () => {
  it('listet die Ausgaben am Sammelplatz alphabetisch nach Gerät', () => {
    const base = { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };
    expect(
      buildAusgabeRows([
        {
          ...base,
          geraetId: 'g2',
          geraetName: 'PA 9',
          status: 'zurueck',
          ausgegebenAn: 'Weiden Trupp 1',
          ausgabeZeit: '2026-03-01T14:05:00',
          ruecknahmeZeit: '2026-03-01T15:00:00',
        },
        { ...base, geraetId: 'g1', geraetName: 'PA 10', status: 'ausgegeben' },
      ]),
    ).toEqual([
      {
        geraet: 'PA 9',
        an: 'Weiden Trupp 1',
        status: 'Zurück',
        ausgabe: '01.03.2026 14:05',
        ruecknahme: '01.03.2026 15:00',
      },
      { geraet: 'PA 10', an: '', status: 'Ausgegeben', ausgabe: '', ruecknahme: '' },
    ]);
  });
});
