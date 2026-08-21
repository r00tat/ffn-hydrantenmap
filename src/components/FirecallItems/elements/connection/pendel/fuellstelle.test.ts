import { describe, expect, it } from 'vitest';
import type { GeohashCluster } from '../../../../../common/gis-objects';
import {
  FUELLSTELLE_RADIUS,
  nearestFuellstelle,
  parseLeistung,
} from './fuellstelle';

const entnahme = { lat: 47.9482, lng: 16.8482 };

/** Ein Punkt in etwa `metres` Metern nördlich der Entnahmestelle. */
const north = (metres: number) => ({
  lat: entnahme.lat + metres / 111_320,
  lng: entnahme.lng,
});

const cluster = (
  hydranten: Record<string, unknown>[]
): GeohashCluster[] => [{ geohash: 'u2m', hydranten } as unknown as GeohashCluster];

describe('parseLeistung', () => {
  it('liest eine reine Zahl', () => {
    expect(parseLeistung('1074')).toBe(1074);
    expect(parseLeistung(800)).toBe(800);
  });

  it('liest die Zahl aus einem Freitext', () => {
    // Das Feld kommt aus dem GIS-Import und ist nicht normiert.
    expect(parseLeistung('800 l/min')).toBe(800);
    expect(parseLeistung('ca. 600')).toBe(600);
  });

  it('liest Tausendertrennung als Tausender, nicht als Dezimalstelle', () => {
    // „1.200" sind 1200 l/min. Als Dezimalpunkt gelesen wären es 1,2 — und der
    // stärkste Hydrant im Datensatz deckelte den Pendelverkehr auf nichts.
    expect(parseLeistung('1.200 l/min')).toBe(1200);
    expect(parseLeistung('1.200')).toBe(1200);
    expect(parseLeistung('1,200')).toBe(1200);
  });

  it('liest Dezimalkomma', () => {
    expect(parseLeistung('833,5 l/min')).toBeCloseTo(833.5, 6);
    expect(parseLeistung('1.200,5')).toBeCloseTo(1200.5, 6);
  });

  it('gibt ohne Zahl nichts zurück — geraten wird nicht', () => {
    expect(parseLeistung(undefined)).toBeUndefined();
    expect(parseLeistung('')).toBeUndefined();
    expect(parseLeistung('unbekannt')).toBeUndefined();
    expect(parseLeistung('0')).toBeUndefined();
    expect(parseLeistung(-5)).toBeUndefined();
  });
});

describe('nearestFuellstelle', () => {
  it('nimmt den nächsten Hydranten mit Leistungsangabe', () => {
    const result = nearestFuellstelle(
      cluster([
        { name: 'HY-2', ...north(60), typ: 'Überflurhydrant', leistung: '900' },
        { name: 'HY-1', ...north(30), typ: 'Überflurhydrant', leistung: '1200' },
      ]),
      entnahme
    );
    expect(result?.name).toBe('HY-1');
    expect(result?.leistung).toBe(1200);
    expect(result?.distance).toBeLessThan(40);
  });

  it('überspringt einen näheren Hydranten ohne Leistungsangabe', () => {
    // Gesucht ist die Zahl, nicht der Hydrant: Ein näherer ohne Angabe hilft
    // beim Rechnen nicht.
    const result = nearestFuellstelle(
      cluster([
        { name: 'ohne Angabe', ...north(20), typ: 'Überflurhydrant' },
        { name: 'mit Angabe', ...north(70), typ: 'Überflurhydrant', leistung: '800' },
      ]),
      entnahme
    );
    expect(result?.name).toBe('mit Angabe');
    expect(result?.leistung).toBe(800);
  });

  it('sieht nichts jenseits des Radius', () => {
    const result = nearestFuellstelle(
      cluster([
        { name: 'zu weit', ...north(150), typ: 'Überflurhydrant', leistung: '900' },
      ]),
      entnahme
    );
    expect(result).toBeUndefined();
  });

  it('nimmt den Radius aus dem Aufruf', () => {
    const hydranten = [
      { name: 'HY', ...north(150), typ: 'Überflurhydrant', leistung: '900' },
    ];
    expect(nearestFuellstelle(cluster(hydranten), entnahme, 200)?.name).toBe(
      'HY'
    );
  });

  it('hat 100 m als Reichweite', () => {
    expect(FUELLSTELLE_RADIUS).toBe(100);
  });

  it('sieht keine Saugstelle und keinen Löschteich', () => {
    // Beide tragen ihre Ergiebigkeit in anderen Feldern und sind ein eigener
    // Fall — siehe docs/pendelverkehr.md.
    const clusters = [
      {
        geohash: 'u2m',
        saugstelle: [{ name: 'Kanal', ...north(20), wasserentnahme_l_min_: 1000 }],
        loeschteich: [{ name: 'Teich', ...north(25), zufluss_l_min_: 400 }],
      } as unknown as GeohashCluster,
    ];
    expect(nearestFuellstelle(clusters, entnahme)).toBeUndefined();
  });

  it('gibt ohne Cluster nichts zurück', () => {
    expect(nearestFuellstelle([], entnahme)).toBeUndefined();
  });
});
