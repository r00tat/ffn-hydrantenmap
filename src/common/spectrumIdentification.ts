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
