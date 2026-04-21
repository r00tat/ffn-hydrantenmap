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
  dosisleistung: number; // µSv/h
  cps: number;
  timestamp: number;
  dose?: number; // µSv, Geräte-Akkumulator (optional)
  temperatureC?: number; // °C (optional, aus RareRecord)
  chargePct?: number; // 0..100 (optional, aus RareRecord)
}

export interface RadiacodeDeviceRef {
  id: string;
  name: string;
  serial: string;
}
