'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { BarChart } from '@mui/x-charts/BarChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useCallback, useMemo, useRef, useState } from 'react';
import { NUCLIDES } from '../../common/strahlenschutz';
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
 * Trim trailing zero-count channels.
 * Returns the last meaningful index across all spectra + padding.
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
  return Math.min(maxIndex + 20, 1024);
}

/** Nuclides that have peak energies defined for matching. */
const MATCHABLE_NUCLIDES = NUCLIDES.filter(
  (n) => n.peaks && n.peaks.length > 0
);

export default function EnergySpectrum() {
  const [spectra, setSpectra] = useState<LoadedSpectrum[]>([]);
  const [logScale, setLogScale] = useState(false);
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

  // Collect all matched peak energies across all spectra for reference lines
  const matchedPeakEnergies = useMemo(() => {
    const peakMap = new Map<string, number>(); // label -> energy keV
    for (const s of spectra) {
      for (const match of s.matches) {
        for (const mp of match.matchedPeaks) {
          const label = `${match.nuclide.name} (${Math.round(mp.expected)} keV)`;
          peakMap.set(label, mp.found.energy);
        }
      }
    }
    return peakMap;
  }, [spectra]);

  // Build chart data: energy labels on X, one series per spectrum
  const chartData = useMemo(() => {
    if (spectra.length === 0 || displayRange === 0) return null;

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

  // Find closest energy band value for a given energy in keV
  const findClosestBandValue = useCallback(
    (targetKeV: number): number | undefined => {
      if (!chartData) return undefined;
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < chartData.energies.length; i++) {
        const dist = Math.abs(chartData.energies[i] - targetKeV);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      return chartData.energies[closestIdx];
    },
    [chartData]
  );

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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
        >
          XML-Datei(en) hochladen
        </Button>
        {spectra.length > 0 && (
          <FormControlLabel
            control={
              <Switch
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
                size="small"
              />
            }
            label="Logarithmisch"
          />
        )}
        <Tooltip
          title={
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Erkennbare Nuklide ({MATCHABLE_NUCLIDES.length})
              </Typography>
              {MATCHABLE_NUCLIDES.map((n) => (
                <Typography key={n.name} variant="caption" display="block">
                  {n.name}: {n.peaks!.join(', ')} keV
                </Typography>
              ))}
            </Box>
          }
          arrow
        >
          <IconButton size="small" color="info">
            <InfoOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>

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
                id: 'energy',
                data: chartData.energies,
                label: 'Energie (keV)',
                scaleType: 'band',
                tickLabelInterval: (_value: number, index: number) =>
                  index %
                    Math.max(
                      1,
                      Math.floor(chartData.energies.length / 20)
                    ) ===
                  0,
              },
            ]}
            yAxis={[
              {
                label: 'Counts',
                scaleType: logScale ? 'log' : 'linear',
                ...(logScale ? { min: 1 } : {}),
              },
            ]}
            series={chartData.series.map((s) => ({
              ...s,
              data: logScale
                ? s.data.map((v) => Math.max(v, 0.1))
                : s.data,
            }))}
            margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
          >
            {Array.from(matchedPeakEnergies.entries()).map(
              ([label, energy]) => {
                const bandValue = findClosestBandValue(energy);
                if (bandValue === undefined) return null;
                return (
                  <ChartsReferenceLine
                    key={label}
                    x={bandValue}
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
                );
              }
            )}
          </BarChart>
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
