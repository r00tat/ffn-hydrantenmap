import { SampleRateConfig } from './types';

export interface SampleGateInput {
  distanceMeters: number;
  secondsSinceLast: number;
  config: SampleRateConfig;
}

export function shouldSamplePoint({
  distanceMeters,
  secondsSinceLast,
  config,
}: SampleGateInput): boolean {
  if (secondsSinceLast < config.minInterval) return false;
  if (secondsSinceLast >= config.maxInterval) return true;
  return distanceMeters >= config.minDistance;
}
