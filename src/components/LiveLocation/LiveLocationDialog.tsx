'use client';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import {
  DISTANCE_MAX_M,
  DISTANCE_MIN_M,
  HEARTBEAT_MAX_MS,
  HEARTBEAT_MIN_MS,
  LiveLocationSettings,
} from '../../hooks/useLiveLocationSettings';

export interface LiveLocationDialogProps {
  open: boolean;
  onClose: () => void;
  firecallName: string;
  settings: LiveLocationSettings;
  setSettings: (next: LiveLocationSettings) => void;
  onStart: () => void;
}

function LiveLocationDialogBody({
  onClose,
  firecallName,
  settings,
  setSettings,
  onStart,
}: Omit<LiveLocationDialogProps, 'open'>) {
  const [heartbeatMs, setHeartbeatMs] = useState(settings.heartbeatMs);
  const [distanceM, setDistanceM] = useState(settings.distanceM);

  const handleSubmit = () => {
    if (
      heartbeatMs !== settings.heartbeatMs ||
      distanceM !== settings.distanceM
    ) {
      setSettings({ heartbeatMs, distanceM });
    }
    onStart();
  };

  return (
    <>
      <DialogTitle>Standort teilen?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {`Dein Live-Standort wird für andere Einsatzkräfte im Einsatz „${
            firecallName || 'aktueller Einsatz'
          }" sichtbar.`}
        </DialogContentText>

        <Accordion sx={{ mt: 2 }} disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Erweiterte Einstellungen</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ px: 1 }}>
              <Typography
                id="live-loc-heartbeat-label"
                gutterBottom
                variant="body2"
              >
                Heartbeat: {Math.round(heartbeatMs / 1000)} s
              </Typography>
              <Slider
                aria-label="Heartbeat"
                aria-labelledby="live-loc-heartbeat-label"
                value={heartbeatMs}
                min={HEARTBEAT_MIN_MS}
                max={HEARTBEAT_MAX_MS}
                step={5_000}
                valueLabelDisplay="auto"
                valueLabelFormat={(v: number) =>
                  `${Math.round(v / 1000)} s`
                }
                onChange={(_, v) =>
                  setHeartbeatMs(Array.isArray(v) ? v[0] : v)
                }
              />
              <Typography
                id="live-loc-distance-label"
                gutterBottom
                variant="body2"
                sx={{ mt: 2 }}
              >
                Distanz: {distanceM} m
              </Typography>
              <Slider
                aria-label="Distanz"
                aria-labelledby="live-loc-distance-label"
                value={distanceM}
                min={DISTANCE_MIN_M}
                max={DISTANCE_MAX_M}
                step={5}
                valueLabelDisplay="auto"
                valueLabelFormat={(v: number) => `${v} m`}
                onChange={(_, v) =>
                  setDistanceM(Array.isArray(v) ? v[0] : v)
                }
              />
            </Box>
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleSubmit} variant="contained">
          Standort teilen
        </Button>
      </DialogActions>
    </>
  );
}

export default function LiveLocationDialog(props: LiveLocationDialogProps) {
  const { open, onClose } = props;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      // Remount the body each time the dialog opens so local slider state
      // is re-initialized from the latest settings prop.
      key={open ? 'open' : 'closed'}
    >
      {open ? <LiveLocationDialogBody {...props} /> : null}
    </Dialog>
  );
}
