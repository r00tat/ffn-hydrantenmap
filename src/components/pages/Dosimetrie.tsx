'use client';

import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { useCallback, useMemo, useState } from 'react';
import {
  doseRateLevel,
  formatDose,
  formatDoseRate,
  formatDuration,
} from '../../common/doseFormat';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';
import { useRadiacode } from '../providers/RadiacodeProvider';
import { useSnackbar } from '../providers/SnackbarProvider';
import RadiacodeSettingsDialog from './RadiacodeSettingsDialog';

const LEVEL_COLOR: Record<ReturnType<typeof doseRateLevel>, string> = {
  normal: '#4caf50',
  elevated: '#ffeb3b',
  high: '#ff9800',
  critical: '#f44336',
};

function MetricTile({
  label,
  value,
  unit,
  color,
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  footer?: string;
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        minWidth: 160,
        flex: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h3"
        sx={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
        {unit && (
          <Typography component="span" variant="h6" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Typography>
      {footer && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
        >
          {footer}
        </Typography>
      )}
    </Box>
  );
}

function formatErr(pct: number | undefined): string | undefined {
  if (pct === undefined || !Number.isFinite(pct)) return undefined;
  return `± ${pct.toFixed(1)} %`;
}

function statusLabel(
  status: ReturnType<typeof useRadiacode>['status'],
  device: ReturnType<typeof useRadiacode>['device'],
): string {
  if (status === 'connected' && device) {
    return `Verbunden — ${device.name} (${device.serial})`;
  }
  if (status === 'connecting') return 'Verbindet …';
  if (status === 'reconnecting') return 'Verbinde neu …';
  if (status === 'scanning') return 'Scannen …';
  if (status === 'unavailable') return 'Gerät nicht erreichbar';
  if (status === 'error') return 'Fehler';
  return 'Getrennt';
}

const STATUS_CHIP_COLOR: Record<
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

function formatStartTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dosimetrie() {
  const {
    status,
    device,
    deviceInfo,
    measurement,
    history,
    cpsHistory,
    spectrum,
    error,
    connect,
    disconnect,
    readSettings,
    writeSettings,
    playSignal,
    doseReset,
    resetLiveSpectrum,
    saveLiveSpectrum,
  } = useRadiacode();
  const showSnackbar = useSnackbar();
  const [logScale, setLogScale] = useState(false);
  const [spectrumLogScale, setSpectrumLogScale] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const rateLevel = measurement
    ? doseRateLevel(measurement.dosisleistung)
    : 'normal';
  const rateColor = LEVEL_COLOR[rateLevel];

  const rateFmt = measurement
    ? formatDoseRate(measurement.dosisleistung)
    : { value: '—', unit: '' };
  const doseFmt =
    measurement && measurement.dose !== undefined
      ? formatDose(measurement.dose)
      : { value: '—', unit: '' };

  const chartData = useMemo(() => {
    if (history.length === 0) return [] as { x: number; y: number }[];
    const now = history[history.length - 1].t;
    return history.map((s) => ({
      x: (s.t - now) / 1000,
      y: logScale ? Math.max(s.dosisleistung, 0.01) : s.dosisleistung,
    }));
  }, [history, logScale]);

  const cpsChart = useMemo(() => {
    if (cpsHistory.length === 0) return [] as { x: number; y: number }[];
    const now = cpsHistory[cpsHistory.length - 1].t;
    return cpsHistory.map((s) => ({ x: (s.t - now) / 1000, y: s.cps }));
  }, [cpsHistory]);

  const spectrumSeries = useMemo(() => {
    if (!spectrum || spectrum.counts.length === 0) return null;
    return spectrum.counts.map((c) =>
      spectrumLogScale ? Math.max(c, 0.5) : c,
    );
  }, [spectrum, spectrumLogScale]);

  const handleOpenSave = useCallback(() => {
    const defaultName = `Live-Messung ${formatStartTimestamp(Date.now())}`;
    setSaveName(defaultName);
    setSaveDescription('');
    setSaveOpen(true);
  }, []);

  const handleConfirmSave = useCallback(async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const id = await saveLiveSpectrum({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
      });
      if (id) {
        showSnackbar('Spektrum gespeichert', 'success');
        setSaveOpen(false);
      } else {
        showSnackbar('Kein Live-Spektrum verfügbar', 'warning');
      }
    } catch (e) {
      showSnackbar(
        `Speichern fehlgeschlagen: ${(e as Error).message}`,
        'error',
      );
    } finally {
      setSaving(false);
    }
  }, [saveName, saveDescription, saveLiveSpectrum, showSnackbar]);

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Typography variant="h5">Dosimetrie</Typography>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Chip
          label={statusLabel(status, device)}
          color={STATUS_CHIP_COLOR[status]}
        />
        <Button
          variant="contained"
          onClick={() => connect()}
          disabled={status === 'connecting' || status === 'scanning'}
        >
          Verbinden
        </Button>
        <Button
          variant="outlined"
          onClick={() => disconnect()}
          disabled={status !== 'connected'}
        >
          Trennen
        </Button>
        <Tooltip title="Einstellungen">
          <span>
            <IconButton
              aria-label="Einstellungen"
              onClick={() => setSettingsOpen(true)}
              disabled={status !== 'connected'}
            >
              <SettingsIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <MetricTile
          label="Dosisleistung"
          value={rateFmt.value}
          unit={rateFmt.unit}
          color={rateColor}
          footer={formatErr(measurement?.dosisleistungErrPct)}
        />
        <MetricTile
          label="Gesamtdosis (akkumuliert)"
          value={doseFmt.value}
          unit={doseFmt.unit}
          footer={
            measurement?.durationSec !== undefined
              ? `über ${formatDuration(measurement.durationSec)}`
              : undefined
          }
        />
        <MetricTile
          label="Zählrate"
          value={measurement ? String(Math.round(measurement.cps)) : '—'}
          unit={measurement ? 'cps' : undefined}
          footer={formatErr(measurement?.cpsErrPct)}
        />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <MetricTile
          label="Temperatur"
          value={
            measurement?.temperatureC !== undefined
              ? measurement.temperatureC.toFixed(1)
              : '—'
          }
          unit={measurement?.temperatureC !== undefined ? '°C' : undefined}
        />
        <MetricTile
          label="Akku"
          value={
            measurement?.chargePct !== undefined
              ? Math.round(measurement.chargePct).toString()
              : '—'
          }
          unit={measurement?.chargePct !== undefined ? '%' : undefined}
        />
        <MetricTile
          label="Messdauer"
          value={
            measurement?.durationSec !== undefined
              ? formatDuration(measurement.durationSec)
              : '—'
          }
        />
      </Stack>

      <Box sx={{ position: 'relative', minHeight: 280 }}>
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
        {chartData.length === 0 ? (
          <Typography sx={{ mt: 4 }} color="text.secondary">
            Keine Messdaten — Gerät verbinden
          </Typography>
        ) : (
          <LineChart
            height={280}
            series={[
              {
                data: chartData.map((d) => d.y),
                color: rateColor,
                showMark: false,
              },
            ]}
            xAxis={[
              {
                data: chartData.map((d) => d.x),
                label: 'Sekunden',
                scaleType: 'linear',
              },
            ]}
            yAxis={[
              {
                scaleType: logScale ? 'log' : 'linear',
                label: 'µSv/h',
              },
            ]}
          />
        )}
      </Box>

      {spectrumSeries && (
        <Box
          data-testid="spectrum-chart"
          sx={{ position: 'relative', minHeight: 320 }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              position: 'absolute',
              right: 8,
              top: 0,
              zIndex: 1,
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={spectrumLogScale}
                  onChange={(_, v) => setSpectrumLogScale(v)}
                  slotProps={{ input: { 'aria-label': 'Spektrum Log' } }}
                />
              }
              label="Log"
            />
            <Tooltip title="Live-Spektrum auf Null setzen (Baseline = aktueller Snapshot)">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RestartAltIcon />}
                  onClick={() => resetLiveSpectrum()}
                >
                  Reset
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Aktuelles Live-Spektrum als Messung speichern">
              <span>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={handleOpenSave}
                >
                  Speichern
                </Button>
              </span>
            </Tooltip>
          </Stack>
          <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
            Live-Spektrum
            {spectrum?.durationSec !== undefined && (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                Dauer: {formatDuration(spectrum.durationSec)}
              </Typography>
            )}
          </Typography>
          <LineChart
            height={300}
            xAxis={[
              {
                data: spectrum!.counts.map((_, i) => i),
                scaleType: 'linear',
                label: 'Kanal',
              },
            ]}
            yAxis={[
              {
                scaleType: spectrumLogScale ? 'log' : 'linear',
                label: 'Counts',
              },
            ]}
            series={[
              {
                data: spectrumSeries,
                showMark: false,
              },
            ]}
          />
        </Box>
      )}

      {cpsChart.length > 0 && (
        <Box data-testid="cps-trend" sx={{ minHeight: 180 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            CPS-Trend (letzte 5 min)
          </Typography>
          <LineChart
            height={160}
            series={[
              {
                data: cpsChart.map((d) => d.y),
                color: '#1976d2',
                showMark: false,
              },
            ]}
            xAxis={[
              {
                data: cpsChart.map((d) => d.x),
                label: 'Sekunden',
                scaleType: 'linear',
              },
            ]}
            yAxis={[{ scaleType: 'linear', label: 'cps' }]}
          />
        </Box>
      )}

      {deviceInfo && (
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Geräteinformation
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 0.5, sm: 3 }}
            sx={{ mt: 0.5, flexWrap: 'wrap' }}
          >
            {deviceInfo.model && (
              <Typography variant="body2">
                <strong>Modell:</strong> {deviceInfo.model}
              </Typography>
            )}
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <strong>Firmware:</strong> {deviceInfo.firmwareVersion}
              {deviceInfo.firmwareDate ? ` (${deviceInfo.firmwareDate})` : ''}
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <strong>Bootloader:</strong> {deviceInfo.bootVersion}
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <strong>Seriennummer:</strong> {deviceInfo.hardwareSerial}
            </Typography>
          </Stack>
        </Box>
      )}

      <RadiacodeSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        readSettings={readSettings}
        writeSettings={writeSettings}
        playSignal={playSignal}
        doseReset={doseReset}
      />

      <Dialog
        open={saveOpen}
        onClose={() => (saving ? undefined : setSaveOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Live-Spektrum speichern</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            disabled={saving}
          />
          <TextField
            margin="dense"
            label="Beschreibung"
            fullWidth
            multiline
            minRows={2}
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            disabled={saving}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirmSave}
            variant="contained"
            disabled={saving || !saveName.trim()}
          >
            Speichern
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
