import KDBush from 'kdbush';
import type { DataPoint, InterpolationAlgorithm } from './types';

interface IdwState {
  points: DataPoint[];
  power: number;
  index: KDBush;
  searchRadius: number;
}

function idwInterpolateFull(
  x: number,
  y: number,
  points: DataPoint[],
  power: number
): number {
  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = x - points[i].x;
    const dy = y - points[i].y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1e-10) return points[i].value;
    const weight = 1 / Math.pow(distSq, power / 2);
    weightSum += weight;
    valueSum += weight * points[i].value;
  }
  return weightSum > 0 ? valueSum / weightSum : 0;
}

/**
 * Standalone IDW interpolation for use outside the algorithm lifecycle
 * (e.g. click-handler value lookup).
 */
export function idwInterpolate(
  x: number,
  y: number,
  points: DataPoint[],
  power: number
): number {
  return idwInterpolateFull(x, y, points, power);
}

export const idwAlgorithm: InterpolationAlgorithm<IdwState> = {
  id: 'idw',
  label: 'IDW',
  description:
    'IDW (Inverse Distance Weighting): Gewichteter Durchschnitt – begrenzt auf den Wertebereich der Messpunkte. Gut für diskrete Messwerte.',
  params: [
    {
      key: 'power',
      label: 'Exponent',
      type: 'number',
      min: 1,
      max: 5,
      step: 0.5,
      default: 2,
    },
    {
      key: 'logScale',
      label: 'Logarithmische Interpolation',
      type: 'boolean',
      default: false,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): IdwState {
    const power = typeof params.power === 'number' ? params.power : 2;
    const index = new KDBush(points.length);
    for (let i = 0; i < points.length; i++) {
      index.add(points[i].x, points[i].y);
    }
    index.finish();
    // searchRadius is set later by the grid builder via a well-known key,
    // but we default to Infinity (full scan) if not provided.
    const searchRadius =
      typeof params._searchRadius === 'number' ? params._searchRadius : Infinity;
    return { points, power, index, searchRadius };
  },

  evaluate(x: number, y: number, state: IdwState): number {
    const { points, power, index, searchRadius } = state;
    if (searchRadius === Infinity || points.length <= 20) {
      return idwInterpolateFull(x, y, points, power);
    }
    const neighborIds = index.within(x, y, searchRadius);
    if (neighborIds.length === 0) {
      return idwInterpolateFull(x, y, points, power);
    }
    let weightSum = 0;
    let valueSum = 0;
    for (let i = 0; i < neighborIds.length; i++) {
      const pt = points[neighborIds[i]];
      const dx = x - pt.x;
      const dy = y - pt.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 1e-10) return pt.value;
      const weight = 1 / Math.pow(distSq, power / 2);
      weightSum += weight;
      valueSum += weight * pt.value;
    }
    return weightSum > 0 ? valueSum / weightSum : 0;
  },
};
