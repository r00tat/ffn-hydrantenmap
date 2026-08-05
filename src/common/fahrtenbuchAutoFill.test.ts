import { describe, expect, it } from 'vitest';
import { VEHICLE_PRESETS, type CounterDefinition } from './fahrtenbuch';
import {
  autoFillCounterEnds,
  estimateRoundTripKm,
  estimatedDistance,
  isKmCounter,
  roundTripKmFromMeters,
  routeDistance,
  type RoundTripDistance,
} from './fahrtenbuchAutoFill';

const km = VEHICLE_PRESETS.fahrzeug;
const boot = VEHICLE_PRESETS.boot;

/** 12 km einfache Strecke → 24 km Gesamtstrecke. */
const ROUTE_24: RoundTripDistance = routeDistance(12000);

describe('roundTripKmFromMeters', () => {
  it('verdoppelt die einfache Strecke und rundet auf', () => {
    expect(roundTripKmFromMeters(12000)).toBe(24);
    expect(roundTripKmFromMeters(12001)).toBe(25);
    expect(roundTripKmFromMeters(1)).toBe(1);
  });

  it('liefert 0 für eine Distanz von 0', () => {
    expect(roundTripKmFromMeters(0)).toBe(0);
  });
});

describe('estimateRoundTripKm', () => {
  it('schätzt die Gesamtstrecke (Hin- und Rückfahrt) aus der Luftlinie mit Umwegfaktor', () => {
    // 0,1° Breitengrad ≈ 11,13 km Luftlinie → × 1,3 × 2 ≈ 28,94 km, aufgerundet 29.
    const value = estimateRoundTripKm(
      { lat: 47.9482913, lng: 16.848222 },
      { lat: 48.0482913, lng: 16.848222 },
    );
    expect(value).toBe(29);
  });
});

describe('routeDistance / estimatedDistance', () => {
  it('trägt bei einer gefahrenen Route die einfache Strecke als Belegstelle mit', () => {
    expect(routeDistance(12000)).toStrictEqual({
      roundTripKm: 24,
      source: 'route',
      distanceMeters: 12000,
    });
  });

  it('lässt bei einer Schätzung die Streckenangabe weg', () => {
    // `routeDistanceMeters` am Eintrag belegt eine gefahrene Route. Stünde dort
    // ein Schätzwert, wäre der Nachweis nicht mehr von einer Messung zu
    // unterscheiden.
    const estimate = estimatedDistance(
      { lat: 47.9482913, lng: 16.848222 },
      { lat: 48.0482913, lng: 16.848222 },
    );
    expect(estimate.source).toBe('estimate');
    expect(estimate.roundTripKm).toBe(29);
    expect(estimate.distanceMeters).toBeUndefined();
  });
});

describe('isKmCounter', () => {
  it('erkennt den Kilometerzähler unabhängig von der Schreibweise', () => {
    expect(isKmCounter(km[0])).toBe(true);
    expect(isKmCounter({ ...km[0], unit: ' KM ' })).toBe(true);
  });

  it('erkennt einen importierten Zähler mit ausgeschriebener Einheit über die Preset-ID', () => {
    expect(isKmCounter({ ...km[0], unit: 'Kilometer' })).toBe(true);
  });

  it('lehnt Zähler ohne Kilometereinheit und reine Ablesungen ab', () => {
    expect(isKmCounter(boot[0])).toBe(false);
    expect(isKmCounter({ ...km[0], mode: 'reading' })).toBe(false);
  });
});

describe('autoFillCounterEnds', () => {
  it('leitet den Kilometer-Endstand aus der Gesamtstrecke ab', () => {
    const result = autoFillCounterEnds(km, { km: { start: 1000 } }, {}, ROUTE_24);
    expect(result.counters.km).toEqual({ start: 1000, end: 1024 });
    expect(result.counterSources).toEqual({ km: 'route' });
  });

  it('übernimmt die Herkunft der Strecke und erfindet sie nicht', () => {
    // Der Client ruft dieselbe Funktion mit seiner Schätzung auf. Würde hier
    // pauschal `'route'` gesetzt, behauptete ein Eintrag eine gefahrene Route,
    // die niemand berechnet hat.
    const result = autoFillCounterEnds(
      km,
      { km: { start: 1000 } },
      {},
      { roundTripKm: 30, source: 'estimate' },
    );
    expect(result.counters.km).toEqual({ start: 1000, end: 1030 });
    expect(result.counterSources).toEqual({ km: 'estimate' });
  });

  it('lässt einen eingetragenen Endstand unangetastet', () => {
    const result = autoFillCounterEnds(
      km,
      { km: { start: 1000, end: 1010 } },
      {},
      ROUTE_24,
    );
    expect(result.counters.km).toEqual({ start: 1000, end: 1010 });
    expect(result.counterSources).toEqual({});
  });

  it('füllt nichts, wenn der Startstand fehlt', () => {
    const result = autoFillCounterEnds(km, {}, { km: 990 }, ROUTE_24);
    expect(result.counters.km?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('füllt nichts, wenn keine Gesamtstrecke bekannt ist', () => {
    const result = autoFillCounterEnds(
      km,
      { km: { start: 1000 } },
      { km: 990 },
      undefined,
    );
    expect(result.counters.km).toEqual({ start: 1000 });
    expect(result.counters.km?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('übernimmt Zähler ohne Kilometerbezug unverändert', () => {
    const result = autoFillCounterEnds(
      boot,
      { betriebsstundenBb: { start: 20 } },
      { lenzpumpeStb: 5, lenzpumpeBb: 7 },
      ROUTE_24,
    );
    expect(result.counters.betriebsstundenBb?.end).toBe(20);
    expect(result.counters.lenzpumpeStb?.end).toBe(5);
    expect(result.counters.lenzpumpeBb?.end).toBe(7);
    expect(result.counterSources).toEqual({
      betriebsstundenBb: 'unchanged',
      lenzpumpeStb: 'unchanged',
      lenzpumpeBb: 'unchanged',
    });
  });

  it('füllt nichts, wenn kein letzter Stand bekannt ist', () => {
    const result = autoFillCounterEnds(boot, {}, {}, ROUTE_24);
    expect(result.counters.betriebsstundenBb?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('füllt einen Start/Ende-Zähler nicht, wenn der Startstand dieser Fahrt fehlt, selbst wenn ein letzter Stand bekannt ist', () => {
    const result = autoFillCounterEnds(boot, {}, { betriebsstundenBb: 20 }, ROUTE_24);
    expect(result.counters.betriebsstundenBb?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('füllt nur den abgeleiteten Zähler, wenn der Kilometer-Endstand bereits eingetragen ist', () => {
    const definitions: CounterDefinition[] = [
      ...km,
      {
        id: 'sonstige',
        label: 'Sonstige Ablesung',
        unit: 'h',
        mode: 'reading',
        changeWarning: 'anyChange',
        required: false,
      },
    ];
    const result = autoFillCounterEnds(
      definitions,
      { km: { start: 1000, end: 1050 } },
      { sonstige: 12 },
      ROUTE_24,
    );
    expect(result.counters.km).toEqual({ start: 1000, end: 1050 });
    expect(result.counters.sonstige?.end).toBe(12);
    expect(result.counterSources).toEqual({ sonstige: 'unchanged' });
  });

  it('verwirft ein mitgeschlepptes diff beim Auffüllen', () => {
    const result = autoFillCounterEnds(
      km,
      { km: { start: 1000, diff: 999 } },
      {},
      ROUTE_24,
    );
    // `toStrictEqual`, nicht `toEqual`: Letzteres übersieht ein explizit auf
    // `undefined` gesetztes `diff` — das landete in Firestore als Feld.
    expect(result.counters.km).toStrictEqual({ start: 1000, end: 1024 });
  });

  it('verändert die übergebenen Zähler nicht', () => {
    const counters = { km: { start: 1000 } };
    autoFillCounterEnds(km, counters, {}, ROUTE_24);
    expect(counters).toEqual({ km: { start: 1000 } });
  });

  it('ignoriert Zähler, die nicht in den Definitionen stehen', () => {
    const definitions: CounterDefinition[] = [];
    const result = autoFillCounterEnds(definitions, { km: { start: 1 } }, {}, ROUTE_24);
    expect(result.counters).toEqual({ km: { start: 1 } });
    expect(result.counterSources).toEqual({});
  });
});
