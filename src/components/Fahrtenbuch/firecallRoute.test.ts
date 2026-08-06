import { describe, expect, it } from 'vitest';
import { cachedRouteLegs, routeCacheEntry } from './firecallRoute';

const from = { lat: 47.9482913, lng: 16.848222 };
const to = { lat: 47.98, lng: 16.9 };
const legs = { outboundMeters: 12000, returnMeters: 14000 };

describe('routeCacheEntry', () => {
  it('hält Hin- und Rückweg und die Koordinaten, für die sie gelten', () => {
    expect(routeCacheEntry(from, to, legs)).toEqual({
      outboundM: 12000,
      returnM: 14000,
      from: [47.9482913, 16.848222],
      to: [47.98, 16.9],
    });
  });
});

describe('cachedRouteLegs', () => {
  const cache = routeCacheEntry(from, to, legs);

  it('liefert beide Wegstrecken bei gleichen Koordinaten', () => {
    expect(cachedRouteLegs(cache, from, to)).toEqual(legs);
  });

  it('verwirft den Cache, wenn der Einsatzort verschoben wurde', () => {
    expect(
      cachedRouteLegs(cache, from, { lat: 48.5, lng: 16.9 }),
    ).toBeUndefined();
  });

  it('verwirft den Cache, wenn der Standort geändert wurde', () => {
    expect(cachedRouteLegs(cache, { lat: 48.5, lng: 16.9 }, to)).toBeUndefined();
  });

  it('verträgt einen fehlenden oder unvollständigen Cache', () => {
    expect(cachedRouteLegs(undefined, from, to)).toBeUndefined();
    expect(cachedRouteLegs({ outboundM: 1 } as never, from, to)).toBeUndefined();
  });

  it('verwirft einen Cache, dem der Rückweg fehlt', () => {
    // Ein halber Cache ließe sich nur durch Verdoppeln des Hinwegs nutzen —
    // genau die Annahme, die die getrennte Messung ablöst.
    const halfway = { ...cache, returnM: undefined };
    expect(cachedRouteLegs(halfway as never, from, to)).toBeUndefined();
  });

  it('verwirft einen Cache aus der Zeit der verdoppelten einfachen Strecke', () => {
    // Alte Dokumente tragen nur `distanceM`. Würde der Wert weiterverwendet,
    // blieben Einsätze auf der Autobahn dauerhaft mit dem verdoppelten Hinweg
    // stehen, obwohl die Route längst richtungsgetrennt gemessen wird.
    const legacy = { distanceM: 12000, from: cache.from, to: cache.to };
    expect(cachedRouteLegs(legacy as never, from, to)).toBeUndefined();
  });

  // Ein Cache-Dokument könnte durch eine ältere Version oder manuelle
  // Bearbeitung ein zu kurzes Array enthalten — das darf nicht werfen,
  // sondern muss wie ein Cache-Fehltreffer behandelt werden.
  it('verträgt ein Koordinaten-Array mit falschem Format, ohne zu werfen', () => {
    const malformed = { ...cache, from: [47.9482913] };
    expect(() => cachedRouteLegs(malformed as never, from, to)).not.toThrow();
    expect(cachedRouteLegs(malformed as never, from, to)).toBeUndefined();
  });
});
