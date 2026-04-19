import { type Nuclide, NUCLIDES } from './strahlenschutz';

export interface SpectrumData {
  sampleName: string;
  deviceName: string;
  measurementTime: number; // seconds
  liveTime: number;
  startTime: string;
  endTime: string;
  coefficients: number[]; // energy calibration polynomial
  counts: number[]; // raw channel counts
  energies: number[]; // computed energy per channel (keV)
}

export interface Peak {
  channel: number;
  energy: number; // keV
  counts: number;
}

export interface NuclideMatch {
  nuclide: Nuclide;
  confidence: number; // 0-1
  matchedPeaks: { expected: number; found: Peak }[];
}

/**
 * Evaluate polynomial calibration: E(ch) = c0 + c1*ch + c2*ch² + ...
 */
export function channelToEnergy(
  channel: number,
  coefficients: number[]
): number {
  let energy = 0;
  for (let i = 0; i < coefficients.length; i++) {
    energy += coefficients[i] * Math.pow(channel, i);
  }
  return energy;
}

/**
 * Approximate FWHM of a CsI(Tl) scintillator at the given energy.
 * Poisson-limited statistics give FWHM ∝ √E; 12% @ 662 keV is the
 * RadiaCode-101 reference point.
 */
export function fwhmAt(
  energyKeV: number,
  referenceResolution: number = 0.12,
  referenceEnergy: number = 662,
): number {
  return referenceResolution * Math.sqrt(referenceEnergy * energyKeV);
}

/**
 * Energy-dependent match tolerance. Defaults to HWHM for CsI(Tl) with a
 * 5 keV floor so very low energies remain matchable despite small FWHM.
 */
export function toleranceFor(energyKeV: number): number {
  return Math.max(5, 0.5 * fwhmAt(energyKeV));
}

/**
 * Parse RadiaCode-101 XML spectrum file.
 */
export function parseSpectrumXml(xml: string): SpectrumData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const getText = (parent: Document | Element, tag: string): string => {
    const el = parent.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() ?? '';
  };

  const resultData = doc.getElementsByTagName('ResultData')[0];

  const deviceName = getText(
    resultData.getElementsByTagName('DeviceConfigReference')[0],
    'Name'
  );
  const sampleName = getText(
    resultData.getElementsByTagName('SampleInfo')[0],
    'Name'
  );
  const startTime = getText(resultData, 'StartTime');
  const endTime = getText(resultData, 'EndTime');

  const energySpectrum = resultData.getElementsByTagName('EnergySpectrum')[0];
  const measurementTime = parseFloat(getText(energySpectrum, 'MeasurementTime'));
  const liveTime = parseFloat(getText(energySpectrum, 'LiveTime'));

  // Parse calibration coefficients
  const coefficientElements =
    energySpectrum.getElementsByTagName('Coefficient');
  const coefficients: number[] = [];
  for (let i = 0; i < coefficientElements.length; i++) {
    coefficients.push(parseFloat(coefficientElements[i].textContent ?? '0'));
  }

  // Parse spectrum data points
  const dataPointElements = energySpectrum.getElementsByTagName('DataPoint');
  const counts: number[] = [];
  for (let i = 0; i < dataPointElements.length; i++) {
    counts.push(parseInt(dataPointElements[i].textContent ?? '0', 10));
  }

  // Compute energies
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));

  return {
    sampleName,
    deviceName,
    measurementTime,
    liveTime,
    startTime,
    endTime,
    coefficients,
    counts,
    energies,
  };
}

export interface FindPeaksOptions {
  windowSize?: number;
  significance?: number;
  /** Minimum energy in keV to consider for peaks (filters low-energy noise). Default: 40 */
  minEnergy?: number;
}

/**
 * Smooth counts using a simple moving average.
 */
function smoothCounts(counts: number[], radius: number): number[] {
  const smoothed = new Array(counts.length);
  for (let i = 0; i < counts.length; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(counts.length - 1, i + radius);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += counts[j];
    }
    smoothed[i] = sum / (end - start + 1);
  }
  return smoothed;
}

/**
 * Find peaks (local maxima) in spectrum data.
 * Uses smoothed data for peak finding and original data for significance testing.
 * Returns peaks sorted by counts descending.
 */
export function findPeaks(
  counts: number[],
  energies: number[],
  options?: FindPeaksOptions
): Peak[] {
  const windowSize = options?.windowSize ?? 5;
  const significance = options?.significance ?? 3;
  const minEnergy = options?.minEnergy ?? 40;
  const halfWindow = Math.floor(windowSize / 2);
  const peaks: Peak[] = [];

  // Smooth the spectrum for robust peak detection
  const smoothed = smoothCounts(counts, halfWindow);

  // Find the first channel at or above minEnergy
  let startChannel = halfWindow;
  for (let i = halfWindow; i < energies.length; i++) {
    if (energies[i] >= minEnergy) {
      startChannel = i;
      break;
    }
  }

  for (let i = startChannel; i < counts.length - halfWindow; i++) {
    const current = smoothed[i];
    if (current === 0) continue;

    // Check if local maximum in smoothed data. Use strict greater-than so a
    // flat plateau (common around sharp single-bin peaks after smoothing)
    // does not disqualify the centre bin.
    let isMax = true;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j !== i && smoothed[j] >= current) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;

    // Significance check: compare smoothed peak against background estimate
    // Use regions well away from the peak for background estimation
    const exclusionRadius = Math.max(halfWindow * 6, 15);
    const bgWindow = exclusionRadius * 3;
    const start = Math.max(0, i - bgWindow);
    const end = Math.min(counts.length, i + bgWindow + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      if (Math.abs(j - i) > exclusionRadius) {
        sum += counts[j];
        count++;
      }
    }
    if (count === 0) continue;
    const mean = sum / count;
    // Poisson statistics: σ = √B (background counts follow a Poisson
    // distribution, not a normal sample distribution). Clamp to ≥1 to
    // avoid a zero-σ degenerate case for empty regions.
    const sigma = Math.sqrt(Math.max(mean, 1));

    // Apply the significance test to the raw peak-bin count (Poisson σ is
    // about bin-level counts, and smoothing would dilute a narrow peak).
    if (current > mean + significance * sigma) {
      peaks.push({
        channel: i,
        energy: energies[i],
        counts: counts[i],
      });
    }
  }

  // Sort by counts descending
  peaks.sort((a, b) => b.counts - a.counts);
  return peaks;
}

/**
 * Match detected peaks against known nuclide gamma energies.
 * Returns matches sorted by confidence descending.
 */
export function identifyNuclides(
  peaks: Peak[],
  toleranceKeV?: number,
  nuclides: Nuclide[] = NUCLIDES,
): NuclideMatch[] {
  const matches: NuclideMatch[] = [];
  const maxPeakCounts = peaks.length > 0 ? peaks[0].counts : 1;

  for (const nuclide of nuclides) {
    if (!nuclide.peaks || nuclide.peaks.length === 0) continue;

    const matchedPeaks: { expected: number; found: Peak }[] = [];

    for (const { energy: expectedEnergy } of nuclide.peaks) {
      const tolerance = toleranceKeV ?? toleranceFor(expectedEnergy);
      // Find closest peak within tolerance
      let bestPeak: Peak | null = null;
      let bestDistance = tolerance;

      for (const peak of peaks) {
        const distance = Math.abs(peak.energy - expectedEnergy);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPeak = peak;
        }
      }

      if (bestPeak) {
        matchedPeaks.push({ expected: expectedEnergy, found: bestPeak });
      }
    }

    if (matchedPeaks.length === 0) continue;

    // Confidence scoring:
    // - intensityMatched: matched branching-ratio intensity normalised against
    //   max(totalIntensity, 1.0). The floor of 1.0 photon-per-decay prevents
    //   nuclides with very weak total branches (e.g. Ra-226 @ 3.6%) from
    //   scoring a full 1.0 on a single low-confidence line. Nuclides with
    //   ≥1 photon/decay in total are normalised as before.
    // - avgStrength: how strong matched peaks are relative to the strongest peak
    //   (a nuclide that explains the dominant peak scores higher)
    // - avgAccuracy: how close the matches are relative to per-peak tolerance
    const totalIntensity = nuclide.peaks.reduce((s, p) => s + p.intensity, 0);
    const matchedIntensity = matchedPeaks.reduce((s, mp) => {
      const np = nuclide.peaks!.find((p) => p.energy === mp.expected);
      return s + (np?.intensity ?? 0);
    }, 0);
    const intensityMatched = matchedIntensity / Math.max(totalIntensity, 1.0);

    const avgStrength =
      matchedPeaks.reduce((sum, mp) => sum + mp.found.counts, 0) /
      matchedPeaks.length /
      maxPeakCounts;
    const avgAccuracy =
      1 -
      matchedPeaks.reduce(
        (sum, mp) =>
          sum +
          Math.abs(mp.found.energy - mp.expected) /
            (toleranceKeV ?? toleranceFor(mp.expected)),
        0,
      ) / matchedPeaks.length;

    const confidence =
      0.40 * intensityMatched + 0.45 * avgStrength + 0.15 * avgAccuracy;

    matches.push({ nuclide, confidence, matchedPeaks });
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}
