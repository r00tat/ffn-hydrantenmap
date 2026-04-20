export type SampleRate = 'niedrig' | 'normal' | 'hoch';

export interface SampleRateConfig {
  minDistance: number;
  minInterval: number;
  maxInterval: number;
}

export const RATE_CONFIG: Record<SampleRate, SampleRateConfig> = {
  niedrig: { minDistance: 10, minInterval: 1, maxInterval: 30 },
  normal: { minDistance: 5, minInterval: 1, maxInterval: 15 },
  hoch: { minDistance: 2, minInterval: 1, maxInterval: 5 },
};

export interface RadiacodeMeasurement {
  dosisleistung: number;
  cps: number;
  timestamp: number;
}

export interface RadiacodeDeviceRef {
  id: string;
  name: string;
  serial: string;
}
