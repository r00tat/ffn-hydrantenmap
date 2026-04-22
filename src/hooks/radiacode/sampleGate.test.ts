import { describe, expect, it } from 'vitest';
import { decideShouldRecordPoint } from './sampleGate';

describe('decideShouldRecordPoint', () => {
  it('hard floor: dt < 1s always false', () => {
    expect(decideShouldRecordPoint({ distanceMeters: 1000, dtSec: 0.9, rate: 'normal' })).toBe(false);
  });

  it('preset normal: dt >= 15s triggers', () => {
    expect(decideShouldRecordPoint({ distanceMeters: 0, dtSec: 16, rate: 'normal' })).toBe(true);
  });

  it('preset normal: distance >= 5m triggers', () => {
    expect(decideShouldRecordPoint({ distanceMeters: 5, dtSec: 2, rate: 'normal' })).toBe(true);
  });

  it('preset normal: ignores dose delta', () => {
    expect(decideShouldRecordPoint({ distanceMeters: 0, dtSec: 2, doseRateDeltaUSvH: 1000, rate: 'normal' })).toBe(false);
  });

  it('custom with only interval: distance does not trigger', () => {
    const rate = { kind: 'custom', intervalSec: 10 } as const;
    expect(decideShouldRecordPoint({ distanceMeters: 1000, dtSec: 2, rate })).toBe(false);
    expect(decideShouldRecordPoint({ distanceMeters: 0, dtSec: 11, rate })).toBe(true);
  });

  it('custom with dose delta fires on |delta| >= threshold', () => {
    const rate = { kind: 'custom', doseRateDeltaUSvH: 0.1 } as const;
    expect(decideShouldRecordPoint({ distanceMeters: 0, dtSec: 2, doseRateDeltaUSvH: 0.05, rate })).toBe(false);
    expect(decideShouldRecordPoint({ distanceMeters: 0, dtSec: 2, doseRateDeltaUSvH: -0.2, rate })).toBe(true);
  });
});
