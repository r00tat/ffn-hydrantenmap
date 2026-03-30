# Energy Spectrum Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a third "Energiespektrum" tab to the Schadstoff page that parses RadiaCode-101 XML files, displays the energy spectrum as a bar chart, and automatically identifies the radioactive nuclide from characteristic peaks.

**Architecture:** Client-side XML parsing with native DOMParser, peak detection via local-maxima algorithm, nuclide matching against the existing NUCLIDES array (extended with peak energies). Chart rendered with `@mui/x-charts` BarChart. Multiple spectra can be overlaid for comparison.

**Tech Stack:** React 19, TypeScript, MUI, `@mui/x-charts` BarChart, native DOMParser, Vitest

---

### Task 1: Extend Nuclide interface with energy peaks

**Files:**
- Modify: `src/common/strahlenschutz.ts:326-352`

**Step 1: Add `peaks` field to the `Nuclide` interface and populate NUCLIDES**

In `src/common/strahlenschutz.ts`, update the interface and array:

```ts
export interface Nuclide {
  name: string;
  gamma: number; // µSv·m²/(h·GBq)
  peaks?: number[]; // characteristic gamma energies in keV
}

export const NUCLIDES: Nuclide[] = [
  { name: 'Am-241', gamma: 3.1, peaks: [59.5] },
  { name: 'Au-198', gamma: 62, peaks: [411.8] },
  { name: 'Ba-133', gamma: 52, peaks: [81, 276.4, 302.9, 356, 383.8] },
  { name: 'Co-57', gamma: 16, peaks: [122.1, 136.5] },
  { name: 'Co-60', gamma: 351, peaks: [1173.2, 1332.5] },
  { name: 'Cr-51', gamma: 5, peaks: [320.1] },
  { name: 'Cs-137', gamma: 92, peaks: [661.7] },
  { name: 'Eu-152', gamma: 168, peaks: [121.8, 244.7, 344.3, 778.9, 964.1, 1112.1, 1408] },
  { name: 'I-125', gamma: 17, peaks: [35.5] },
  { name: 'I-131', gamma: 66, peaks: [364.5] },
  { name: 'Ir-192', gamma: 130, peaks: [295.9, 308.5, 316.5, 468.1] },
  { name: 'Mn-54', gamma: 122, peaks: [834.8] },
  { name: 'Mo-99', gamma: 26, peaks: [140.5, 739.5] },
  { name: 'Na-22', gamma: 327, peaks: [511, 1274.5] },
  { name: 'Ra-226', gamma: 195, peaks: [186.2] },
  { name: 'Se-75', gamma: 56, peaks: [136, 264.7, 279.5, 400.7] },
  { name: 'Sr-90', gamma: 6 },  // pure beta, no gamma peaks
  { name: 'Tc-99m', gamma: 17, peaks: [140.5] },
  { name: 'Zn-65', gamma: 82, peaks: [1115.5] },
];
```

**Step 2: Verify existing tests still pass**

Run: `npm run test -- --run src/common/strahlenschutz.test.ts`
Expected: All existing tests PASS (adding optional field doesn't break anything)

**Step 3: Commit**

```bash
git add src/common/strahlenschutz.ts
git commit -m "feat: add characteristic energy peaks to Nuclide interface"
```

---

### Task 2: Create spectrum parser with tests (TDD)

**Files:**
- Create: `src/common/spectrumParser.ts`
- Create: `src/common/spectrumParser.test.ts`

**Step 1: Write failing tests for the XML parser**

Create `src/common/spectrumParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseSpectrumXml,
  channelToEnergy,
  findPeaks,
  identifyNuclides,
  type SpectrumData,
  type Peak,
} from './spectrumParser';

const AM241_XML = readFileSync(
  resolve(__dirname, '../../examples/Am-241.xml'),
  'utf-8'
);
const CS137_XML = readFileSync(
  resolve(__dirname, '../../examples/Cs-137.xml'),
  'utf-8'
);

describe('channelToEnergy', () => {
  const coefficients = [2.9903646, 2.3659527, 0.0003559];

  it('returns c0 for channel 0', () => {
    expect(channelToEnergy(0, coefficients)).toBeCloseTo(2.99, 1);
  });

  it('calculates energy for channel 25', () => {
    // E = 2.99 + 2.366*25 + 0.000356*625 = 62.36
    expect(channelToEnergy(25, coefficients)).toBeCloseTo(62.36, 0);
  });

  it('calculates energy for channel 278', () => {
    // E = 2.99 + 2.366*278 + 0.000356*77284 ≈ 688
    const e = channelToEnergy(278, coefficients);
    expect(e).toBeGreaterThan(650);
    expect(e).toBeLessThan(700);
  });
});

describe('parseSpectrumXml', () => {
  it('parses Am-241 sample name', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.sampleName).toBe('Am-241');
  });

  it('parses device name', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.deviceName).toBe('RadiaCode-101');
  });

  it('parses measurement time', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.measurementTime).toBe(36);
  });

  it('parses calibration coefficients', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.coefficients).toHaveLength(3);
    expect(data.coefficients[0]).toBeCloseTo(2.99, 1);
  });

  it('parses 1024 channels', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.counts).toHaveLength(1024);
  });

  it('parses Cs-137 correctly', () => {
    const data = parseSpectrumXml(CS137_XML);
    expect(data.sampleName).toBe('Cs-137');
    expect(data.counts).toHaveLength(1024);
  });

  it('computes energy array from calibration', () => {
    const data = parseSpectrumXml(AM241_XML);
    expect(data.energies).toHaveLength(1024);
    expect(data.energies[0]).toBeCloseTo(2.99, 1);
    expect(data.energies[1]).toBeGreaterThan(data.energies[0]);
  });
});

describe('findPeaks', () => {
  it('finds the Am-241 peak near 59.5 keV', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const am241Peak = peaks.find((p) => p.energy > 50 && p.energy < 70);
    expect(am241Peak).toBeDefined();
    expect(am241Peak!.energy).toBeCloseTo(59.5, -1); // within ~10 keV
  });

  it('finds the Cs-137 peak near 662 keV', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const csPeak = peaks.find((p) => p.energy > 620 && p.energy < 700);
    expect(csPeak).toBeDefined();
  });

  it('returns peaks sorted by counts descending', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i].counts).toBeLessThanOrEqual(peaks[i - 1].counts);
    }
  });
});

describe('identifyNuclides', () => {
  it('identifies Am-241 from its spectrum', () => {
    const data = parseSpectrumXml(AM241_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].nuclide.name).toBe('Am-241');
  });

  it('identifies Cs-137 from its spectrum', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].nuclide.name).toBe('Cs-137');
  });

  it('returns matches sorted by confidence descending', () => {
    const data = parseSpectrumXml(CS137_XML);
    const peaks = findPeaks(data.counts, data.energies);
    const matches = identifyNuclides(peaks);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].confidence).toBeLessThanOrEqual(
        matches[i - 1].confidence
      );
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- --run src/common/spectrumParser.test.ts`
Expected: FAIL — module not found

**Step 3: Create the spectrum parser implementation**

Create `src/common/spectrumParser.ts`:

```ts
import { NUCLIDES, type Nuclide } from './strahlenschutz';

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

/** Convert channel number to energy (keV) using polynomial calibration. */
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

/** Parse a RadiaCode-101 XML spectrum file. */
export function parseSpectrumXml(xml: string): SpectrumData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const getText = (tag: string): string =>
    doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

  const deviceName =
    doc
      .querySelector('DeviceConfigReference > Name')
      ?.textContent?.trim() ?? '';
  const sampleName =
    doc.querySelector('SampleInfo > Name')?.textContent?.trim() ?? '';
  const startTime = getText('StartTime');
  const endTime = getText('EndTime');
  const measurementTime = parseFloat(getText('MeasurementTime')) || 0;
  const liveTime = parseFloat(getText('LiveTime')) || 0;

  const coefficientEls = doc.querySelectorAll(
    'EnergyCalibration > Coefficients > Coefficient'
  );
  const coefficients = Array.from(coefficientEls).map((el) =>
    parseFloat(el.textContent?.trim() ?? '0')
  );

  const dataPointEls = doc.querySelectorAll('Spectrum > DataPoint');
  const counts = Array.from(dataPointEls).map((el) =>
    parseInt(el.textContent?.trim() ?? '0', 10)
  );

  const energies = counts.map((_, i) => channelToEnergy(i, coefficients));

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
 * Find peaks in spectrum data using local-maxima detection.
 * A peak must be a local maximum within a window and significantly
 * above the local background.
 */
export function findPeaks(
  counts: number[],
  energies: number[],
  options?: { windowSize?: number; minSignificance?: number }
): Peak[] {
  const windowSize = options?.windowSize ?? 5;
  const minSignificance = options?.minSignificance ?? 3;
  const peaks: Peak[] = [];

  for (let i = windowSize; i < counts.length - windowSize; i++) {
    const center = counts[i];
    if (center === 0) continue;

    // Check if local maximum
    let isMax = true;
    let sum = 0;
    let count = 0;
    for (let j = -windowSize; j <= windowSize; j++) {
      if (j === 0) continue;
      const neighbor = counts[i + j];
      if (neighbor > center) {
        isMax = false;
        break;
      }
      sum += neighbor;
      count++;
    }
    if (!isMax) continue;

    // Check significance: peak must be > minSignificance * stddev above mean
    const mean = sum / count;
    let variance = 0;
    for (let j = -windowSize; j <= windowSize; j++) {
      if (j === 0) continue;
      variance += Math.pow(counts[i + j] - mean, 2);
    }
    const stddev = Math.sqrt(variance / count);
    if (center <= mean + minSignificance * Math.max(stddev, 1)) continue;

    peaks.push({ channel: i, energy: energies[i], counts: center });
  }

  // Sort by counts descending
  peaks.sort((a, b) => b.counts - a.counts);
  return peaks;
}

/**
 * Match detected peaks against known nuclide energy signatures.
 * Returns matches sorted by confidence (descending).
 */
export function identifyNuclides(
  peaks: Peak[],
  toleranceKeV: number = 10,
  nuclides: Nuclide[] = NUCLIDES
): NuclideMatch[] {
  const matches: NuclideMatch[] = [];

  for (const nuclide of nuclides) {
    if (!nuclide.peaks || nuclide.peaks.length === 0) continue;

    const matchedPeaks: NuclideMatch['matchedPeaks'] = [];

    for (const expectedEnergy of nuclide.peaks) {
      const found = peaks.find(
        (p) => Math.abs(p.energy - expectedEnergy) <= toleranceKeV
      );
      if (found) {
        matchedPeaks.push({ expected: expectedEnergy, found });
      }
    }

    if (matchedPeaks.length === 0) continue;

    // Confidence: fraction of nuclide's peaks that were found,
    // weighted by the counts of matched peaks
    const fractionMatched = matchedPeaks.length / nuclide.peaks.length;
    const maxCounts = Math.max(...peaks.map((p) => p.counts), 1);
    const avgMatchStrength =
      matchedPeaks.reduce((s, m) => s + m.found.counts / maxCounts, 0) /
      matchedPeaks.length;
    const confidence = fractionMatched * 0.6 + avgMatchStrength * 0.4;

    matches.push({ nuclide, confidence, matchedPeaks });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- --run src/common/spectrumParser.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/common/spectrumParser.ts src/common/spectrumParser.test.ts
git commit -m "feat: spectrum XML parser with peak detection and nuclide identification"
```

---

### Task 3: Create EnergySpectrum UI component

**Files:**
- Create: `src/components/pages/EnergySpectrum.tsx`

**Step 1: Create the component**

Create `src/components/pages/EnergySpectrum.tsx`:

```tsx
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { BarChart } from '@mui/x-charts/BarChart';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  parseSpectrumXml,
  findPeaks,
  identifyNuclides,
  type SpectrumData,
  type NuclideMatch,
} from '../../common/spectrumParser';

/** MUI default color palette for series */
const SERIES_COLORS = [
  '#1976d2',
  '#d32f2f',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
  '#0288d1',
];

interface LoadedSpectrum {
  id: string;
  data: SpectrumData;
  matches: NuclideMatch[];
}

/**
 * Trim trailing zero-count channels and optionally limit to a max energy.
 * Returns the last meaningful index across all spectra.
 */
function getDisplayRange(spectra: LoadedSpectrum[]): number {
  let maxIndex = 0;
  for (const s of spectra) {
    for (let i = s.data.counts.length - 1; i >= 0; i--) {
      if (s.data.counts[i] > 0) {
        maxIndex = Math.max(maxIndex, i);
        break;
      }
    }
  }
  // Add some padding
  return Math.min(maxIndex + 20, 1024);
}

export default function EnergySpectrum() {
  const [spectra, setSpectra] = useState<LoadedSpectrum[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      const newSpectra: LoadedSpectrum[] = [];

      for (const file of Array.from(files)) {
        const text = await file.text();
        try {
          const data = parseSpectrumXml(text);
          const peaks = findPeaks(data.counts, data.energies);
          const matches = identifyNuclides(peaks);
          newSpectra.push({
            id: `${file.name}-${Date.now()}`,
            data,
            matches,
          });
        } catch (e) {
          console.error(`Failed to parse ${file.name}:`, e);
        }
      }

      setSpectra((prev) => [...prev, ...newSpectra]);
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    []
  );

  const removeSpectrum = useCallback((id: string) => {
    setSpectra((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const displayRange = useMemo(
    () => (spectra.length > 0 ? getDisplayRange(spectra) : 0),
    [spectra]
  );

  // Build chart data: energy labels on X, one series per spectrum
  const chartData = useMemo(() => {
    if (spectra.length === 0 || displayRange === 0) return null;

    // Use the first spectrum's energies as reference for X axis
    const energies = spectra[0].data.energies
      .slice(0, displayRange)
      .map((e) => Math.round(e * 10) / 10);

    const series = spectra.map((s, idx) => ({
      data: s.data.counts.slice(0, displayRange),
      label: s.data.sampleName || `Spektrum ${idx + 1}`,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }));

    return { energies, series };
  }, [spectra, displayRange]);

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Energiespektrum
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Lade eine oder mehrere XML-Dateien eines RadiaCode Spektrometers hoch,
        um das Energiespektrum darzustellen und das Nuklid automatisch zu
        identifizieren.
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
      <Button
        variant="contained"
        startIcon={<UploadFileIcon />}
        onClick={() => fileInputRef.current?.click()}
        sx={{ mb: 2 }}
      >
        XML-Datei(en) hochladen
      </Button>

      {/* Identification Results */}
      {spectra.length > 0 && (
        <List dense>
          {spectra.map((s, idx) => {
            const topMatch = s.matches[0];
            return (
              <ListItem
                key={s.id}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Entfernen"
                    onClick={() => removeSpectrum(s.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor:
                      SERIES_COLORS[idx % SERIES_COLORS.length],
                    mr: 1,
                    flexShrink: 0,
                  }}
                />
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{s.data.sampleName || 'Unbekannt'}</span>
                      {topMatch && (
                        <Chip
                          label={`${topMatch.nuclide.name} (${Math.round(topMatch.confidence * 100)}%)`}
                          color="success"
                          size="small"
                        />
                      )}
                      {!topMatch && (
                        <Chip
                          label="Nicht identifiziert"
                          color="warning"
                          size="small"
                        />
                      )}
                    </Box>
                  }
                  secondary={`${s.data.deviceName} · Messzeit: ${s.data.measurementTime}s`}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {/* Chart */}
      {chartData && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <BarChart
            height={400}
            xAxis={[
              {
                data: chartData.energies,
                label: 'Energie (keV)',
                scaleType: 'band',
                tickLabelInterval: (_value: number, index: number) =>
                  index % Math.max(1, Math.floor(chartData.energies.length / 20)) === 0,
              },
            ]}
            yAxis={[{ label: 'Counts' }]}
            series={chartData.series}
            margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
          />
        </Box>
      )}

      {/* Empty state */}
      {spectra.length === 0 && (
        <Box
          sx={{
            mt: 4,
            p: 4,
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary">
            Noch keine Spektren geladen. Lade eine XML-Datei hoch, um zu
            beginnen.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
```

**Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/pages/EnergySpectrum.tsx
git commit -m "feat: EnergySpectrum component with chart and nuclide identification"
```

---

### Task 4: Integrate tab into Schadstoff page

**Files:**
- Modify: `src/components/pages/Schadstoff.tsx`

**Step 1: Add the import and new tab**

In `src/components/pages/Schadstoff.tsx`:

1. Add import at top:
```ts
import EnergySpectrum from './EnergySpectrum';
```

2. Add third tab in the `<Tabs>` component (after line 91):
```tsx
<Tab label="Energiespektrum" {...a11yProps(2)} />
```

3. Add third `TabPanel` (after the Strahlenschutz TabPanel, after line 174):
```tsx
<TabPanel value={tabValue} index={2}>
  <EnergySpectrum />
</TabPanel>
```

**Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/pages/Schadstoff.tsx
git commit -m "feat: add Energiespektrum tab to Schadstoff page"
```

---

### Task 5: Run full check suite

**Step 1: Run full checks**

Run: `npm run check`
Expected: tsc, lint, tests, and build all pass

**Step 2: Fix any issues found**

Address lint warnings or type errors if any appear.

**Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/type issues from energy spectrum feature"
```
