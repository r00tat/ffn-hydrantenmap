import { describe, expect, it } from 'vitest';
import type {
  CounterDefinition,
  FahrtenbuchEntry,
  FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import type { Mangel } from '../../common/mangel';
import { buildWeeklyReportModel } from './weeklyReportModel';
import { resolveReportPeriod } from './weeklyReportPeriod';

const period = resolveReportPeriod({ year: 2026, week: 32 });

const KM: CounterDefinition = {
  id: 'km',
  label: 'Kilometerstand',
  labelKey: 'counters.km',
  unit: 'km',
  mode: 'startEnd',
  changeWarning: 'decrease',
  required: true,
};

const PUMPE: CounterDefinition = {
  id: 'lenzpumpeStb',
  label: 'Lenzpumpe Steuerbord',
  unit: 'h',
  mode: 'reading',
  changeWarning: 'anyChange',
  required: true,
};

function vehicle(over: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'KDTFA',
    kennzeichen: 'ND-1',
    active: true,
    counters: [KM],
    fuelTypes: ['diesel'],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

function entry(over: Partial<FahrtenbuchEntry> = {}): FahrtenbuchEntry {
  return {
    id: 'e1',
    vehicleId: 'v1',
    vehicleName: 'KDTFA',
    driverName: 'Lukas Fürst',
    zweck: 'einsatz',
    ziel: 'B1 - Flurbrand',
    abfahrt: '2026-08-05T17:00:00.000Z',
    ankunft: '2026-08-05T17:34:00.000Z',
    counters: { km: { start: 17552, end: 17557, diff: 5 } },
    group: 'ffnd',
    deleted: false,
    createdAt: '2026-08-05T17:40:00.000Z',
    createdBy: 'u1',
    createdByName: 'Lukas Fürst',
    updatedAt: '2026-08-05T17:40:00.000Z',
    updatedBy: 'u1',
    ...over,
  };
}

function build(
  over: Partial<Parameters<typeof buildWeeklyReportModel>[0]> = {},
) {
  return buildWeeklyReportModel({
    groupId: 'ffnd',
    groupName: 'FF Neusiedl am See',
    period,
    vehicles: [vehicle()],
    entries: [entry()],
    previousEntries: {},
    openMangel: [],
    ...over,
  });
}

describe('buildWeeklyReportModel', () => {
  it('baut eine Zeile je Fahrt mit Datum, Zeitspanne und Fahrer', () => {
    const model = build();
    expect(model.entryCount).toBe(1);
    const row = model.vehicles[0].rows[0];
    expect(row).toMatchObject({
      date: '05.08.2026',
      timeRange: '19:00 - 19:34',
      driver: 'Lukas Fürst',
      zweck: 'Einsatz',
      ziel: 'B1 - Flurbrand',
    });
    expect(row.counters[0]).toMatchObject({
      label: 'Kilometerstand',
      unit: 'km',
      start: 17552,
      end: 17557,
      diff: 5,
      estimated: false,
    });
  });

  it('setzt die Überschrift aus Name und Kennzeichen', () => {
    expect(build().vehicles[0].heading).toBe('KDTFA (ND-1)');
  });

  it('lässt das Kennzeichen weg, wenn keines gepflegt ist', () => {
    expect(
      build({ vehicles: [vehicle({ kennzeichen: undefined })] }).vehicles[0]
        .heading,
    ).toBe('KDTFA');
  });

  it('weist ein Fahrzeug ohne Fahrten mit leerer Zeilenliste aus', () => {
    const model = build({ entries: [] });
    expect(model.vehicles[0].rows).toEqual([]);
    expect(model.entryCount).toBe(0);
  });

  it('summiert die gefahrenen Werte je Zähler', () => {
    const model = build({
      entries: [
        entry(),
        entry({
          id: 'e2',
          abfahrt: '2026-08-06T05:00:00.000Z',
          ankunft: '2026-08-06T05:30:00.000Z',
          counters: { km: { start: 17557, end: 17591, diff: 34 } },
        }),
      ],
    });
    expect(model.vehicles[0].totals).toEqual([
      { label: 'Kilometerstand', unit: 'km', value: 39 },
    ]);
  });

  it('meldet eine Lücke gegen die letzte Fahrt vor dem Zeitraum', () => {
    // Der eigentliche Zweck des Berichts: Der Startstand der ersten Fahrt der
    // Woche liegt über dem Endstand der letzten Fahrt davor.
    const model = build({
      previousEntries: {
        v1: entry({
          id: 'e0',
          abfahrt: '2026-07-30T10:00:00.000Z',
          ankunft: '2026-07-30T11:00:00.000Z',
          counters: { km: { start: 17540, end: 17550, diff: 10 } },
        }),
      },
    });
    expect(model.hasWarnings).toBe(true);
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'gap',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17550,
        nextStart: 17552,
        date: '05.08.2026',
      },
    ]);
  });

  it('meldet eine Überlappung, wenn der Startstand unter dem Vorgänger liegt', () => {
    const model = build({
      previousEntries: {
        v1: entry({
          id: 'e0',
          abfahrt: '2026-07-30T10:00:00.000Z',
          counters: { km: { start: 17550, end: 17560, diff: 10 } },
        }),
      },
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'overlap',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17560,
        nextStart: 17552,
        date: '05.08.2026',
      },
    ]);
  });

  it('erkennt eine nachgetragene Fahrt an der passenden Kette', () => {
    // Der Fall aus der Praxis: Eine vergessene frühere Fahrt wird später
    // erfasst, Abfahrt und Ankunft sind der Erfassungszeitpunkt (gleiche
    // Uhrzeit, null Dauer). Ihr Endstand ist genau der Startstand der Fahrt
    // davor — die Zählerstände sind also in Ordnung, die Uhrzeit ist es nicht.
    const model = build({
      entries: [
        entry({ counters: { km: { start: 17552, end: 17585, diff: 33 } } }),
        entry({
          id: 'e2',
          abfahrt: '2026-08-05T17:34:00.000Z',
          ankunft: '2026-08-05T17:34:00.000Z',
          counters: { km: { start: 17542, end: 17552, diff: 10 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'outOfOrder',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17585,
        nextStart: 17542,
        date: '05.08.2026',
      },
    ]);
  });

  it('hängt der Fahrt nach einem Nachtrag keine erfundene Lücke an', () => {
    // Ein Nachtrag beschreibt einen früheren Abschnitt und verschiebt den
    // Stand des Fahrzeugs nicht. Würde der Vergleichswert auf sein Ende
    // fallen, bekäme die nächste Fahrt eine Lücke gemeldet, die es nicht gibt:
    // ein Erfassungsfehler, zwei Warnungen.
    const model = build({
      entries: [
        entry({ counters: { km: { start: 17552, end: 17585, diff: 33 } } }),
        entry({
          id: 'e2',
          abfahrt: '2026-08-05T17:34:00.000Z',
          ankunft: '2026-08-05T17:34:00.000Z',
          counters: { km: { start: 17542, end: 17552, diff: 10 } },
        }),
        entry({
          id: 'e3',
          abfahrt: '2026-08-06T08:00:00.000Z',
          ankunft: '2026-08-06T09:00:00.000Z',
          counters: { km: { start: 17585, end: 17600, diff: 15 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      expect.objectContaining({ kind: 'outOfOrder' }),
    ]);
  });

  it('bleibt bei einer echten Überlappung, wenn die Kette nicht passt', () => {
    // Startstand unter dem Vorgänger, Endstand aber nicht auf dessen
    // Startstand: Hier stimmt wirklich ein Zählerstand nicht.
    const model = build({
      entries: [
        entry({ counters: { km: { start: 17552, end: 17585, diff: 33 } } }),
        entry({
          id: 'e2',
          abfahrt: '2026-08-06T08:00:00.000Z',
          ankunft: '2026-08-06T09:00:00.000Z',
          counters: { km: { start: 17570, end: 17590, diff: 20 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'overlap',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17585,
        nextStart: 17570,
        date: '06.08.2026',
      },
    ]);
  });

  it('erkennt einen Nachtrag auch gegen die Fahrt vor dem Zeitraum', () => {
    const model = build({
      entries: [
        entry({
          abfahrt: '2026-08-03T08:00:00.000Z',
          ankunft: '2026-08-03T08:00:00.000Z',
          counters: { km: { start: 17530, end: 17540, diff: 10 } },
        }),
      ],
      previousEntries: {
        v1: entry({
          id: 'e0',
          abfahrt: '2026-07-30T10:00:00.000Z',
          counters: { km: { start: 17540, end: 17550, diff: 10 } },
        }),
      },
    });
    expect(model.vehicles[0].warnings).toEqual([
      expect.objectContaining({ kind: 'outOfOrder', previousEnd: 17550 }),
    ]);
  });

  it('prüft auch die Lücke zwischen zwei Fahrten derselben Woche', () => {
    const model = build({
      entries: [
        entry(),
        entry({
          id: 'e2',
          abfahrt: '2026-08-06T05:00:00.000Z',
          counters: { km: { start: 17600, end: 17610, diff: 10 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'gap',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17557,
        nextStart: 17600,
        date: '06.08.2026',
      },
    ]);
  });

  it('meldet einen Endstand unter dem Startstand', () => {
    const model = build({
      entries: [
        entry({ counters: { km: { start: 17557, end: 17552, diff: -5 } } }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'decrease',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        start: 17557,
        end: 17552,
        date: '05.08.2026',
      },
    ]);
  });

  it('warnt nicht ohne verwertbaren Vorgängerwert', () => {
    expect(build({ previousEntries: {} }).vehicles[0].warnings).toEqual([]);
    expect(
      build({ previousEntries: { v1: entry({ counters: {} }) } }).vehicles[0]
        .warnings,
    ).toEqual([]);
  });

  it('warnt nicht bei einem Ablesezähler', () => {
    // Bei einer Lenzpumpe ist ein Sprung zwischen zwei Fahrten der Sinn der
    // Sache und kein Erfassungsfehler.
    const model = build({
      vehicles: [vehicle({ counters: [PUMPE] })],
      entries: [entry({ counters: { lenzpumpeStb: { end: 120 } } })],
      previousEntries: {
        v1: entry({ id: 'e0', counters: { lenzpumpeStb: { end: 100 } } }),
      },
    });
    expect(model.vehicles[0].warnings).toEqual([]);
  });

  it('warnt nicht bei changeWarning none', () => {
    const model = build({
      vehicles: [vehicle({ counters: [{ ...KM, changeWarning: 'none' }] })],
      previousEntries: {
        v1: entry({
          id: 'e0',
          counters: { km: { start: 17540, end: 17550, diff: 10 } },
        }),
      },
    });
    expect(model.vehicles[0].warnings).toEqual([]);
  });

  it('meldet einen Pflichtzähler ohne Endstand', () => {
    const model = build({ entries: [entry({ counters: {} })] });
    expect(model.vehicles[0].warnings).toEqual([
      { kind: 'missing', counterLabel: 'Kilometerstand', date: '05.08.2026' },
    ]);
  });

  it('meldet einen fehlenden Pflichtwert auch bei einem Ablesezähler', () => {
    // Die Einschränkung auf startEnd gilt nur für den Vergleich zweier Stände.
    const model = build({
      vehicles: [vehicle({ counters: [PUMPE] })],
      entries: [entry({ counters: {} })],
    });
    expect(model.vehicles[0].warnings).toEqual([
      {
        kind: 'missing',
        counterLabel: 'Lenzpumpe Steuerbord',
        date: '05.08.2026',
      },
    ]);
  });

  it('meldet einen Pflichtzähler ohne Startstand', () => {
    const model = build({ entries: [entry({ counters: { km: { end: 17557 } } })] });
    expect(model.vehicles[0].warnings).toEqual([
      { kind: 'missing', counterLabel: 'Kilometerstand', date: '05.08.2026' },
    ]);
  });

  it('meldet einen fehlenden Wert nur einmal und nicht als Lücke der Folgefahrt', () => {
    // Die zweite Fahrt hat keinen Startstand, ihr Endstand ist bekannt. Die
    // dritte Fahrt knüpft daran an — sie darf keine Folgewarnung für einen
    // Fehler bekommen, der schon gemeldet ist.
    const model = build({
      entries: [
        entry(),
        entry({
          id: 'e2',
          abfahrt: '2026-08-06T05:00:00.000Z',
          counters: { km: { end: 17600 } },
        }),
        entry({
          id: 'e3',
          abfahrt: '2026-08-07T05:00:00.000Z',
          counters: { km: { start: 17600, end: 17610, diff: 10 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      { kind: 'missing', counterLabel: 'Kilometerstand', date: '06.08.2026' },
    ]);
  });

  it('prüft nach einer Fahrt ohne Endstand gegen den letzten bekannten Stand', () => {
    // Die Kette der Woche reißt an einer unvollständigen Fahrt nicht ab: Der
    // Sprung der dritten Fahrt fällt weiterhin auf.
    const model = build({
      entries: [
        entry(),
        entry({
          id: 'e2',
          abfahrt: '2026-08-06T05:00:00.000Z',
          counters: { km: { start: 17557 } },
        }),
        entry({
          id: 'e3',
          abfahrt: '2026-08-07T05:00:00.000Z',
          counters: { km: { start: 17700, end: 17710, diff: 10 } },
        }),
      ],
    });
    expect(model.vehicles[0].warnings).toEqual([
      { kind: 'missing', counterLabel: 'Kilometerstand', date: '06.08.2026' },
      {
        kind: 'gap',
        counterLabel: 'Kilometerstand',
        unit: 'km',
        previousEnd: 17557,
        nextStart: 17700,
        date: '07.08.2026',
      },
    ]);
  });

  it('kennzeichnet abgeleitete Endstände', () => {
    const model = build({
      entries: [entry({ counterSources: { km: 'estimate' } })],
    });
    expect(model.vehicles[0].rows[0].counters[0].estimated).toBe(true);
  });

  it('nimmt einen Zähler auf, der nur in den Fahrten steht', () => {
    // Die Zähler-Vorlage des Fahrzeugs wurde gewechselt; der erfasste Wert
    // darf nicht verschwinden.
    const model = build({
      vehicles: [vehicle({ counters: [] })],
      entries: [entry({ counters: { km: { start: 1, end: 2, diff: 1 } } })],
    });
    expect(model.vehicles[0].rows[0].counters).toHaveLength(1);
    expect(model.vehicles[0].rows[0].counters[0].label).toBe('km');
  });

  it('fällt beim Ziel auf den Einsatznamen zurück', () => {
    const model = build({
      entries: [
        entry({ ziel: '', firecallId: 'fc1', firecallName: 'T1 LKW Bergung A4' }),
      ],
    });
    expect(model.vehicles[0].rows[0].ziel).toBe('T1 LKW Bergung A4');
  });

  it('trägt den Tag der Ankunft bei einer Nachtfahrt', () => {
    const model = build({
      entries: [
        entry({
          abfahrt: '2026-08-05T21:50:00.000Z',
          ankunft: '2026-08-05T23:30:00.000Z',
        }),
      ],
    });
    expect(model.vehicles[0].rows[0].timeRange).toBe('23:50 - 06.08. 01:30');
  });

  it('setzt Hinweis und Mangeltext in den Vermerk', () => {
    const model = build({
      entries: [
        entry({
          hinweise: 'Tank halb voll',
          defekt: true,
          mangel: 'Blinker rechts defekt',
        }),
      ],
    });
    expect(model.vehicles[0].rows[0].note).toBe(
      'Tank halb voll — Defekt gemeldet: Blinker rechts defekt',
    );
    expect(model.vehicles[0].rows[0].defekt).toBe(true);
  });

  it('führt getankte Mengen mit', () => {
    const model = build({ entries: [entry({ betriebsmittel: { diesel: 42.5 } })] });
    expect(model.vehicles[0].rows[0].fuel).toEqual([
      { label: 'Diesel', unit: 'l', amount: 42.5 },
    ]);
  });

  it('sortiert die Fahrten aufsteigend nach Abfahrt', () => {
    const model = build({
      entries: [
        entry({ id: 'spät', abfahrt: '2026-08-07T10:00:00.000Z' }),
        entry({ id: 'früh', abfahrt: '2026-08-04T10:00:00.000Z' }),
      ],
    });
    expect(model.vehicles[0].rows.map((r) => r.date)).toEqual([
      '04.08.2026',
      '07.08.2026',
    ]);
  });

  it('lässt gelöschte Fahrten weg', () => {
    const model = build({ entries: [entry({ deleted: true })] });
    expect(model.vehicles[0].rows).toEqual([]);
    expect(model.entryCount).toBe(0);
  });

  it('listet offene und in Arbeit befindliche Mängel, nicht behobene', () => {
    const mangel = (over: Partial<Mangel>): Mangel => ({
      vehicleId: 'v1',
      vehicleName: 'KDTFA',
      description: 'Blinker rechts defekt',
      status: 'open',
      notes: [],
      reportedAt: '2026-08-05T17:00:00.000Z',
      reportedBy: 'u1',
      reportedByName: 'Lukas Fürst',
      group: 'ffnd',
      createdAt: '2026-08-05T17:00:00.000Z',
      createdBy: 'u1',
      updatedAt: '2026-08-05T17:00:00.000Z',
      updatedBy: 'u1',
      ...over,
    });
    const model = build({
      openMangel: [
        mangel({}),
        mangel({ status: 'inProgress', description: 'Undichte Kupplung' }),
        mangel({ status: 'resolved', description: 'Erledigt' }),
      ],
    });
    expect(model.openMangel).toEqual([
      {
        vehicleName: 'KDTFA',
        status: 'open',
        statusLabel: 'Offen',
        description: 'Blinker rechts defekt',
        reportedAt: '05.08.2026',
        reportedByName: 'Lukas Fürst',
        imageCount: 0,
      },
      {
        vehicleName: 'KDTFA',
        status: 'inProgress',
        statusLabel: 'In Arbeit',
        description: 'Undichte Kupplung',
        reportedAt: '05.08.2026',
        reportedByName: 'Lukas Fürst',
        imageCount: 0,
      },
    ]);
  });

  it('zählt die Bilder eines Mangels', () => {
    // Die Bilder selbst bleiben im Fahrtenbuch; der Bericht sagt nur, dass es
    // welche gibt.
    const withImages: Mangel = {
      vehicleId: 'v1',
      vehicleName: 'KDTFA',
      description: 'Blinker rechts defekt',
      status: 'open',
      notes: [],
      images: ['groups/ffnd/mangel/m1/a.jpg', 'groups/ffnd/mangel/m1/b.jpg'],
      reportedAt: '2026-08-05T17:00:00.000Z',
      reportedBy: 'u1',
      reportedByName: 'Lukas Fürst',
      group: 'ffnd',
      createdAt: '2026-08-05T17:00:00.000Z',
      createdBy: 'u1',
      updatedAt: '2026-08-05T17:00:00.000Z',
      updatedBy: 'u1',
    };
    const model = build({ openMangel: [withImages] });
    expect(model.openMangel[0].imageCount).toBe(2);
  });

  it('trägt Gruppe und Zeitraum durch', () => {
    const model = build();
    expect(model.groupId).toBe('ffnd');
    expect(model.groupName).toBe('FF Neusiedl am See');
    expect(model.period.week).toBe(32);
  });
});

describe('buildWeeklyReportModel — Zusatzfahrer', () => {
  it('nennt alle Fahrer im Feld driver', () => {
    const model = build({
      entries: [
        entry({ driverName: 'Lukas Fürst', coDrivers: [{ name: 'Anna Bauer' }] }),
      ],
    });
    expect(model.vehicles[0].rows[0].driver).toBe('Lukas Fürst, Anna Bauer');
  });
});
