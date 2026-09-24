import { describe, expect, it } from 'vitest';
import type { FirecallItem, FirecallLayer } from '../../components/firebase/firestore';
import { findItems, isMeasurementLayer } from './findItems';

const metersToLat = (m: number) => m / 111320;
const origin = { lat: 47.95, lng: 16.85 };

const layers = [
  {
    id: 'mess',
    type: 'layer',
    name: 'Strahlenmessung',
    dataSchema: [{ key: 'dosisleistung', label: 'Dosisleistung', unit: 'µSv/h', type: 'number' }],
  },
  { id: 'nord', type: 'layer', name: 'Abschnitt Nord' },
] as FirecallLayer[];

const messung = (id: string, wert: number, meter: number, created: string) =>
  ({
    id,
    type: 'marker',
    name: `Messung ${id}`,
    layer: 'mess',
    lat: origin.lat + metersToLat(meter),
    lng: origin.lng,
    created,
    fieldData: { dosisleistung: wert },
  }) as FirecallItem;

const items = [
  messung('1', 5, 10, '2026-09-24T10:00:00Z'),
  messung('2', 40, 80, '2026-09-24T10:05:00Z'),
  messung('3', 12, 300, '2026-09-24T10:10:00Z'),
  { id: 'v', type: 'vehicle', name: 'TLFA 4000', fw: 'Neusiedl', lat: origin.lat, lng: origin.lng },
  {
    id: 'd',
    type: 'diary',
    name: 'Lagemeldung',
    beschreibung: 'Rauch aus dem Keller',
    datum: '2026-09-24T09:00:00Z',
  },
  { id: 'x', type: 'marker', name: 'Gelöscht', deleted: true },
] as FirecallItem[];

describe('isMeasurementLayer', () => {
  it('erkennt Ebenen mit Datenfeldern und Radiacode-Aufzeichnungen', () => {
    expect(isMeasurementLayer(layers[0])).toBe(true);
    expect(isMeasurementLayer(layers[1])).toBe(false);
    expect(isMeasurementLayer({ ...layers[1], layerType: 'radiacode' })).toBe(true);
    expect(isMeasurementLayer(undefined)).toBe(false);
  });
});

describe('findItems', () => {
  it('filtert nach Feldwert mit Einheitenumrechnung', () => {
    const result = findItems(items, layers, {
      layer: 'Strahlen',
      field: 'dosisleistung',
      min: 0.01,
      unit: 'mSv/h',
    });
    expect(result.items.map((i) => i.id)).toEqual(['3', '2']);
    expect(result.total).toBe(2);
  });

  it('sortiert nach dem höchsten Wert', () => {
    const result = findItems(items, layers, { field: 'Dosisleistung', sort: 'highest', limit: 1 });
    expect(result.items.map((i) => i.id)).toEqual(['2']);
    expect(result.total).toBe(3);
  });

  it('sucht im Umkreis und sortiert dann nach Abstand', () => {
    const result = findItems(items, layers, { radius: 100 }, origin);
    expect(result.items.map((i) => i.id)).toEqual(['v', '1', '2']);
    expect(result.items[1].distance).toBe(10);
  });

  it('liefert neueste zuerst, mit Koordinaten, Messwerten und Tagebuchtext', () => {
    const result = findItems(items, layers, {});
    expect(result.items[0].id).toBe('3');
    expect(result.items[0]).toMatchObject({ lat: expect.any(Number), fieldData: { dosisleistung: 12 } });
    const eintrag = findItems(items, layers, { type: 'diary' }).items[0];
    expect(eintrag.beschreibung).toBe('Rauch aus dem Keller');
  });

  it('sucht im Namen, in der Feuerwehr und in der Beschreibung, nie Gelöschtes', () => {
    expect(findItems(items, layers, { name: 'neusiedl' }).items.map((i) => i.id)).toEqual(['v']);
    expect(findItems(items, layers, { name: 'keller' }).items.map((i) => i.id)).toEqual(['d']);
    expect(findItems(items, layers, { name: 'gelöscht' }).total).toBe(0);
  });

  it('meldet eine fehlende Ebene und eine unverträgliche Einheit', () => {
    expect(findItems(items, layers, { layer: 'Süd' }).error).toMatch(
      /Ebene "Süd" nicht gefunden \(Ebenen: "Strahlenmessung", "Abschnitt Nord"\)/,
    );
    expect(
      findItems(items, layers, { field: 'dosisleistung', min: 1, unit: 'ppm' }).error,
    ).toMatch(/ppm lässt sich nicht in µSv\/h umrechnen/);
  });

  it('begrenzt die Treffer auf höchstens 50', () => {
    const viele = Array.from({ length: 60 }, (_, i) =>
      messung(String(i), i, 0, `2026-09-24T10:${String(i).padStart(2, '0')}:00Z`),
    );
    const result = findItems(viele, layers, { limit: 500 });
    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(60);
  });
});
