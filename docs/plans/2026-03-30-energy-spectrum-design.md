# Energy Spectrum Viewer with Nuclide Identification

## Overview

New "Energiespektrum" tab on the Schadstoff page that allows users to upload RadiaCode-101 XML spectrum files, visualize the energy spectrum as a bar chart, and automatically identify the radioactive nuclide based on characteristic energy peaks.

## XML Format (RadiaCode-101)

- 1024 channels with count values
- Energy calibration: polynomial order 2 with 3 coefficients → `E(ch) = c0 + c1*ch + c2*ch²`
- Metadata: sample name, device, start/end time, measurement time, live time

## Architecture

### Data Flow

```
XML Upload → DOMParser → spectrumParser.ts → SpectrumData
                                                    ↓
                                          Peak detection (findPeaks)
                                                    ↓
                                          Nuclide matching (identifyNuclide)
                                                    ↓
                                          BarChart + Result display
```

### Files

| File | Purpose |
|------|---------|
| `src/common/spectrumParser.ts` | XML parser, peak detection, nuclide matching |
| `src/common/spectrumParser.test.ts` | Tests using example XML files |
| `src/components/pages/EnergySpectrum.tsx` | UI component for the new tab |
| `src/common/strahlenschutz.ts` | Extend `Nuclide` interface with `peaks` field |

### Nuclide Interface Extension

```ts
export interface Nuclide {
  name: string;
  gamma: number;      // existing: µSv·m²/(h·GBq)
  peaks?: number[];   // NEW: characteristic gamma energies in keV
}
```

### spectrumParser.ts

- `parseSpectrumXml(xml: string): SpectrumData` — parse RadiaCode XML
- `channelToEnergy(channel: number, coefficients: number[]): number` — energy calibration
- `findPeaks(counts: number[], energies: number[]): Peak[]` — local maxima detection
- `identifyNuclide(peaks: Peak[], nuclides: Nuclide[]): NuclideMatch[]` — match peaks against known nuclide energies (tolerance ~5-10 keV)

### EnergySpectrum.tsx

- Multi-file upload button
- `@mui/x-charts` BarChart: X = Energy (keV), Y = Counts
- Multiple spectra overlaid with different colors
- Vertical reference lines at identified nuclide peak energies
- Prominent display of identified nuclide name
- Compact metadata: sample name, measurement time, device
- Remove button per spectrum

### Integration

- New 3rd tab "Energiespektrum" in `Schadstoff.tsx`
- All processing client-side (no server/Firestore needed initially)
- Nuclide data stored locally in NUCLIDES array; can migrate to Firestore if data grows

## Decisions

- **Bar chart** (not line/area) for classic spectrum visualization
- **Multi-file overlay** for comparing spectra
- **Compact metadata** display (name, time, device)
- **Local nuclide DB** initially, extend existing NUCLIDES array with peaks
- **Client-side only** — no server upload needed
