'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { LineChart } from '@mui/x-charts/LineChart';
import { useMemo, useState } from 'react';
import {
  doseRateLevel,
  formatDose,
  formatDoseRate,
} from '../../common/doseFormat';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';
import { useRadiacode } from '../providers/RadiacodeProvider';

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
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
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
    </Box>
  );
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

export default function Dosimetrie() {
  const { status, device, measurement, history, error, connect, disconnect } =
    useRadiacode();
  const [logScale, setLogScale] = useState(true);

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
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <MetricTile
          label="Dosisleistung"
          value={rateFmt.value}
          unit={rateFmt.unit}
          color={rateColor}
        />
        <MetricTile
          label="Gesamtdosis"
          value={doseFmt.value}
          unit={doseFmt.unit}
        />
        <MetricTile
          label="Zählrate"
          value={measurement ? String(Math.round(measurement.cps)) : '—'}
          unit={measurement ? 'cps' : undefined}
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
    </Stack>
  );
}
