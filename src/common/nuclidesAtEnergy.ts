import { NUCLIDES, type Nuclide } from './strahlenschutz';
import { toleranceFor } from './spectrumParser';

/**
 * Single nuclide that has at least one gamma peak within the energy-dependent
 * match tolerance of the cursor. `distanceKev` is the absolute delta from the
 * queried energy to the nearest matching peak.
 */
export interface NuclideAtEnergy {
  nuclide: Nuclide;
  closestPeakKev: number;
  distanceKev: number;
  intensity: number;
}

/**
 * Return the list of nuclides whose strongest-in-window peak is within
 * `toleranceFor(energyKev)` of the cursor. Sorted by `distance / intensity`
 * so prominent, close matches rank above weak or far ones.
 */
export function nuclidesAtEnergy(energyKev: number): NuclideAtEnergy[] {
  const tolerance = toleranceFor(energyKev);
  const hits: NuclideAtEnergy[] = [];

  for (const nuclide of NUCLIDES) {
    if (!nuclide.peaks || nuclide.peaks.length === 0) continue;

    // Pick the closest peak within tolerance (if any).
    let best: { peakKev: number; dist: number; intensity: number } | null =
      null;
    for (const peak of nuclide.peaks) {
      const dist = Math.abs(peak.energy - energyKev);
      if (dist > tolerance) continue;
      if (!best || dist < best.dist) {
        best = { peakKev: peak.energy, dist, intensity: peak.intensity };
      }
    }

    if (best) {
      hits.push({
        nuclide,
        closestPeakKev: best.peakKev,
        distanceKev: best.dist,
        intensity: best.intensity,
      });
    }
  }

  // Rank: closer + more intense wins. Guard intensity>0 (all NUCLIDES peaks
  // have positive branching ratios, but be defensive).
  hits.sort((a, b) => {
    const ka = a.distanceKev / Math.max(a.intensity, 1e-6);
    const kb = b.distanceKev / Math.max(b.intensity, 1e-6);
    return ka - kb;
  });

  return hits;
}
