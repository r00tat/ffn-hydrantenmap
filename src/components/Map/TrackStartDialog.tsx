import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { formatTimestamp } from '../../common/time-format';
import { FirecallLayer } from '../firebase/firestore';
import {
  CustomSampleRate,
  isCustomSampleRate,
  RadiacodeDeviceRef,
  SampleRate,
  SampleRateSpec,
} from '../../hooks/radiacode/types';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';

export type TrackMode = 'gps' | 'radiacode';

export type LayerChoice =
  | { type: 'existing'; id: string }
  | { type: 'new'; name: string };

export interface TrackStartConfig {
  mode: TrackMode;
  layer: LayerChoice | null;
  sampleRate: SampleRateSpec;
  device: RadiacodeDeviceRef | null;
}

export interface TrackStartDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (config: TrackStartConfig) => void;
  existingRadiacodeLayers?: FirecallLayer[];
  defaultDevice?: RadiacodeDeviceRef | null;
  onRequestDevice?: () => void;
  radiacodeStatus?: RadiacodeStatus;
}

const RADIACODE_STATUS_LABEL: Record<RadiacodeStatus, string> = {
  idle: 'Nicht verbunden',
  scanning: 'Suche Gerät…',
  connecting: 'Verbinde…',
  connected: 'Verbunden',
  reconnecting: 'Verbinde neu…',
  unavailable: 'Gerät nicht erreichbar',
  error: 'Fehler',
};

const RADIACODE_STATUS_COLOR: Record<
  RadiacodeStatus,
  'default' | 'success' | 'warning' | 'error'
> = {
  idle: 'default',
  scanning: 'warning',
  connecting: 'warning',
  connected: 'success',
  reconnecting: 'warning',
  unavailable: 'error',
  error: 'error',
};

const NEW_LAYER_VALUE = '__new__';

type RateKind = SampleRate | 'custom';

export default function TrackStartDialog({
  open,
  onClose,
  onStart,
  existingRadiacodeLayers = [],
  defaultDevice = null,
  onRequestDevice,
  radiacodeStatus = 'idle',
}: TrackStartDialogProps) {
  const [mode, setMode] = useState<TrackMode>('gps');

  const defaultNewLayerName = useMemo(
    () => `Messung ${formatTimestamp(new Date())}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const [layerSelection, setLayerSelection] = useState<string>(NEW_LAYER_VALUE);
  const [newLayerName, setNewLayerName] = useState<string>(defaultNewLayerName);
  const [sampleRate, setSampleRate] = useState<SampleRate>('normal');
  const [rateKind, setRateKind] = useState<RateKind>('normal');
  const [customInterval, setCustomInterval] = useState<string>('');
  const [customDistance, setCustomDistance] = useState<string>('');
  const [customDose, setCustomDose] = useState<string>('');

  const handleRateKindChange = (value: RateKind) => {
    setRateKind(value);
    if (value === 'custom') {
      // Fresh start per plan: clear custom fields when switching to Custom mode.
      setCustomInterval('');
      setCustomDistance('');
      setCustomDose('');
    } else {
      setSampleRate(value);
    }
  };

  const handleLayerChange = (value: string) => {
    setLayerSelection(value);
    if (value === NEW_LAYER_VALUE) {
      setSampleRate('normal');
      setRateKind('normal');
      setCustomInterval('');
      setCustomDistance('');
      setCustomDose('');
    } else {
      const chosen = existingRadiacodeLayers.find((l) => l.id === value);
      if (chosen?.sampleRate) {
        if (isCustomSampleRate(chosen.sampleRate)) {
          setRateKind('custom');
          setCustomInterval(
            chosen.sampleRate.intervalSec !== undefined
              ? String(chosen.sampleRate.intervalSec)
              : '',
          );
          setCustomDistance(
            chosen.sampleRate.distanceM !== undefined
              ? String(chosen.sampleRate.distanceM)
              : '',
          );
          setCustomDose(
            chosen.sampleRate.doseRateDeltaUSvH !== undefined
              ? String(chosen.sampleRate.doseRateDeltaUSvH)
              : '',
          );
        } else {
          setSampleRate(chosen.sampleRate);
          setRateKind(chosen.sampleRate);
          setCustomInterval('');
          setCustomDistance('');
          setCustomDose('');
        }
      }
    }
  };

  const parsePositive = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const buildSampleRate = (): SampleRateSpec => {
    if (rateKind !== 'custom') return sampleRate;
    const out: CustomSampleRate = { kind: 'custom' };
    const i = parsePositive(customInterval);
    const d = parsePositive(customDistance);
    if (i !== undefined) out.intervalSec = i;
    if (d !== undefined) out.distanceM = d;
    if (mode === 'radiacode') {
      const dose = parsePositive(customDose);
      if (dose !== undefined) out.doseRateDeltaUSvH = dose;
    }
    return out;
  };

  const buildLayerChoice = (): LayerChoice | null => {
    if (mode !== 'radiacode') return null;
    if (layerSelection === NEW_LAYER_VALUE) {
      return { type: 'new', name: newLayerName.trim() || defaultNewLayerName };
    }
    return { type: 'existing', id: layerSelection };
  };

  const handleStart = () => {
    onStart({
      mode,
      layer: buildLayerChoice(),
      sampleRate: buildSampleRate(),
      device: mode === 'radiacode' ? defaultDevice : null,
    });
  };

  const customEmpty =
    rateKind === 'custom' &&
    customInterval.trim() === '' &&
    customDistance.trim() === '' &&
    (mode !== 'radiacode' || customDose.trim() === '');
  const radiacodeGate =
    mode === 'radiacode' && radiacodeStatus !== 'connected';
  const startDisabled = radiacodeGate || customEmpty;
  const startDisabledTooltip = radiacodeGate
    ? 'Radiacode nicht verbunden — bitte zuerst verbinden'
    : customEmpty
      ? 'Mindestens ein Schwellwert erforderlich'
      : '';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Aufzeichnung starten</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <FormControl>
            <FormLabel id="track-mode-label">Modus</FormLabel>
            <RadioGroup
              aria-labelledby="track-mode-label"
              value={mode}
              onChange={(e) => setMode(e.target.value as TrackMode)}
            >
              <FormControlLabel
                value="gps"
                control={<Radio />}
                label="GPS-Track"
              />
              <FormControlLabel
                value="radiacode"
                control={<Radio />}
                label="Strahlenmessung (Radiacode)"
              />
            </RadioGroup>
          </FormControl>

          {mode === 'radiacode' && (
            <>
              <FormControl fullWidth>
                <InputLabel id="track-layer-label">Layer</InputLabel>
                <Select
                  labelId="track-layer-label"
                  label="Layer"
                  value={layerSelection}
                  onChange={(e) => handleLayerChange(e.target.value)}
                >
                  {existingRadiacodeLayers.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.name}
                    </MenuItem>
                  ))}
                  <MenuItem value={NEW_LAYER_VALUE}>Neuer Layer…</MenuItem>
                </Select>
              </FormControl>

              {layerSelection === NEW_LAYER_VALUE && (
                <TextField
                  label="Name des neuen Layers"
                  value={newLayerName}
                  onChange={(e) => setNewLayerName(e.target.value)}
                  fullWidth
                />
              )}
            </>
          )}

          <FormControl>
            <FormLabel id="track-rate-label">Messrate</FormLabel>
            <RadioGroup
              aria-labelledby="track-rate-label"
              row
              value={rateKind}
              onChange={(e) =>
                handleRateKindChange(e.target.value as RateKind)
              }
            >
              <FormControlLabel
                value="niedrig"
                control={<Radio />}
                label="Niedrig"
              />
              <FormControlLabel
                value="normal"
                control={<Radio />}
                label="Normal"
              />
              <FormControlLabel
                value="hoch"
                control={<Radio />}
                label="Hoch"
              />
              <FormControlLabel
                value="custom"
                control={<Radio />}
                label="Custom"
              />
            </RadioGroup>
          </FormControl>

          {rateKind === 'custom' && (
            <Stack spacing={2}>
              <TextField
                label="Zeitintervall (s)"
                type="number"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
              <TextField
                label="Abstand (m)"
                type="number"
                value={customDistance}
                onChange={(e) => setCustomDistance(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
              {mode === 'radiacode' && (
                <TextField
                  label="Dosisleistungs-Delta (µSv/h)"
                  type="number"
                  value={customDose}
                  onChange={(e) => setCustomDose(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                  fullWidth
                />
              )}
            </Stack>
          )}

          {mode === 'radiacode' && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Gerät
                </Typography>
                <Typography variant="body1">
                  {defaultDevice
                    ? `${defaultDevice.name} (${defaultDevice.serial})`
                    : 'Kein Standardgerät'}
                </Typography>
                <Chip
                  size="small"
                  sx={{ mt: 1 }}
                  color={RADIACODE_STATUS_COLOR[radiacodeStatus]}
                  label={RADIACODE_STATUS_LABEL[radiacodeStatus]}
                />
              </Box>
              <Button onClick={() => onRequestDevice?.()} variant="outlined">
                Wechseln
              </Button>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        {startDisabled ? (
          <Tooltip title={startDisabledTooltip}>
            <span>
              <Button disabled variant="contained">
                Starten
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button onClick={handleStart} variant="contained">
            Starten
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
