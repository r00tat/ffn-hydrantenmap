import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { FirecallLayer } from '../firebase/firestore';
import { RadiacodeDeviceRef, SampleRate } from '../../hooks/radiacode/types';

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
}

export default function TrackStartDialog({
  open,
  onClose,
  onStart,
}: TrackStartDialogProps) {
  const [mode, setMode] = useState<TrackMode>('gps');

  const handleStart = () => {
    onStart({
      mode,
      layer: null,
      sampleRate: 'normal',
      device: null,
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleStart} variant="contained">
          Starten
        </Button>
      </DialogActions>
    </Dialog>
  );
}
