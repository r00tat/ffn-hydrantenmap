import { geohashQueryBounds } from 'geofire-common';
import { describe, expect, it } from 'vitest';
import { FUELLSTELLE_RADIUS } from '../components/FirecallItems/elements/connection/pendel/fuellstelle';
import { CLUSTER_GEOHASH_PRECISION, clusterQueryBounds } from './clusterGeohash';

/**
 * Neusiedl am See. Die Kachel darüber heißt `u2ebz1` — sechs Zeichen, so wie
 * jedes Dokument in `clusters6`.
 */
const NEUSIEDL = { lat: 47.95, lng: 16.84 };
const DOC_GEOHASH = 'u2ebz1';

const covers = (bounds: [string, string][], geohash: string): boolean =>
  bounds.some(([lo, hi]) => geohash >= lo && geohash <= hi);

describe('clusterQueryBounds', () => {
  it('kürzt die Grenzen auf die Genauigkeit der Cluster-Dokumente', () => {
    for (const [lo, hi] of clusterQueryBounds(NEUSIEDL, 100)) {
      expect(lo.length).toBeLessThanOrEqual(CLUSTER_GEOHASH_PRECISION);
      expect(hi.length).toBeLessThanOrEqual(CLUSTER_GEOHASH_PRECISION);
    }
  });

  it('findet die eigene Kachel auch bei kleinem Radius', () => {
    // Der eigentliche Fehler: Unter etwa 500 m gibt `geohashQueryBounds`
    // siebenstellige Grenzen zurück. Ein sechsstelliges Dokument liegt
    // lexikografisch VOR jeder davon und fiel aus jedem Bereich heraus — die
    // Suche nach der Füllstelle fand nie einen Hydranten, auch nicht den, der
    // unmittelbar daneben stand.
    for (const radius of [50, 100, 200, 300]) {
      expect(
        covers(
          geohashQueryBounds([NEUSIEDL.lat, NEUSIEDL.lng], radius) as [
            string,
            string,
          ][],
          DOC_GEOHASH
        ),
        `ungekürzt bei ${radius} m`
      ).toBe(false);
      expect(
        covers(clusterQueryBounds(NEUSIEDL, radius), DOC_GEOHASH),
        `gekürzt bei ${radius} m`
      ).toBe(true);
    }
  });

  it('lässt Radien unverändert, deren Grenzen schon kurz genug sind', () => {
    const radius = 1200;
    expect(clusterQueryBounds(NEUSIEDL, radius)).toEqual(
      geohashQueryBounds([NEUSIEDL.lat, NEUSIEDL.lng], radius)
    );
  });

  it('trifft die Kachel eines echten Hydranten', () => {
    // `neusiedl_hy72` liegt in `clusters6/u2ebz1`, Nachbarkachel ist `u2ebz0`.
    // Genau diese beiden Kacheln muss eine 100-m-Suche um ihn abfragen.
    const hy72 = { lat: 47.950257495, lng: 16.839259187 };
    expect(clusterQueryBounds(hy72, FUELLSTELLE_RADIUS)).toEqual([
      ['u2ebz1', 'u2ebz1'],
      ['u2ebz0', 'u2ebz0'],
    ]);
  });

  it('fragt keinen Bereich doppelt ab', () => {
    const keys = clusterQueryBounds(NEUSIEDL, 100).map(
      ([lo, hi]) => `${lo}:${hi}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
