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
  dosisleistungErrPct?: number; // relative Messunsicherheit Dosisleistung, %
  cpsErrPct?: number; // relative Messunsicherheit Zählrate, %
  dose?: number; // µSv, Geräte-Akkumulator (optional)
  durationSec?: number; // Sekunden, über die `dose` akkumuliert wurde
  temperatureC?: number; // °C (optional, aus RareRecord)
  chargePct?: number; // 0..100 (optional, aus RareRecord)
}

export interface RadiacodeDeviceRef {
  id: string;
  name: string;
  serial: string;
}

export interface RadiacodeDeviceInfo {
  /** Target-Firmware, z.B. "4.14" */
  firmwareVersion: string;
  /** Bootloader-Firmware, z.B. "4.1" */
  bootVersion: string;
  /** Target-Build-Datum, wie vom Gerät gemeldet */
  firmwareDate?: string;
  /** HW-Seriennummer, formatiert als Hex-Gruppen */
  hardwareSerial: string;
  /** Modellbezeichnung aus FW_SIGNATURE, z.B. "RadiaCode RC-103" */
  model?: string;
}
