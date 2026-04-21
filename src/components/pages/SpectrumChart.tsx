'use client';

import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useMemo } from 'react';
import {
  channelToEnergy,
  findPeaks,
  identifyNuclides,
  type SpectrumData,
  type NuclideMatch,
} from '../../common/spectrumParser';
import { type Spectrum } from '../firebase/firestore';
import ZoomableSpectrumChart from './ZoomableSpectrumChart';

const SERIES_COLORS = [
  '#1976d2',
  '#d32f2f',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
  '#0288d1',
];

interface LoadedSpectrum {
  data: SpectrumData;
  matches: NuclideMatch[];
}

/**
 * Trim trailing zero-count channels.
 * Returns the last meaningful index across all spectra + padding.
 */
function getDisplayRange(data: { counts: number[] }[]): number {
  let maxIndex = 0;
  for (const s of data) {
    for (let i = s.counts.length - 1; i >= 0; i--) {
      if (s.counts[i] > 0) {
        maxIndex = Math.max(maxIndex, i);
        break;
      }
    }
  }
  return Math.min(maxIndex + 20, 1024);
}

export interface SpectrumChartProps {
  spectra: Spectrum[];
  height?: number;
}

export default function SpectrumChart({
  spectra,
  height = 400,
}: SpectrumChartProps) {
  const loadedSpectra = useMemo<LoadedSpectrum[]>(() => {
    return spectra
      .filter((s) => s.counts?.length > 0)
      .map((saved) => {
        const energies = saved.counts.map((_, ch) =>
          channelToEnergy(ch, saved.coefficients)
        );
        const dataWithEnergies: SpectrumData = {
          sampleName: saved.sampleName,
          deviceName: saved.deviceName,
          measurementTime: saved.measurementTime,
          liveTime: saved.liveTime,
          startTime: saved.startTime,
          endTime: saved.endTime,
          coefficients: saved.coefficients,
          counts: saved.counts,
          energies,
        };
        const peaks = findPeaks(dataWithEnergies.counts, energies);
        const matches = identifyNuclides(peaks);
        return { data: dataWithEnergies, matches };
      });
  }, [spectra]);

  const displayRange = useMemo(
    () => (loadedSpectra.length > 0 ? getDisplayRange(loadedSpectra.map((s) => s.data)) : 0),
    [loadedSpectra]
  );

  const matchedPeakEnergies = useMemo(() => {
    const peakMap = new Map<string, number>();
    for (const s of loadedSpectra) {
      for (const match of s.matches) {
        for (const mp of match.matchedPeaks) {
          const label = `${match.nuclide.name} (${Math.round(mp.expected)} keV)`;
          peakMap.set(label, mp.found.energy);
        }
      }
    }
    return peakMap;
  }, [loadedSpectra]);

  const chartData = useMemo(() => {
    if (loadedSpectra.length === 0 || displayRange === 0) return null;

    const energies = loadedSpectra[0].data.energies
      .slice(0, displayRange)
      .map((e) => Math.round(e * 10) / 10);

    const series = loadedSpectra.map((s, idx) => ({
      data: s.data.counts.slice(0, displayRange),
      label: s.data.sampleName || `Spektrum ${idx + 1}`,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }));

    return { energies, series };
  }, [loadedSpectra, displayRange]);

  if (!chartData) return null;

  const overlays = Array.from(matchedPeakEnergies.entries()).map(
    ([label, energy]) => (
      <ChartsReferenceLine
        key={label}
        x={energy}
        label={label}
        lineStyle={{
          stroke: '#d32f2f',
          strokeWidth: 1.5,
          strokeDasharray: '4 2',
        }}
        labelStyle={{
          fontSize: 10,
          fill: '#d32f2f',
          fontWeight: 'bold',
        }}
      />
    ),
  );

  return (
    <ZoomableSpectrumChart
      height={height}
      energies={chartData.energies}
      series={chartData.series.map((s) => ({ ...s, area: true }))}
      overlays={overlays}
    />
  );
}
