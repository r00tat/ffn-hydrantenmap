import { describe, expect, it } from 'vitest';
import { cachedRouteDistance, routeCacheEntry } from './firecallRoute';

const from = { lat: 47.9482913, lng: 16.848222 };
const to = { lat: 47.98, lng: 16.9 };

describe('routeCacheEntry', () => {
  it('hält Distanz und die Koordinaten, für die sie gilt', () => {
    expect(routeCacheEntry(from, to, 12000)).toEqual({
      distanceM: 12000,
      from: [47.9482913, 16.848222],
      to: [47.98, 16.9],
    });
  });
});

describe('cachedRouteDistance', () => {
  const cache = routeCacheEntry(from, to, 12000);

  it('liefert die Distanz bei gleichen Koordinaten', () => {
    expect(cachedRouteDistance(cache, from, to)).toBe(12000);
  });

  it('verwirft den Cache, wenn der Einsatzort verschoben wurde', () => {
    expect(
      cachedRouteDistance(cache, from, { lat: 48.5, lng: 16.9 }),
    ).toBeUndefined();
  });

  it('verwirft den Cache, wenn der Standort geändert wurde', () => {
    expect(
      cachedRouteDistance(cache, { lat: 48.5, lng: 16.9 }, to),
    ).toBeUndefined();
  });

  it('verträgt einen fehlenden oder unvollständigen Cache', () => {
    expect(cachedRouteDistance(undefined, from, to)).toBeUndefined();
    expect(
      cachedRouteDistance({ distanceM: 1 } as never, from, to),
    ).toBeUndefined();
  });

  // Ein Cache-Dokument könnte durch eine ältere Version oder manuelle
  // Bearbeitung ein zu kurzes Array enthalten — das darf nicht werfen,
  // sondern muss wie ein Cache-Fehltreffer behandelt werden.
  it('verträgt ein Koordinaten-Array mit falschem Format, ohne zu werfen', () => {
    const malformed = { distanceM: 12000, from: [47.9482913], to: [47.98, 16.9] };
    expect(() =>
      cachedRouteDistance(malformed as never, from, to),
    ).not.toThrow();
    expect(cachedRouteDistance(malformed as never, from, to)).toBeUndefined();
  });
});
