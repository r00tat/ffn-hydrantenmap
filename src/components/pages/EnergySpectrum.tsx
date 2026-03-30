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
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
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
  visible: boolean;
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
            visible: true,
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

  const toggleVisibility = useCallback((id: string) => {
    setSpectra((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  }, []);

  const removeSpectrum = useCallback((id: string) => {
    setSpectra((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const visibleSpectra = useMemo(
    () => spectra.filter((s) => s.visible),
    [spectra]
  );

  const displayRange = useMemo(
    () => (visibleSpectra.length > 0 ? getDisplayRange(visibleSpectra) : 0),
    [visibleSpectra]
  );

  // Collect matched peak energies from visible spectra for reference lines
  const matchedPeakEnergies = useMemo(() => {
    const peakMap = new Map<string, number>(); // label -> energy keV
    for (const s of visibleSpectra) {
      for (const match of s.matches) {
        for (const mp of match.matchedPeaks) {
          const label = `${match.nuclide.name} (${Math.round(mp.expected)} keV)`;
          peakMap.set(label, mp.found.energy);
        }
      }
    }
    return peakMap;
  }, [visibleSpectra]);

  // Build chart data from visible spectra only
  const chartData = useMemo(() => {
    if (visibleSpectra.length === 0 || displayRange === 0) return null;

    const energies = visibleSpectra[0].data.energies
      .slice(0, displayRange)
      .map((e) => Math.round(e * 10) / 10);

    // Use original index for consistent colors
    const series = visibleSpectra.map((s) => {
      const originalIdx = spectra.indexOf(s);
      return {
        data: s.data.counts.slice(0, displayRange),
        label: s.data.sampleName || `Spektrum ${originalIdx + 1}`,
        color: SERIES_COLORS[originalIdx % SERIES_COLORS.length],
      };
    });

    return { energies, series };
  }, [spectra, visibleSpectra, displayRange]);

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
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton
                      aria-label={s.visible ? 'Ausblenden' : 'Einblenden'}
                      onClick={() => toggleVisibility(s.id)}
                      size="small"
                    >
                      {s.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="Entfernen"
                      onClick={() => removeSpectrum(s.id)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
                sx={{
                  opacity: s.visible ? 1 : 0.5,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => toggleVisibility(s.id)}
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
                          component={topMatch.nuclide.url ? 'a' : 'span'}
                          href={topMatch.nuclide.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          clickable={!!topMatch.nuclide.url}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
                label: logScale ? 'Counts (log)' : 'Counts',
                valueFormatter: logScale
                  ? (v: number | null) =>
                      v != null ? Math.round(Math.pow(10, v) - 1).toString() : ''
                  : undefined,
              },
            ]}
            series={chartData.series.map((s) => ({
              ...s,
              data: logScale
                ? s.data.map((v) => (v > 0 ? Math.log10(v + 1) : 0))
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
