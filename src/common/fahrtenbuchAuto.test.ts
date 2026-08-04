import { describe, expect, it } from 'vitest';
import { VEHICLE_PRESETS, type CounterDefinition } from './fahrtenbuch';
import {
  autoFillCounterEnds,
  estimateRoundTripKm,
  isKmCounter,
  roundTripKmFromMeters,
} from './fahrtenbuchAuto';

const km = VEHICLE_PRESETS.fahrzeug;
const boot = VEHICLE_PRESETS.boot;

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
  it('schätzt die Rundstrecke aus der Luftlinie mit Umwegfaktor', () => {
    // 0,1° Breitengrad ≈ 11,1 km Luftlinie → × 1,3 × 2 ≈ 28,9 km.
    const value = estimateRoundTripKm(
      { lat: 47.9482913, lng: 16.848222 },
      { lat: 48.0482913, lng: 16.848222 },
    );
    expect(value).toBeGreaterThanOrEqual(28);
    expect(value).toBeLessThanOrEqual(30);
  });
});

describe('isKmCounter', () => {
  it('erkennt den Kilometerzähler unabhängig von der Schreibweise', () => {
    expect(isKmCounter(km[0])).toBe(true);
    expect(isKmCounter({ ...km[0], unit: ' KM ' })).toBe(true);
  });

  it('lehnt Zähler ohne Kilometereinheit und reine Ablesungen ab', () => {
    expect(isKmCounter(boot[0])).toBe(false);
    expect(isKmCounter({ ...km[0], mode: 'reading' })).toBe(false);
  });
});

describe('autoFillCounterEnds', () => {
  it('leitet den Kilometer-Endstand aus der Rundstrecke ab', () => {
    const result = autoFillCounterEnds(km, { km: { start: 1000 } }, {}, 24);
    expect(result.counters.km).toEqual({ start: 1000, end: 1024 });
    expect(result.counterSources).toEqual({ km: 'route' });
  });

  it('lässt einen eingetragenen Endstand unangetastet', () => {
    const result = autoFillCounterEnds(
      km,
      { km: { start: 1000, end: 1010 } },
      {},
      24,
    );
    expect(result.counters.km).toEqual({ start: 1000, end: 1010 });
    expect(result.counterSources).toEqual({});
  });

  it('füllt nichts, wenn der Startstand fehlt', () => {
    const result = autoFillCounterEnds(km, {}, {}, 24);
    expect(result.counters.km?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('füllt nichts, wenn keine Rundstrecke bekannt ist', () => {
    const result = autoFillCounterEnds(km, { km: { start: 1000 } }, {}, undefined);
    expect(result.counters.km).toEqual({ start: 1000 });
    expect(result.counterSources).toEqual({});
  });

  it('übernimmt Zähler ohne Kilometerbezug unverändert', () => {
    const result = autoFillCounterEnds(
      boot,
      {},
      { betriebsstundenBb: 20, lenzpumpeStb: 5, lenzpumpeBb: 7 },
      24,
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
    const result = autoFillCounterEnds(boot, {}, {}, 24);
    expect(result.counters.betriebsstundenBb?.end).toBeUndefined();
    expect(result.counterSources).toEqual({});
  });

  it('verändert die übergebenen Zähler nicht', () => {
    const counters = { km: { start: 1000 } };
    autoFillCounterEnds(km, counters, {}, 24);
    expect(counters).toEqual({ km: { start: 1000 } });
  });

  it('ignoriert Zähler, die nicht in den Definitionen stehen', () => {
    const definitions: CounterDefinition[] = [];
    const result = autoFillCounterEnds(definitions, { km: { start: 1 } }, {}, 24);
    expect(result.counters).toEqual({ km: { start: 1 } });
    expect(result.counterSources).toEqual({});
  });
});
