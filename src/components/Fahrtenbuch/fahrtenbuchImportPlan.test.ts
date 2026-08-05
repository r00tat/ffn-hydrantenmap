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
});
