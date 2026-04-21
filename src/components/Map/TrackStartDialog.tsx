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
import { RadiacodeDeviceRef, SampleRate } from '../../hooks/radiacode/types';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';

export type TrackMode = 'gps' | 'radiacode';

export type LayerChoice =
  | { type: 'existing'; id: string }
  | { type: 'new'; name: string };

export interface TrackStartConfig {
  mode: TrackMode;
  layer: LayerChoice | null;
  sampleRate: SampleRate;
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

  const handleLayerChange = (value: string) => {
    setLayerSelection(value);
    if (value === NEW_LAYER_VALUE) {
      setSampleRate('normal');
    } else {
      const chosen = existingRadiacodeLayers.find((l) => l.id === value);
      if (chosen?.sampleRate) {
        setSampleRate(chosen.sampleRate);
      }
    }
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
      sampleRate,
      device: mode === 'radiacode' ? defaultDevice : null,
    });
  };

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

              <FormControl>
                <FormLabel id="track-rate-label">Messrate</FormLabel>
                <RadioGroup
                  aria-labelledby="track-rate-label"
                  row
                  value={sampleRate}
                  onChange={(e) => setSampleRate(e.target.value as SampleRate)}
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
                </RadioGroup>
              </FormControl>

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
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        {mode === 'radiacode' && radiacodeStatus !== 'connected' ? (
          <Tooltip title="Radiacode nicht verbunden — bitte zuerst verbinden">
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
