export type DoseRateLevel = 'normal' | 'elevated' | 'high' | 'critical';

export const LEVEL_COLOR: Record<DoseRateLevel, string> = {
  normal: '#4caf50',
  elevated: '#ffeb3b',
  high: '#ff9800',
  critical: '#f44336',
};

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

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
