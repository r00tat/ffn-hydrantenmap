export type DoseRateLevel = 'normal' | 'elevated' | 'high' | 'critical';

export interface FormattedValue {
  value: string;
  unit: string;
}

export function formatDoseRate(microSvPerHour: number): FormattedValue {
  if (microSvPerHour >= 1000) {
    return { value: (microSvPerHour / 1000).toFixed(2), unit: 'mSv/h' };
  }
  return { value: microSvPerHour.toFixed(2), unit: 'µSv/h' };
}

export function formatDose(microSv: number): FormattedValue {
  if (microSv >= 1000) {
    return { value: (microSv / 1000).toFixed(2), unit: 'mSv' };
  }
  return { value: microSv.toFixed(2), unit: 'µSv' };
}

export function doseRateLevel(microSvPerHour: number): DoseRateLevel {
  if (microSvPerHour < 1) return 'normal';
  if (microSvPerHour < 10) return 'elevated';
  if (microSvPerHour < 100) return 'high';
  return 'critical';
}
