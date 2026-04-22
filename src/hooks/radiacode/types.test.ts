import { describe, it, expect } from 'vitest';
import {
  SampleRateSpec,
  isCustomSampleRate,
  resolveCustomThresholds,
  serializeSampleRateToBridge,
} from './types';

describe('SampleRateSpec', () => {
  it('preset strings are valid', () => {
    const s: SampleRateSpec = 'normal';
    expect(isCustomSampleRate(s)).toBe(false);
  });

  it('custom shape is valid', () => {
    const s: SampleRateSpec = { kind: 'custom', intervalSec: 10, distanceM: 5 };
    expect(isCustomSampleRate(s)).toBe(true);
  });

  it('serialize preset returns { sampleRateKind }', () => {
    expect(serializeSampleRateToBridge('hoch')).toEqual({ sampleRateKind: 'hoch' });
  });

  it('serialize custom skips undefined fields', () => {
    const out = serializeSampleRateToBridge({
      kind: 'custom',
      intervalSec: 10,
      distanceM: undefined,
      doseRateDeltaUSvH: 0.2,
    });
    expect(out).toEqual({
      sampleRateKind: 'custom',
      customIntervalSec: 10,
      customDoseRateDeltaUSvH: 0.2,
    });
  });

  it('resolveCustomThresholds returns null for preset', () => {
    expect(resolveCustomThresholds('normal')).toBeNull();
  });

  it('resolveCustomThresholds returns the object for custom', () => {
    const custom: SampleRateSpec = { kind: 'custom', intervalSec: 7 };
    expect(resolveCustomThresholds(custom)).toEqual(custom);
  });
});
