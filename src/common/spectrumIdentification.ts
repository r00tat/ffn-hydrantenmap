import { findPeaks, identifyNuclides, channelToEnergy } from './spectrumParser';

export interface AutoMatch {
  name: string;
  confidence: number;
}

export type SpectrumIdentification =
  | { displayName: null; source: 'none' }
  | { displayName: string; source: 'auto'; confidence: number }
  | {
      displayName: string;
      source: 'manual';
      autoAlt?: AutoMatch;
    };

/**
 * Resolve which nuclide to display for a spectrum. A manual assignment always
 * wins over the auto match. If auto disagrees with the manual choice, it is
 * surfaced as `autoAlt` so the user still sees the competing suggestion.
 */
export function resolveSpectrumIdentification(
  manualNuclide: string | undefined,
  autoMatch: AutoMatch | undefined
): SpectrumIdentification {
  if (manualNuclide && manualNuclide.length > 0) {
    if (autoMatch && autoMatch.name !== manualNuclide) {
      return {
        displayName: manualNuclide,
        source: 'manual',
        autoAlt: autoMatch,
      };
    }
    return { displayName: manualNuclide, source: 'manual' };
  }
  if (autoMatch) {
    return {
      displayName: autoMatch.name,
      source: 'auto',
      confidence: autoMatch.confidence,
    };
  }
  return { displayName: null, source: 'none' };
}

export type LiveIdentification =
  | { state: 'insufficient'; total: number }
  | { state: 'none'; total: number }
  | { state: 'match'; nuclide: string; confidence: number; total: number };

const MIN_COUNTS_FOR_IDENTIFICATION = 1000;
const MIN_CONFIDENCE = 0.3;

export function runLiveIdentification(
  counts: number[],
  coefficients: number[],
): LiveIdentification {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < MIN_COUNTS_FOR_IDENTIFICATION)
    return { state: 'insufficient', total };
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));
  const peaks = findPeaks(counts, energies);
  const matches = identifyNuclides(peaks);
  const best = matches[0];
  if (!best || best.confidence < MIN_CONFIDENCE)
    return { state: 'none', total };
  return {
    state: 'match',
    nuclide: best.nuclide.name,
    confidence: best.confidence,
    total,
  };
}
