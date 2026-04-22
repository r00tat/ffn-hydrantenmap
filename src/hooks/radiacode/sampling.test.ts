import { describe, it, expect } from 'vitest';
import { shouldSamplePoint } from './sampling';
import { RATE_CONFIG } from './types';

describe('shouldSamplePoint', () => {
  const normal = RATE_CONFIG.normal;

  it('samples when distance exceeds minDistance and interval >= minInterval', () => {
    expect(
      shouldSamplePoint({
        distanceMeters: 6,
        secondsSinceLast: 2,
        config: normal,
      }),
    ).toBe(true);
  });

  it('does not sample when distance < minDistance and time < maxInterval', () => {
    expect(
      shouldSamplePoint({
        distanceMeters: 3,
        secondsSinceLast: 10,
        config: normal,
      }),
    ).toBe(false);
  });

  it('samples on maxInterval heartbeat even when stationary', () => {
    expect(
      shouldSamplePoint({
        distanceMeters: 0,
        secondsSinceLast: 16,
        config: normal,
      }),
    ).toBe(true);
  });

  it('does not sample below minInterval even on big distance', () => {
    expect(
      shouldSamplePoint({
        distanceMeters: 50,
        secondsSinceLast: 0.5,
        config: normal,
      }),
    ).toBe(false);
  });
});
