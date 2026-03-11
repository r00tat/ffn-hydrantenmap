import { HeatmapConfig } from '../components/firebase/firestore';

/**
 * Interpolate between color stops. Colors are hex strings.
 */
function interpolateColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const DEFAULT_COLOR_STOPS = [
  { value: 0, color: '#00ff00' },   // green (low)
  { value: 0.5, color: '#ffff00' }, // yellow (mid)
  { value: 1, color: '#ff0000' },   // red (high)
];

const DEFAULT_COLOR_STOPS_INVERTED = [
  { value: 0, color: '#ff0000' },   // red (low)
  { value: 0.5, color: '#ffff00' }, // yellow (mid)
  { value: 1, color: '#00ff00' },   // green (high)
];

const NO_DATA_COLOR = '#999999';

/**
 * Get heatmap color for a value given config and all values in the layer.
 * Returns a hex color string.
 */
export function getHeatmapColor(
  value: number | undefined,
  config: HeatmapConfig,
  allValues: number[]
): string {
  if (value === undefined || value === null) {
    return NO_DATA_COLOR;
  }

  let min: number;
  let max: number;
  let stops: { value: number; color: string }[];

  if (config.colorMode === 'manual' && config.min !== undefined && config.max !== undefined && config.colorStops && config.colorStops.length >= 2) {
    min = config.min;
    max = config.max;
    stops = [...config.colorStops].sort((a, b) => a.value - b.value);
  } else {
    // Auto mode (or manual fallback)
    if (allValues.length === 0) return NO_DATA_COLOR;
    min = allValues.reduce((a, b) => Math.min(a, b), Infinity);
    max = allValues.reduce((a, b) => Math.max(a, b), -Infinity);
    // All identical -> midpoint color (yellow)
    if (min === max) return '#ffff00';
    const baseStops = config.invertAutoColor ? DEFAULT_COLOR_STOPS_INVERTED : DEFAULT_COLOR_STOPS;
    stops = baseStops.map((s) => ({
      value: min + s.value * (max - min),
      color: s.color,
    }));
  }

  if (max === min) return stops[0]?.color ?? NO_DATA_COLOR;

  // Clamp value
  const clamped = Math.max(min, Math.min(max, value));

  // Find surrounding stops
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].value && clamped <= stops[i + 1].value) {
      const range = stops[i + 1].value - stops[i].value;
      const t = range === 0 ? 0 : (clamped - stops[i].value) / range;
      return interpolateColor(stops[i].color, stops[i + 1].color, t);
    }
  }

  // Edge case: value at or beyond last stop
  return stops[stops.length - 1].color;
}

/**
 * Normalize a value to 0-1 range for heatmap overlay intensity.
 */
export function normalizeValue(
  value: number,
  config: HeatmapConfig,
  allValues: number[]
): number {
  let min: number;
  let max: number;

  if (config.colorMode === 'manual' && config.min !== undefined && config.max !== undefined) {
    min = config.min;
    max = config.max;
  } else {
    min = allValues.reduce((a, b) => Math.min(a, b), Infinity);
    max = allValues.reduce((a, b) => Math.max(a, b), -Infinity);
  }

  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
