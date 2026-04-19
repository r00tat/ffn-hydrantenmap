import { unzipSync, strFromU8 } from 'fflate';
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

/**
 * Parse RadiaCode-110 spectrogram (.rcspg) text file.
 *
 * Format:
 *  - Line 1: tab-separated header fields (Spectrogram, Time, Timestamp,
 *    Accumulation time, Channels, Device serial, Flags, Comment)
 *  - Line 2: "Spectrum: " followed by space-separated hex bytes
 *    - 4 bytes flags/header
 *    - 3 × float32 LE calibration coefficients
 *    - N × uint32 LE channel counts (N from header "Channels")
 *  - Lines 3+: time-series deltas (ignored — cumulative spectrum is on line 2)
 */
export function parseSpectrogramRcspg(text: string): SpectrumData {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('rcspg: expected header and spectrum lines');
  }

  const headerFields: Record<string, string> = {};
  for (const field of lines[0].split('\t')) {
    const colon = field.indexOf(':');
    if (colon < 0) continue;
    headerFields[field.slice(0, colon).trim()] = field.slice(colon + 1).trim();
  }

  const sampleName = headerFields['Spectrogram'] ?? '';
  const deviceName = headerFields['Device serial'] ?? '';
  const accumulationTime = parseFloat(headerFields['Accumulation time'] ?? '0');
  const channels = parseInt(headerFields['Channels'] ?? '0', 10);

  // "2026-03-28  09:38:06" (double space) → "2026-03-28T09:38:06"
  const startTimeIso = (headerFields['Time'] ?? '').trim().replace(/\s+/, 'T');
  // Parse as UTC-style components to avoid local-timezone shifts when
  // round-tripping through Date; output in the same naive ISO form.
  const startUtcMs = Date.parse(startTimeIso + 'Z');
  const endTimeIso = isNaN(startUtcMs)
    ? ''
    : new Date(startUtcMs + accumulationTime * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '');

  const match = lines[1].match(/^Spectrum:\s*(.*)$/);
  if (!match) {
    throw new Error('rcspg: missing "Spectrum:" line');
  }
  const hexTokens = match[1].trim().split(/\s+/);
  const bytes = new Uint8Array(hexTokens.length);
  for (let i = 0; i < hexTokens.length; i++) {
    bytes[i] = parseInt(hexTokens[i], 16);
  }
  const expectedBytes = 16 + channels * 4;
  if (bytes.length < expectedBytes) {
    throw new Error(
      `rcspg: spectrum truncated (${bytes.length} bytes, expected ${expectedBytes})`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const coefficients = [
    view.getFloat32(4, true),
    view.getFloat32(8, true),
    view.getFloat32(12, true),
  ];
  const counts: number[] = new Array(channels);
  for (let i = 0; i < channels; i++) {
    counts[i] = view.getUint32(16 + i * 4, true);
  }
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));

  return {
    sampleName,
    deviceName,
    measurementTime: accumulationTime,
    liveTime: accumulationTime,
    startTime: startTimeIso,
    endTime: endTimeIso,
    coefficients,
    counts,
    energies,
  };
}

/**
 * Parse a RadiaCode iOS spectrogram `.rcspg` JSON export.
 *
 * Format (distinct from the Android tab/hex rcspg and from NPES-JSON):
 *  - title: sample name
 *  - channelCount: fixed channel count (typically 1024)
 *  - startTimeTimestamp: ms since epoch
 *  - deviceId: device serial
 *  - coefficients: [c0, c1, c2] as strings
 *  - spectrums: array of per-second slices `{collectTime, timestamp, pulses}`.
 *    The cumulative spectrum is the per-channel sum of `pulses` across slices.
 *    Each `pulses` array may be shorter than channelCount (trailing zeros
 *    are omitted).
 */
export function parseSpectrogramIosRcspg(text: string): SpectrumData {
  const doc = JSON.parse(text);
  if (
    !Array.isArray(doc?.spectrums) ||
    typeof doc?.channelCount !== 'number'
  ) {
    throw new Error('iOS rcspg: missing "spectrums" array or "channelCount"');
  }

  const channelCount: number = doc.channelCount;
  const sampleName: string = doc.title ?? '';
  const deviceName: string = doc.deviceId ?? '';

  const rawCoeffs: unknown[] = Array.isArray(doc.coefficients)
    ? doc.coefficients
    : [0, 1, 0];
  const coefficients = rawCoeffs.slice(0, 3).map((c) => Number(c));
  while (coefficients.length < 3) coefficients.push(0);

  const counts = new Array<number>(channelCount).fill(0);
  let totalCollectTime = 0;
  for (const slice of doc.spectrums) {
    totalCollectTime += Number(slice?.collectTime ?? 0);
    const pulses = Array.isArray(slice?.pulses) ? slice.pulses : [];
    const n = Math.min(pulses.length, channelCount);
    for (let i = 0; i < n; i++) {
      counts[i] += Number(pulses[i]) || 0;
    }
  }

  const startMs = Number(doc.startTimeTimestamp);
  const startTime = Number.isFinite(startMs)
    ? new Date(startMs).toISOString().replace(/\.\d{3}Z$/, '')
    : '';
  const endTime = Number.isFinite(startMs)
    ? new Date(startMs + totalCollectTime * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '')
    : '';

  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));

  return {
    sampleName,
    deviceName,
    measurementTime: totalCollectTime,
    liveTime: totalCollectTime,
    startTime,
    endTime,
    coefficients,
    counts,
    energies,
  };
}

/**
 * Parse a RadiaCode iOS spectrum export in NPES-JSON v2 format.
 * Schema: https://github.com/OpenGammaProject/NPES-JSON
 */
export function parseSpectrumNpesJson(text: string): SpectrumData {
  const doc = JSON.parse(text);
  if (doc?.schemaVersion !== 'NPESv2') {
    throw new Error('NPES-JSON: expected schemaVersion "NPESv2"');
  }
  const first = doc.data?.[0];
  if (!first?.resultData?.energySpectrum) {
    throw new Error('NPES-JSON: missing resultData.energySpectrum');
  }
  const es = first.resultData.energySpectrum;
  const counts: number[] = (es.spectrum ?? []).map((n: unknown) => Number(n));
  if (typeof es.numberOfChannels === 'number' && es.numberOfChannels !== counts.length) {
    throw new Error(
      `NPES-JSON: numberOfChannels (${es.numberOfChannels}) does not match spectrum length (${counts.length})`,
    );
  }
  const rawCoeffs: number[] = es.energyCalibration?.coefficients ?? [0, 1, 0];
  const coefficients = rawCoeffs.map((c) => Number(c));
  const measurementTime = Number(es.measurementTime ?? 0);
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));

  return {
    sampleName: first.sampleInfo?.name ?? '',
    deviceName: first.deviceData?.deviceName ?? '',
    measurementTime,
    liveTime: measurementTime,
    startTime: first.resultData.startTime ?? '',
    endTime: first.resultData.endTime ?? '',
    coefficients,
    counts,
    energies,
  };
}

/**
 * Extract `{ measurementTime, startTime }` from a RadiaCode CSV filename.
 * Expected pattern: `Spectrum_<YYYY-MM-DD>_<HH-MMSS>_<seconds>s.csv`
 * Example:          `Spectrum_2021-05-12_13-5355_1426s.csv`
 * Each field is optional — unmatched parts return defaults.
 */
function parseCsvFilenameMetadata(
  filename: string,
): { measurementTime: number; startTime: string; sampleName: string } {
  const stem = filename.replace(/\.[^./\\]+$/, '').replace(/^.*[/\\]/, '');
  const durMatch = stem.match(/_(\d+)s$/);
  const measurementTime = durMatch ? parseInt(durMatch[1], 10) : 0;

  // Date "YYYY-MM-DD" and time "HH-MMSS" (dash splits hours from min+sec).
  const dtMatch = stem.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})(\d{2})/);
  let startTime = '';
  if (dtMatch) {
    const [, date, hh, mm, ss] = dtMatch;
    startTime = `${date}T${hh}:${mm}:${ss}`;
  }

  const sampleName = durMatch ? stem.slice(0, durMatch.index) : stem;
  return { measurementTime, startTime, sampleName };
}

/**
 * Parse a RadiaCode CSV spectrum export.
 * Format: one `channel,counts` pair per line. Lines starting with `#` and
 * blank lines are ignored. The CSV itself has no metadata — calibration,
 * measurement time and timestamps are derived from the filename where
 * possible (see `parseCsvFilenameMetadata`) and default to a RadiaCode-110
 * baseline of (0, 3, 0) keV/channel otherwise.
 */
export function parseSpectrumCsv(text: string, filename?: string): SpectrumData {
  const counts: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const v = parseInt(parts[1].trim(), 10);
    counts.push(Number.isFinite(v) ? v : 0);
  }

  const meta = filename
    ? parseCsvFilenameMetadata(filename)
    : { measurementTime: 0, startTime: '', sampleName: '' };

  const coefficients = [0, 3, 0];
  const energies = counts.map((_, ch) => channelToEnergy(ch, coefficients));

  let endTime = '';
  if (meta.startTime && meta.measurementTime > 0) {
    const startMs = Date.parse(meta.startTime + 'Z');
    if (!Number.isNaN(startMs)) {
      endTime = new Date(startMs + meta.measurementTime * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '');
    }
  }

  return {
    sampleName: meta.sampleName,
    deviceName: '',
    measurementTime: meta.measurementTime,
    liveTime: meta.measurementTime,
    startTime: meta.startTime,
    endTime,
    coefficients,
    counts,
    energies,
  };
}

/** ZIP local-file-header magic bytes (`PK\x03\x04`). */
function isZipArchive(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Extract the first spectrum-bearing member (.rcspg / .xml / .json / .csv)
 * from a ZIP archive and return it as UTF-8 text along with the inner
 * filename (used for CSV metadata). zrcspg and zrcsp are simple ZIP
 * containers around a single rcspg/xml document.
 */
function unpackZipSpectrum(bytes: Uint8Array): { text: string; name: string } {
  const entries = unzipSync(bytes);
  for (const [name, data] of Object.entries(entries)) {
    if (/\.(rcspg|xml|json|csv)$/i.test(name)) {
      return { text: strFromU8(data), name };
    }
  }
  throw new Error('ZIP archive contains no recognised spectrum file');
}

/**
 * Dispatch to the right parser based on content.
 * Accepts:
 *  - RadiaCode XML exports
 *  - RadiaCode spectrogram (.rcspg) text
 *  - NPES-JSON v2 (RadiaCode iOS export)
 *  - RadiaCode CSV exports (metadata derived from filename when provided)
 *  - ZIP archives (.zrcspg / .zrcsp) containing any of the above
 *
 * `filename` is optional but lets the CSV parser recover the measurement
 * time and timestamp which are not present in the file content itself.
 */
export function parseSpectrumFile(
  input: string | ArrayBuffer | Uint8Array,
  filename?: string,
): SpectrumData {
  let text: string;
  let innerName = filename;

  if (typeof input === 'string') {
    text = input;
  } else {
    const bytes =
      input instanceof Uint8Array ? input : new Uint8Array(input);
    if (isZipArchive(bytes)) {
      const unpacked = unpackZipSpectrum(bytes);
      text = unpacked.text;
      innerName = unpacked.name;
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }
  }

  const head = text.trimStart();
  if (head.startsWith('<')) {
    return parseSpectrumXml(text);
  }
  if (head.startsWith('Spectrogram:')) {
    return parseSpectrogramRcspg(text);
  }
  if (head.startsWith('{')) {
    const doc = JSON.parse(text);
    if (Array.isArray(doc?.spectrums) && typeof doc?.channelCount === 'number') {
      return parseSpectrogramIosRcspg(text);
    }
    return parseSpectrumNpesJson(text);
  }
  if (/^\s*\d+\s*,\s*\d+/m.test(head)) {
    return parseSpectrumCsv(text, innerName);
  }
  throw new Error('Unknown spectrum format (expected XML, rcspg, NPES-JSON or CSV)');
}

export interface FindPeaksOptions {
  windowSize?: number;
  significance?: number;
  /**
   * Minimum energy in keV to consider for peaks (filters low-energy noise).
   * Default: 40 keV — keeps Am-241 (59.5 keV) and Ba-133 (81 keV) in range.
   * Electronic noise dominates below ~30 keV on CsI(Tl); callers analysing
   * spectra with I-125 (35.5 keV) or other sub-40-keV emitters must lower
   * this via options, and callers looking at clean mid-/high-energy sources
   * can raise it to cut low-energy noise.
   */
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
    //   (a nuclide that explains the dominant peak scores higher).
    //   Future improvement: normalise by signal-to-background ratio instead of
    //   peaks[0].counts. Current formula under-rates trace nuclides in mixed
    //   spectra (e.g. weak Co-60 alongside dominant Cs-137). A proper SNR
    //   scoring `(counts - bg) / √bg` per matched peak would require reworking
    //   this block to take background estimates, not just counts — kept as-is
    //   until mixed-source spectra exist as test fixtures. See
    //   docs/spectrum-detection.md § Future Improvements.
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
