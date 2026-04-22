'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
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
  formatDuration,
} from '../../common/doseFormat';
import { useRadiacode } from '../providers/RadiacodeProvider';
import RadiacodeConnectionControls from './RadiacodeConnectionControls';

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

export default function Dosimetrie() {
  const { deviceInfo, measurement, history, error } = useRadiacode();
  const [logScale, setLogScale] = useState(false);

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
    if (history.length === 0) return [] as { x: number; y: number }[];
    const now = history[history.length - 1].t;
    return history.map((s) => ({ x: (s.t - now) / 1000, y: s.cps }));
  }, [history]);

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Typography variant="h5">Dosimetrie</Typography>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <RadiacodeConnectionControls />
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
    </Stack>
  );
}
