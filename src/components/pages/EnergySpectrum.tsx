'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';
import { where } from 'firebase/firestore';
import { NUCLIDES } from '../../common/strahlenschutz';
import {
  parseSpectrumFile,
  channelToEnergy,
  findPeaks,
  identifyNuclides,
  type SpectrumData,
  type NuclideMatch,
} from '../../common/spectrumParser';
import { buildNuclidePeakLines } from '../../common/nuclidePeakLines';
import { resolveSpectrumIdentification } from '../../common/spectrumIdentification';
import {
  FIRECALL_COLLECTION_ID,
  Spectrum,
} from '../../components/firebase/firestore';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';

/** MUI default color palette for series */
const SERIES_COLORS = [
  '#1976d2',
  '#d32f2f',
  '#388e3c',
  '#f57c00',
  '#7b1fa2',
  '#0288d1',
];

/**
 * Palette for manually selected nuclide peak lines. Intentionally distinct from
 * SERIES_COLORS (spectrum curves) and the red (#d32f2f) used for auto-matched
 * peaks, so the three line sets stay visually separable.
 */
const SELECTED_PEAK_COLORS = [
  '#00796b',
  '#c2185b',
  '#5d4037',
  '#455a64',
  '#512da8',
  '#ef6c00',
  '#2e7d32',
  '#1565c0',
];

/**
 * Cycle labels through these vertical positions along the reference line so
 * labels of adjacent peaks don't overlap (e.g. Co-60 at 1173/1332 keV).
 */
const PEAK_LABEL_ALIGNS = ['start', 'middle', 'end'] as const;

interface LoadedSpectrum {
  id: string;
  firestoreId?: string;
  data: SpectrumData;
  matches: NuclideMatch[];
  visible: boolean;
  description?: string;
  manualNuclide?: string;
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
  (n) => n.peaks && n.peaks.length > 0,
);

/**
 * Build direct links to nuclide databases from a nuclide name like "Cs-137".
 * Returns { iaea, nndc } URLs.
 */
function getNuclideDbLinks(name: string) {
  // "Cs-137" → element="Cs", mass="137"
  const match = name.match(/^([A-Za-z]+)-(\d+m?)$/);
  if (!match) return null;
  const [, element, mass] = match;
  // NNDC NuDat 3: nucleus=137Cs
  const nndc = `https://www.nndc.bnl.gov/nudat3/getdatasetClassic.jsp?nucleus=${mass}${element.charAt(0).toUpperCase()}${element.slice(1).toLowerCase()}&unc=NDS`;
  // IAEA LiveChart: uses Z and A, but the search URL works with name
  const iaea = `https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html#${mass}${element.toLowerCase()}`;
  return { nndc, iaea };
}

interface EditDialogState {
  id: string;
  firestoreId?: string;
  sampleName: string;
  description: string;
  manualNuclide: string | null;
}

export default function EnergySpectrum() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [logScale, setLogScale] = useState(false);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [selectedNuclideNames, setSelectedNuclideNames] = useState<string[]>(
    [],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firecallId = useFirecallId();
  const addItem = useFirecallItemAdd();
  const updateItem = useFirecallItemUpdate();

  const queryConstraints = useMemo(() => [where('type', '==', 'spectrum')], []);
  const filterFn = useCallback((s: Spectrum) => !s.deleted, []);
  const savedSpectra = useFirebaseCollection<Spectrum>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, 'item'],
    queryConstraints,
    filterFn,
  });

  // Convert Firestore spectra into LoadedSpectrum format with visibility
  const allSpectra = useMemo<LoadedSpectrum[]>(() => {
    if (!savedSpectra || savedSpectra.length === 0) return [];

    return savedSpectra
      .filter((saved) => saved.counts?.length > 0)
      .map((saved) => {
        const id = `firestore-${saved.id}`;
        const energies = saved.counts.map((_, ch) =>
          channelToEnergy(ch, saved.coefficients),
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

        return {
          id,
          firestoreId: saved.id,
          data: dataWithEnergies,
          matches,
          visible: !hiddenIds.has(id),
          description: saved.description,
          manualNuclide: saved.manualNuclide,
        };
      });
  }, [savedSpectra, hiddenIds]);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        const text = await file.text();
        try {
          const data = parseSpectrumFile(text);
          const peaks = findPeaks(data.counts, data.energies);
          const matches = identifyNuclides(peaks);

          const spectrumItem: Spectrum = {
            type: 'spectrum',
            name: data.sampleName || file.name,
            sampleName: data.sampleName,
            deviceName: data.deviceName,
            measurementTime: data.measurementTime,
            liveTime: data.liveTime,
            startTime: data.startTime,
            endTime: data.endTime,
            coefficients: data.coefficients,
            counts: data.counts,
            matchedNuclide: matches[0]?.nuclide.name,
            matchedConfidence: matches[0]?.confidence,
          };
          await addItem(spectrumItem);
        } catch (e) {
          console.error(`Failed to parse ${file.name}:`, e);
        }
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [addItem],
  );

  const toggleVisibility = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const removeSpectrum = useCallback(
    (id: string) => {
      const spectrum = allSpectra.find((s) => s.id === id);
      if (spectrum?.firestoreId) {
        updateItem({
          id: spectrum.firestoreId,
          type: 'spectrum',
          name: spectrum.data.sampleName || '',
          deleted: true,
        });
      }
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [updateItem, allSpectra],
  );

  const openEditDialog = useCallback((spectrum: LoadedSpectrum) => {
    setEditDialog({
      id: spectrum.id,
      firestoreId: spectrum.firestoreId,
      sampleName: spectrum.data.sampleName || '',
      description: spectrum.description || '',
      manualNuclide: spectrum.manualNuclide ?? null,
    });
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editDialog?.firestoreId) return;

    // Find the original Firestore document so all fields are preserved
    const original = savedSpectra?.find((s) => s.id === editDialog.firestoreId);
    if (original) {
      updateItem({
        ...original,
        name: editDialog.sampleName,
        sampleName: editDialog.sampleName,
        description: editDialog.description,
        manualNuclide: editDialog.manualNuclide ?? '',
      } as Spectrum);
    }

    setEditDialog(null);
  }, [editDialog, updateItem, savedSpectra]);

  const visibleSpectra = useMemo(
    () => allSpectra.filter((s) => s.visible),
    [allSpectra],
  );

  // Defer chart-related computations so the list toggles instantly
  const deferredVisibleSpectra = useDeferredValue(visibleSpectra);

  const displayRange = useMemo(
    () =>
      deferredVisibleSpectra.length > 0
        ? getDisplayRange(deferredVisibleSpectra)
        : 0,
    [deferredVisibleSpectra],
  );

  const selectedPeakLines = useMemo(
    () =>
      buildNuclidePeakLines(
        selectedNuclideNames,
        MATCHABLE_NUCLIDES,
        SELECTED_PEAK_COLORS,
      ),
    [selectedNuclideNames],
  );

  // Collect matched peak energies from visible spectra for reference lines.
  // Only shows peaks of the *identified* nuclide per spectrum (top auto-match
  // or manual override) — not of every candidate. Otherwise neighbouring
  // nuclides that happen to have a peak inside the match tolerance window
  // (e.g. Eu-152 @ 1112 keV near Co-60 @ 1173 keV) would pollute the chart
  // with reference lines for nuclides the UI does not present as the result.
  const matchedPeakEnergies = useMemo(() => {
    const peakMap = new Map<string, number>(); // label -> energy keV
    for (const s of deferredVisibleSpectra) {
      const topMatch = s.matches[0];
      const identification = resolveSpectrumIdentification(
        s.manualNuclide,
        topMatch
          ? { name: topMatch.nuclide.name, confidence: topMatch.confidence }
          : undefined,
      );
      if (!identification.displayName) continue;

      const displayedMatch = s.matches.find(
        (m) => m.nuclide.name === identification.displayName,
      );
      if (displayedMatch) {
        for (const mp of displayedMatch.matchedPeaks) {
          const label = `${displayedMatch.nuclide.name} (${Math.round(mp.expected)} keV)`;
          peakMap.set(label, mp.found.energy);
        }
      } else {
        // Manual override without a corresponding match — fall back to the
        // reference energies so the user still sees the expected lines.
        const nuclide = NUCLIDES.find(
          (n) => n.name === identification.displayName,
        );
        if (nuclide?.peaks?.length) {
          for (const { energy } of nuclide.peaks) {
            const label = `${nuclide.name} (${Math.round(energy)} keV)`;
            if (!peakMap.has(label)) {
              peakMap.set(label, energy);
            }
          }
        }
      }
    }
    return peakMap;
  }, [deferredVisibleSpectra]);

  // Build chart data from deferred visible spectra only
  const chartData = useMemo(() => {
    if (deferredVisibleSpectra.length === 0 || displayRange === 0) return null;

    const energies = deferredVisibleSpectra[0].data.energies
      .slice(0, displayRange)
      .map((e) => Math.round(e * 10) / 10);

    // Use original index for consistent colors
    const series = deferredVisibleSpectra.map((s) => {
      const originalIdx = allSpectra.indexOf(s);
      return {
        data: s.data.counts.slice(0, displayRange),
        label: s.data.sampleName || `Spektrum ${originalIdx + 1}`,
        color: SERIES_COLORS[originalIdx % SERIES_COLORS.length],
      };
    });

    return { energies, series };
  }, [allSpectra, deferredVisibleSpectra, displayRange]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Nuklid Energiespektrum
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Lade eine oder mehrere XML-Dateien eines RadiaCode Spektrometers hoch,
        um das Energiespektrum darzustellen und das Nuklid automatisch zu
        identifizieren.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label="RadiaCode Spektren"
          icon={<OpenInNewIcon />}
          component="a"
          href="https://www.radiacode.com/spectrum-isotopes-library"
          target="_blank"
          rel="noopener noreferrer"
          clickable
          size="small"
          variant="outlined"
        />
        <Chip
          label="IAEA Nuklidkarte"
          icon={<OpenInNewIcon />}
          component="a"
          href="https://www-nds.iaea.org/relnsd/vcharthtml/VChartHTML.html"
          target="_blank"
          rel="noopener noreferrer"
          clickable
          size="small"
          variant="outlined"
        />
        <Chip
          label="NNDC NuDat 3"
          icon={<OpenInNewIcon />}
          component="a"
          href="https://www.nndc.bnl.gov/nudat3/"
          target="_blank"
          rel="noopener noreferrer"
          clickable
          size="small"
          variant="outlined"
        />
      </Box>

      <input
        ref={fileInputRef}
        type="file"
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
        {allSpectra.length > 0 && (
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
                <Typography
                  key={n.name}
                  variant="caption"
                  sx={{ display: 'block' }}
                >
                  {n.name}: {n.peaks!.map((p) => p.energy).join(', ')} keV
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
        <Autocomplete
          multiple
          size="small"
          options={MATCHABLE_NUCLIDES.map((n) => n.name)}
          value={selectedNuclideNames}
          onChange={(_, value) => setSelectedNuclideNames(value)}
          sx={{ minWidth: 260, flex: 1 }}
          renderValue={(value, getItemProps) =>
            value.map((name, idx) => {
              const color =
                SELECTED_PEAK_COLORS[idx % SELECTED_PEAK_COLORS.length];
              const { key, ...itemProps } = getItemProps({ index: idx });
              return (
                <Chip
                  key={key}
                  label={name}
                  size="small"
                  {...itemProps}
                  sx={{
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 1,
                  }}
                />
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Peaks von Nukliden einblenden"
              placeholder={
                selectedNuclideNames.length === 0 ? 'Nuklide wählen' : ''
              }
            />
          )}
        />
      </Box>

      {/* Identification Results */}
      {allSpectra.length > 0 && (
        <List dense>
          {allSpectra.map((s, idx) => {
            const topMatch = s.matches[0];
            const identification = resolveSpectrumIdentification(
              s.manualNuclide,
              topMatch
                ? {
                    name: topMatch.nuclide.name,
                    confidence: topMatch.confidence,
                  }
                : undefined,
            );
            const identNuclide = identification.displayName
              ? NUCLIDES.find((n) => n.name === identification.displayName)
              : undefined;
            const dbLinks = identification.displayName
              ? getNuclideDbLinks(identification.displayName)
              : null;
            return (
              <ListItem
                key={s.id}
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0 }}>
                    <IconButton
                      aria-label="Bearbeiten"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        openEditDialog(s);
                      }}
                      size="small"
                      sx={{ minWidth: 44, minHeight: 44 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={s.visible ? 'Ausblenden' : 'Einblenden'}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        toggleVisibility(s.id);
                      }}
                      size="small"
                      sx={{ minWidth: 44, minHeight: 44 }}
                    >
                      {s.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="Entfernen"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        removeSpectrum(s.id);
                      }}
                      size="small"
                      sx={{ minWidth: 44, minHeight: 44 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
                sx={{
                  opacity: s.visible ? 1 : 0.5,
                  cursor: 'pointer',
                  pr: '148px',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => toggleVisibility(s.id)}
              >
                <Box
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length],
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
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ fontWeight: 'bold' }}
                      >
                        {s.data.sampleName || 'Unbekannt'}
                      </Typography>
                      {identification.source === 'manual' && (
                        <Chip
                          label={`${identification.displayName} (manuell)`}
                          color="primary"
                          size="small"
                        />
                      )}
                      {identification.source === 'auto' && (
                        <Chip
                          label={`${identification.displayName} (${Math.round(identification.confidence * 100)}%)`}
                          color="success"
                          size="small"
                        />
                      )}
                      {identification.source === 'none' && (
                        <Chip
                          label="Nicht identifiziert"
                          color="warning"
                          size="small"
                        />
                      )}
                      {identNuclide?.url && (
                        <Chip
                          label="RadiaCode"
                          size="small"
                          variant="outlined"
                          component="a"
                          href={identNuclide.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          clickable
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                      )}
                      {dbLinks && (
                        <>
                          <Chip
                            label="IAEA"
                            size="small"
                            variant="outlined"
                            component="a"
                            href={dbLinks.iaea}
                            target="_blank"
                            rel="noopener noreferrer"
                            clickable
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          />
                          <Chip
                            label="NNDC"
                            size="small"
                            variant="outlined"
                            component="a"
                            href={dbLinks.nndc}
                            target="_blank"
                            rel="noopener noreferrer"
                            clickable
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                          />
                        </>
                      )}
                      {identification.source === 'manual' &&
                        identification.autoAlt && (
                          <Chip
                            label={`Auto: ${identification.autoAlt.name} (${Math.round(
                              identification.autoAlt.confidence * 100,
                            )}%)`}
                            size="small"
                            variant="outlined"
                            color="default"
                          />
                        )}
                    </Box>
                  }
                  secondary={
                    <>
                      {`${s.data.deviceName} · ${s.data.startTime ? new Date(s.data.startTime).toLocaleString('de-AT') : ''} · Messzeit: ${s.data.measurementTime}s (Live: ${s.data.liveTime}s)`}
                      {s.description && (
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{ display: 'block' }}
                          color="text.secondary"
                        >
                          {s.description}
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editDialog !== null}
        onClose={() => setEditDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Messung bearbeiten</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Titel / Probenname"
            fullWidth
            value={editDialog?.sampleName ?? ''}
            onChange={(e) =>
              setEditDialog((prev) =>
                prev ? { ...prev, sampleName: e.target.value } : prev,
              )
            }
          />
          <Autocomplete
            options={NUCLIDES.map((n) => n.name)}
            value={editDialog?.manualNuclide ?? null}
            onChange={(_, value) =>
              setEditDialog((prev) =>
                prev ? { ...prev, manualNuclide: value } : prev,
              )
            }
            sx={{ mt: 1 }}
            renderInput={(params) => (
              <TextField
                {...params}
                margin="dense"
                label="Nuklid (manuell zugeordnet)"
                placeholder="Leer lassen, um Auto-Erkennung zu nutzen"
                helperText="Überschreibt die automatische Erkennung in der Liste."
              />
            )}
          />
          <TextField
            margin="dense"
            label="Beschreibung"
            fullWidth
            multiline
            minRows={2}
            value={editDialog?.description ?? ''}
            onChange={(e) =>
              setEditDialog((prev) =>
                prev ? { ...prev, description: e.target.value } : prev,
              )
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>Abbrechen</Button>
          <Button onClick={handleEditSave} variant="contained">
            Speichern
          </Button>
        </DialogActions>
      </Dialog>

      {/* Chart */}
      {chartData && (
        <Box sx={{ width: '100%', mt: 2 }}>
          <LineChart
            height={400}
            xAxis={[
              {
                id: 'energy',
                data: chartData.energies,
                label: 'Energie (keV)',
                scaleType: 'linear',
                valueFormatter: (v: number) => `${v} keV`,
              },
            ]}
            yAxis={[
              {
                label: logScale ? 'Counts (log)' : 'Counts',
                valueFormatter: logScale
                  ? (v: number | null) =>
                      v != null
                        ? Math.round(Math.pow(10, v) - 1).toString()
                        : ''
                  : undefined,
              },
            ]}
            series={chartData.series.map((s) => ({
              ...s,
              data: logScale
                ? s.data.map((v) => (v > 0 ? Math.log10(v + 1) : 0))
                : s.data,
              area: true,
              showMark: false,
              curve: 'linear' as const,
              valueFormatter: (v: number | null) => {
                const counts =
                  logScale && v != null ? Math.round(Math.pow(10, v) - 1) : v;
                return `${counts} cps`;
              },
            }))}
            margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
          >
            {Array.from(matchedPeakEnergies.entries())
              .sort((a, b) => a[1] - b[1])
              .map(([label, energy], idx) => (
                <ChartsReferenceLine
                  key={label}
                  x={energy}
                  label={label}
                  labelAlign={PEAK_LABEL_ALIGNS[idx % PEAK_LABEL_ALIGNS.length]}
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
              ))}
            {[...selectedPeakLines]
              .sort((a, b) => a.energy - b.energy)
              .map((line, idx) => (
                <ChartsReferenceLine
                  key={line.key}
                  x={line.energy}
                  label={line.label}
                  labelAlign={PEAK_LABEL_ALIGNS[idx % PEAK_LABEL_ALIGNS.length]}
                  lineStyle={{
                    stroke: line.color,
                    strokeWidth: 1.5,
                    strokeDasharray: '2 3',
                  }}
                  labelStyle={{
                    fontSize: 10,
                    fill: line.color,
                    fontWeight: 'bold',
                  }}
                />
              ))}
          </LineChart>
        </Box>
      )}

      {/* Empty state */}
      {allSpectra.length === 0 && (
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
