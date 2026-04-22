import { RATE_CONFIG, SampleRateSpec, isCustomSampleRate } from './types';

const HARD_FLOOR_SEC = 1.0;

interface ResolvedCustom {
  maxIntervalSec?: number;
  minDistanceMeters?: number;
  minDoseRateDeltaUSvH?: number;
}

function resolve(rate: SampleRateSpec): ResolvedCustom {
  if (isCustomSampleRate(rate)) {
    return {
      maxIntervalSec: rate.intervalSec,
      minDistanceMeters: rate.distanceM,
      minDoseRateDeltaUSvH: rate.doseRateDeltaUSvH,
    };
  }
  const c = RATE_CONFIG[rate];
  return { maxIntervalSec: c.maxInterval, minDistanceMeters: c.minDistance };
}

export interface DecideInput {
  distanceMeters: number;
  dtSec: number;
  doseRateDeltaUSvH?: number;
  rate: SampleRateSpec;
}

export function decideShouldRecordPoint({
  distanceMeters,
  dtSec,
  doseRateDeltaUSvH,
  rate,
}: DecideInput): boolean {
  if (dtSec < HARD_FLOOR_SEC) return false;
  const c = resolve(rate);
  if (c.maxIntervalSec !== undefined && dtSec >= c.maxIntervalSec) return true;
  if (c.minDistanceMeters !== undefined && distanceMeters >= c.minDistanceMeters) return true;
  if (
    c.minDoseRateDeltaUSvH !== undefined &&
    doseRateDeltaUSvH !== undefined &&
    Math.abs(doseRateDeltaUSvH) >= c.minDoseRateDeltaUSvH
  ) {
    return true;
  }
  return false;
}
