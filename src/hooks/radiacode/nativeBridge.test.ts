import { describe, expect, it } from 'vitest';
import { toMeasurementForTest } from './nativeBridge';

describe('nativeBridge / toMeasurement', () => {
  it('übernimmt Realtime- und Rare-Felder wenn alle vorhanden', () => {
    const m = toMeasurementForTest({
      timestampMs: 1000,
      dosisleistungUSvH: 0.12,
      cps: 5,
      doseUSv: 420,
      durationSec: 600,
      temperatureC: 24.5,
      chargePct: 88,
      dosisleistungErrPct: 10,
      cpsErrPct: 15,
    });
    expect(m).toMatchObject({
      dosisleistung: 0.12,
      cps: 5,
      timestamp: 1000,
      dose: 420,
      durationSec: 600,
      temperatureC: 24.5,
      chargePct: 88,
      dosisleistungErrPct: 10,
      cpsErrPct: 15,
    });
  });

  it('lässt optionale Rare-Keys weg, wenn das Native-Event sie nicht liefert (kein Rare-Record im Tick)', () => {
    const m = toMeasurementForTest({
      timestampMs: 2000,
      dosisleistungUSvH: 0.2,
      cps: 7,
    });
    // Damit `{...prev, ...m}` in useRadiacodeDevice die zuletzt gesehenen
    // Rare-Werte erhält, dürfen diese Keys NICHT mit `undefined` enthalten sein.
    expect(Object.keys(m).sort()).toEqual(
      ['cps', 'dosisleistung', 'timestamp'].sort(),
    );
    expect('dose' in m).toBe(false);
    expect('durationSec' in m).toBe(false);
    expect('temperatureC' in m).toBe(false);
    expect('chargePct' in m).toBe(false);
    expect('dosisleistungErrPct' in m).toBe(false);
    expect('cpsErrPct' in m).toBe(false);
  });

  it('behält die Rare-Werte über einen Tick ohne Rare-Record hinweg', () => {
    // Simuliert den Flow in useRadiacodeDevice: setMeasurement((prev) => ({...prev, ...m}))
    const withRare = toMeasurementForTest({
      timestampMs: 1000,
      dosisleistungUSvH: 0.1,
      cps: 3,
      doseUSv: 100,
      durationSec: 60,
      temperatureC: 20,
      chargePct: 99,
    });
    const withoutRare = toMeasurementForTest({
      timestampMs: 1500,
      dosisleistungUSvH: 0.15,
      cps: 4,
    });
    const merged = { ...withRare, ...withoutRare };
    expect(merged.dose).toBe(100);
    expect(merged.durationSec).toBe(60);
    expect(merged.temperatureC).toBe(20);
    expect(merged.chargePct).toBe(99);
    expect(merged.dosisleistung).toBe(0.15);
    expect(merged.cps).toBe(4);
  });
});
