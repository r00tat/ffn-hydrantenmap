'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { useCallback, useState } from 'react';
import { Spectrum } from '../firebase/firestore';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import { runLiveIdentification } from '../../common/spectrumIdentification';
import { useRadiacode } from '../providers/RadiacodeProvider';
import { useSnackbar } from '../providers/SnackbarProvider';

interface Props {
  open: boolean;
  onClose: () => void;
}

type MachineState =
  | 'disconnected'
  | 'idle'
  | 'recording'
  | 'reconnecting'
  | 'saving'
  | 'done';

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Format `yyyy-MM-dd HH:mm` from a unix ms timestamp. No date-fns in this
 * project, so we slice the ISO string and swap the T for a space.
 */
function formatStartTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

export default function RadiacodeCaptureDialog({ open, onClose }: Props) {
  const {
    status,
    device,
    spectrum,
    spectrumSession,
    measurement,
    connect,
    startSpectrumRecording,
    stopSpectrumRecording,
    cancelSpectrumRecording,
  } = useRadiacode();
  const addItem = useFirecallItemAdd();
  const showSnackbar = useSnackbar();

  const [logScale, setLogScale] = useState(false);
  const [saving, setSaving] = useState(false);

  const machineState: MachineState = (() => {
    if (saving) return 'saving';
    if (status === 'connecting' && spectrumSession.active) return 'reconnecting';
    if (status === 'connected' && spectrumSession.active) return 'recording';
    if (status === 'connected') return 'idle';
    return 'disconnected';
  })();

  const handleStart = useCallback(async () => {
    try {
      await startSpectrumRecording();
    } catch (e) {
      showSnackbar(
        `Aufnahme konnte nicht gestartet werden: ${(e as Error).message}`,
        'error',
      );
    }
  }, [startSpectrumRecording, showSnackbar]);

  const handleStopAndSave = useCallback(async () => {
    setSaving(true);
    try {
      const snap = await stopSpectrumRecording();
      if (!snap) {
        showSnackbar(
          'Kein Spektrum empfangen — nichts zu speichern',
          'warning',
        );
        setSaving(false);
        return;
      }
      const identification = runLiveIdentification(snap.counts, snap.coefficients);
      const matched =
        identification.state === 'match' ? identification : null;
      const startTs = spectrumSession.startedAt ?? snap.timestamp;
      const deviceName = `${device?.name ?? 'Radiacode'}${
        device?.serial ? ` ${device.serial}` : ''
      }`.trim();

      // If the provider lost the connection during the session, `status`
      // would have flipped to error/idle and the last snapshot is what we
      // cached in context. `stopSpectrumRecording()` already returns that
      // cached snapshot — no special branch needed. We surface the partial
      // state to the user via a snackbar only if we can detect it.
      const wasConnectionLost = status !== 'connected';

      const item: Spectrum = {
        type: 'spectrum',
        name: `Live-Messung ${formatStartTimestamp(startTs)}`,
        sampleName: '',
        deviceName,
        measurementTime: snap.durationSec,
        liveTime: snap.durationSec,
        startTime: new Date(startTs).toISOString(),
        endTime: new Date().toISOString(),
        coefficients: snap.coefficients as unknown as number[],
        counts: snap.counts,
        matchedNuclide: matched?.nuclide,
        matchedConfidence: matched?.confidence,
      };

      await addItem(item);
      if (wasConnectionLost) {
        showSnackbar(
          'Verbindung verloren — Teilergebnis gespeichert',
          'warning',
        );
      } else {
        showSnackbar('Spektrum gespeichert', 'success');
      }
      setSaving(false);
      onClose();
    } catch (e) {
      setSaving(false);
      // addItem's internal error handling already surfaced a snackbar.
      // Log for visibility but don't double-notify.
      console.error('Failed to save spectrum', e);
    }
  }, [
    stopSpectrumRecording,
    spectrumSession.startedAt,
    device,
    status,
    addItem,
    showSnackbar,
    onClose,
  ]);

  const handleCancel = useCallback(async () => {
    await cancelSpectrumRecording();
    onClose();
  }, [cancelSpectrumRecording, onClose]);

  const handleConnect = useCallback(async () => {
    await connect();
  }, [connect]);

  const handleClose = useCallback(async () => {
    // Closing the dialog via X/backdrop while a session is active cancels
    // the session (and discards any captured spectrum). Explicit choice:
    // prevents an orphaned background session the user can no longer see.
    if (spectrumSession.active) {
      await cancelSpectrumRecording();
    }
    onClose();
  }, [spectrumSession.active, cancelSpectrumRecording, onClose]);

  const chartData =
    spectrum && spectrum.counts.length > 0
      ? spectrum.counts.map((c) => (logScale ? Math.max(c, 0.5) : c))
      : null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Radiacode Live-Aufnahme</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ position: 'relative' }}>
          {/* Nuklid-Chip — placeholder for Task 11 */}
          <Box sx={{ minHeight: 32 }} data-testid="nuclide-chip-slot" />

          {spectrum ? (
            <Box sx={{ position: 'relative', minHeight: 300 }}>
              <FormControlLabel
                sx={{ position: 'absolute', right: 8, top: 0, zIndex: 1 }}
                control={
                  <Switch
                    checked={logScale}
                    onChange={(_, v) => setLogScale(v)}
                    slotProps={{ input: { 'aria-label': 'Log' } }}
                  />
                }
                label="Log"
              />
              <LineChart
                height={300}
                xAxis={[
                  {
                    data: spectrum.counts.map((_, i) => i),
                    scaleType: 'linear',
                    label: 'Kanal',
                  },
                ]}
                yAxis={[
                  { scaleType: logScale ? 'log' : 'linear', label: 'Counts' },
                ]}
                series={[
                  {
                    data: chartData ?? spectrum.counts,
                    showMark: false,
                  },
                ]}
              />
            </Box>
          ) : (
            <Typography color="text.secondary">
              {machineState === 'disconnected'
                ? 'Radiacode nicht verbunden.'
                : machineState === 'idle'
                  ? 'Bereit — "Aufnahme starten" drücken.'
                  : 'Warte auf erstes Spektrum …'}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
            <Typography variant="body2">
              Dauer: {formatDuration(spectrum?.durationSec ?? 0)}
            </Typography>
            <Typography variant="body2">
              Snapshots: {spectrumSession.snapshotCount}
            </Typography>
            <Typography variant="body2">
              CPS: {measurement ? Math.round(measurement.cps) : '—'}
            </Typography>
          </Stack>

          {machineState === 'reconnecting' && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 2,
                zIndex: 2,
              }}
            >
              <CircularProgress />
              <Typography>Verbinde erneut …</Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {machineState === 'disconnected' && (
          <Button variant="contained" onClick={handleConnect}>
            Verbinden
          </Button>
        )}
        {machineState === 'idle' && (
          <Button variant="contained" onClick={handleStart}>
            Aufnahme starten
          </Button>
        )}
        {(machineState === 'recording' ||
          machineState === 'reconnecting' ||
          machineState === 'saving') && (
          <>
            <Button
              variant="outlined"
              onClick={handleCancel}
              disabled={machineState === 'saving'}
            >
              Abbrechen
            </Button>
            <Button
              variant="contained"
              onClick={handleStopAndSave}
              disabled={machineState === 'saving'}
              startIcon={
                machineState === 'saving' ? (
                  <CircularProgress size={16} />
                ) : undefined
              }
            >
              Stop &amp; Speichern
            </Button>
          </>
        )}
        <Button onClick={handleClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
