import { describe, expect, it } from 'vitest';
import {
  VEHICLE_PRESETS,
  type FahrtenbuchEntry,
  type FahrtenbuchPerson,
  type FahrtenbuchVehicle,
} from '../../common/fahrtenbuch';
import type { PdfFahrtRow } from './fahrtenbuchPdfImport';
import {
  defaultFuelType,
  findKmCounter,
  mapGrund,
  planFahrtenbuchImport,
  planInactivePersons,
  unknownDriverNames,
} from './fahrtenbuchImportPlan';

function vehicle(overrides: Partial<FahrtenbuchVehicle> = {}): FahrtenbuchVehicle {
  return {
    id: 'v1',
    name: 'KDTFA',
    active: true,
    counters: VEHICLE_PRESETS.fahrzeug,
    fuelTypes: ['diesel', 'adblue'],
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
    ...overrides,
  };
}

function person(name: string, id = 'p1'): FahrtenbuchPerson {
  return {
    id, name, active: true,
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
  };
}

function pdfRow(overrides: Partial<PdfFahrtRow> = {}): PdfFahrtRow {
  return {
    line: 1,
    datum: '04.06.2025',
    von: '17:40',
    bis: '18:00',
    fahrer: 'Anna Muster',
    grund: 'Einsatz',
    zweckStrecke: 'N/S Ölspur',
    startKm: 14646,
    endeKm: 14664,
    gefahreneKm: 18,
    notizen: '',
    raw: '',
    ...overrides,
  };
}

describe('mapGrund', () => {
  it('bildet die bekannten Gründe ab', () => {
    expect(mapGrund('Einsatz')).toEqual({ zweck: 'einsatz' });
    expect(mapGrund('Übung')).toEqual({ zweck: 'uebung' });
    expect(mapGrund('Sonstiges')).toEqual({ zweck: 'sonstiges' });
  });

  it('behält Werkstatt und Probefahrt als Zusatz zum Ziel', () => {
    expect(mapGrund('Werkstatt')).toEqual({ zweck: 'sonstiges', prefix: 'Werkstatt' });
    expect(mapGrund('Probefahrt')).toEqual({ zweck: 'sonstiges', prefix: 'Probefahrt' });
  });

  it('behandelt einen unbekannten Grund wie Werkstatt', () => {
    expect(mapGrund('Überstellung')).toEqual({
      zweck: 'sonstiges',
      prefix: 'Überstellung',
    });
  });
});

describe('findKmCounter / defaultFuelType', () => {
  it('findet den Kilometerzähler über die Einheit', () => {
    expect(findKmCounter(VEHICLE_PRESETS.fahrzeug)?.id).toBe('km');
  });

  it('findet in einem Boot keinen Kilometerzähler', () => {
    expect(findKmCounter(VEHICLE_PRESETS.boot)).toBeUndefined();
  });

  it('überspringt AdBlue bei der Kraftstoffart', () => {
    expect(defaultFuelType(['adblue', 'diesel'])).toBe('diesel');
    expect(defaultFuelType([])).toBeUndefined();
  });
});

describe('planFahrtenbuchImport', () => {
  it('erzeugt einen vollständigen Eintrag mit bekanntem Fahrer', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], [],
    );
    expect(row.state).toBe('ready');
    expect(row.input).toMatchObject({
      vehicleId: 'v1',
      driverId: 'p1',
      driverName: 'Anna Muster',
      zweck: 'einsatz',
      ziel: 'N/S Ölspur',
      counters: { km: { start: 14646, end: 14664 } },
    });
  });

  it('legt den Zweck-Text auch bei Einsatz ins Ziel und nicht in den Einsatznamen', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], [],
    );
    expect(row.input?.ziel).toBe('N/S Ölspur');
    expect(row.input?.firecallId).toBeUndefined();
    expect(row.input?.firecallName).toBeUndefined();
  });

  it('stellt Werkstatt dem Ziel voran', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ grund: 'Werkstatt', zweckStrecke: 'Reifen Ritz' })],
      vehicle(), [person('Anna Muster')], [],
    );
    expect(row.input).toMatchObject({ zweck: 'sonstiges', ziel: 'Werkstatt: Reifen Ritz' });
  });

  it('rollt eine Ankunft vor der Abfahrt auf den Folgetag', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ datum: '02.01.2026', von: '23:55', bis: '00:29' })],
      vehicle(), [person('Anna Muster')], [],
    );
    const abfahrt = new Date(row.input?.abfahrt as string);
    const ankunft = new Date(row.input?.ankunft as string);
    expect(ankunft.getTime()).toBeGreaterThan(abfahrt.getTime());
    expect(ankunft.getDate()).toBe(3);
  });

  it('übernimmt einen unbekannten Fahrer als Freitext, aber abgewählt', () => {
    const [row] = planFahrtenbuchImport([pdfRow()], vehicle(), [], []);
    expect(row.state).toBe('unknownDriver');
    expect(row.input).toMatchObject({ driverName: 'Anna Muster', driverId: undefined });
  });

  it('schreibt Treibstoff auf die Kraftstoffart des Fahrzeugs', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ treibstoff: 39.4, adBlue: 8.7 })],
      vehicle(), [person('Anna Muster')], [],
    );
    expect(row.input?.betriebsmittel).toEqual({ diesel: 39.4, adblue: 8.7 });
  });

  it('verwirft AdBlue bei einem Fahrzeug ohne AdBlue', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ treibstoff: 20, adBlue: 5 })],
      vehicle({ fuelTypes: ['benzin'] }), [person('Anna Muster')], [],
    );
    expect(row.input?.betriebsmittel).toEqual({ benzin: 20 });
  });

  it('erkennt eine Dublette über Fahrzeug, Tag und Startstand', () => {
    const existing = [
      {
        vehicleId: 'v1',
        abfahrt: new Date(2025, 5, 4, 17, 40).toISOString(),
        counters: { km: { start: 14646, end: 14664 } },
        deleted: false,
      } as unknown as FahrtenbuchEntry,
    ];
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], existing,
    );
    expect(row.state).toBe('duplicate');
  });

  it('meldet ein Fahrzeug ohne Kilometerzähler', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle({ counters: VEHICLE_PRESETS.boot }), [], [],
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'noKmCounter' });
    expect(row.input).toBeUndefined();
  });

  it('reicht ein Problem aus dem Parser durch', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ problem: 'kmMismatch' })], vehicle(), [person('Anna Muster')], [],
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'kmMismatch' });
  });

  it('zeigt Datum und Zeit unabhängig von der Rohzeile', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], [],
    );
    expect(row.preview).toMatchObject({
      datum: '04.06.2025',
      zeit: '17:40 - 18:00',
      km: '14646 → 14664',
    });
    expect(row.edited).toBe(false);
  });
});

describe('planFahrtenbuchImport mit Bearbeitungen', () => {
  it('setzt den korrigierten Fahrer und verknüpft ihn mit der Person', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ fahrer: 'A. Muster' })],
      vehicle(),
      [person('Anna Muster')],
      [],
      { edits: { 1: { driverName: 'Anna Muster' } } },
    );
    expect(row.state).toBe('ready');
    expect(row.edited).toBe(true);
    expect(row.input).toMatchObject({ driverId: 'p1', driverName: 'Anna Muster' });
  });

  it('lässt eine unlesbare Zeile durch eingetragene Werte gültig werden', () => {
    // Der Import ergänzt nichts von selbst — was ein Mensch aus dem Nachweis
    // abliest, darf er aber eintragen.
    const [row] = planFahrtenbuchImport(
      [pdfRow({ startKm: undefined, endeKm: undefined, problem: 'kmMissing' })],
      vehicle(),
      [person('Anna Muster')],
      [],
      { edits: { 1: { startKm: 14646, endeKm: 14664 } } },
    );
    expect(row.state).toBe('ready');
    expect(row.input?.counters).toEqual({ km: { start: 14646, end: 14664 } });
  });

  it('hält die Selbstprüfung des Parsers, solange die Kilometer unangetastet sind', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ problem: 'kmMismatch' })],
      vehicle(),
      [person('Anna Muster')],
      [],
      { edits: { 1: { ziel: 'Neusiedl' } } },
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'kmMismatch', edited: true });
  });

  it('meldet einen Endstand vor dem Startstand', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ gefahreneKm: undefined })],
      vehicle(),
      [person('Anna Muster')],
      [],
      { edits: { 1: { startKm: 14664, endeKm: 14646 } } },
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'kmMismatch' });
  });

  it('meldet eine Ankunft vor der Abfahrt', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()],
      vehicle(),
      [person('Anna Muster')],
      [],
      {
        edits: {
          1: {
            abfahrt: new Date(2025, 5, 4, 18, 0).toISOString(),
            ankunft: new Date(2025, 5, 4, 17, 40).toISOString(),
          },
        },
      },
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'timeMismatch' });
  });

  it('meldet einen geleerten Fahrer', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], [],
      { edits: { 1: { driverName: '  ' } } },
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'driverMissing' });
  });

  it('meldet eine Zeile ohne Zweck/Strecke', () => {
    // Ein Import kennt keinen verknüpften Einsatz, der das Ziel benennen
    // könnte — die Zeile ist im Dialog zu vervollständigen.
    const [row] = planFahrtenbuchImport(
      [pdfRow({ grund: 'Einsatz', zweckStrecke: '' })],
      vehicle(),
      [person('Anna Muster')],
      [],
    );
    expect(row).toMatchObject({ state: 'problem', problem: 'zielMissing' });
  });

  it('nimmt den Grund als Ziel, wenn er im Zweck nicht aufgeht', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow({ grund: 'Werkstatt', zweckStrecke: '' })],
      vehicle(),
      [person('Anna Muster')],
      [],
    );
    expect(row).toMatchObject({ state: 'ready', values: { ziel: 'Werkstatt' } });
  });

  it('zieht die Ankunft auf den Tag der verschobenen Abfahrt nach', () => {
    // Nur die Abfahrt bearbeitet: Die Uhrzeit der Ankunft bleibt, ihr
    // Kalendertag folgt — sonst läge sie einen Tag vor der Abfahrt.
    const [row] = planFahrtenbuchImport(
      [pdfRow()],
      vehicle(),
      [person('Anna Muster')],
      [],
      { edits: { 1: { abfahrt: new Date(2025, 5, 5, 17, 40).toISOString() } } },
    );
    const ankunft = new Date(row.input?.ankunft as string);
    expect(ankunft.getDate()).toBe(5);
    expect(ankunft.getHours()).toBe(18);
  });

  it('erkennt eine Dublette erst nach der Korrektur des Startstands', () => {
    const existing = [
      {
        vehicleId: 'v1',
        abfahrt: new Date(2025, 5, 4, 17, 40).toISOString(),
        counters: { km: { start: 14646, end: 14664 } },
        deleted: false,
      } as unknown as FahrtenbuchEntry,
    ];
    const [row] = planFahrtenbuchImport(
      [pdfRow({ startKm: 14640, gefahreneKm: undefined })],
      vehicle(),
      [person('Anna Muster')],
      existing,
      { edits: { 1: { startKm: 14646 } } },
    );
    expect(row.state).toBe('duplicate');
  });

  it('ignoriert eine Bearbeitung, die nichts ändert', () => {
    const [row] = planFahrtenbuchImport(
      [pdfRow()], vehicle(), [person('Anna Muster')], [],
      { edits: { 1: { ziel: 'N/S Ölspur', driverName: 'Anna Muster' } } },
    );
    expect(row.edited).toBe(false);
  });
});

describe('unknownDriverNames', () => {
  it('nennt jeden unbekannten Fahrer genau einmal', () => {
    const rows = planFahrtenbuchImport(
      [
        pdfRow({ line: 1, fahrer: 'Bert Fremd' }),
        pdfRow({ line: 2, fahrer: 'bert  fremd', datum: '05.06.2025' }),
        pdfRow({ line: 3, fahrer: 'Anna Muster', datum: '06.06.2025' }),
      ],
      vehicle(),
      [person('Anna Muster')],
      [],
    );
    expect(unknownDriverNames(rows)).toEqual(['Bert Fremd']);
  });

  it('übergeht Problemzeilen — sie werden gar nicht importiert', () => {
    const rows = planFahrtenbuchImport(
      [pdfRow({ fahrer: 'Bert Fremd', problem: 'kmMismatch' })],
      vehicle(), [], [],
    );
    expect(unknownDriverNames(rows)).toEqual([]);
  });
});

describe('planInactivePersons', () => {
  it('trennt vorhandene Personen von neu anzulegenden', () => {
    const plan = planInactivePersons(
      ['Anna  Muster', 'Bert Fremd', 'anna muster', '  '],
      [person('Anna Muster', 'p1')],
    );
    expect(plan.create).toEqual(['Bert Fremd']);
    expect(plan.existing).toEqual({ 'anna muster': 'p1' });
  });
});
