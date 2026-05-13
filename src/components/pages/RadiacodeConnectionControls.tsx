'use client';

import Battery5BarIcon from '@mui/icons-material/Battery5Bar';
import BoltIcon from '@mui/icons-material/Bolt';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  doseRateLevel,
  formatDoseRate,
  LEVEL_COLOR,
} from '../../common/doseFormat';
import { RadiacodeStatus } from '../../hooks/radiacode/useRadiacodeDevice';
import { useRadiacode } from '../providers/RadiacodeProvider';
import RadiacodeSettingsDialog from './RadiacodeSettingsDialog';

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

function useStatusLabel() {
  const t = useTranslations('radiacode');
  return (
    status: RadiacodeStatus,
    device: { name?: string; serial?: string } | null,
  ): string => {
    if (status === 'connected' && device) {
      return t('connected', {
        name: device.name ?? '',
        serial: device.serial ?? '',
      });
    }
    if (status === 'connecting') return t('connecting');
    if (status === 'reconnecting') return t('reconnecting');
    if (status === 'scanning') return t('scanning');
    if (status === 'unavailable') return t('unavailable');
    if (status === 'error') return t('error');
    return t('disconnected');
  };
}

function batteryColor(pct: number): 'default' | 'warning' | 'error' {
  if (pct < 20) return 'error';
  if (pct < 50) return 'warning';
  return 'default';
}

export default function RadiacodeConnectionControls() {
  const t = useTranslations('radiacode');
  const statusLabel = useStatusLabel();
  const {
    status,
    device,
    measurement,
    connect,
    disconnect,
    readSettings,
    writeSettings,
    playSignal,
    doseReset,
    refreshConnectionState,
  } = useRadiacode();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rateFmt = measurement ? formatDoseRate(measurement.dosisleistung) : null;
  const rateBg = measurement
    ? LEVEL_COLOR[doseRateLevel(measurement.dosisleistung)]
    : undefined;

  return (
    <>
      <Chip
        label={statusLabel(status, device)}
        color={STATUS_CHIP_COLOR[status]}
      />
      {status === 'connected' ? (
        <Button variant="outlined" onClick={() => disconnect()}>
          {t('disconnect')}
        </Button>
      ) : (
        <Button
          variant="contained"
          onClick={() => connect()}
          disabled={
            status === 'connecting' ||
            status === 'scanning' ||
            status === 'reconnecting'
          }
        >
          {t('connect')}
        </Button>
      )}
      <Tooltip title={t('refreshStatus')}>
        <IconButton
          aria-label={t('refreshStatus')}
          onClick={() => {
            void refreshConnectionState();
          }}
        >
          <RefreshIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('settings')}>
        <span>
          <IconButton
            aria-label={t('settings')}
            onClick={() => setSettingsOpen(true)}
            disabled={status !== 'connected'}
          >
            <SettingsIcon />
          </IconButton>
        </span>
      </Tooltip>
      {measurement && (
        <>
          {measurement.chargePct !== undefined && (
            <Tooltip title={t('battery')}>
              <Chip
                size="small"
                icon={<Battery5BarIcon />}
                label={`${Math.round(measurement.chargePct)} %`}
                color={batteryColor(measurement.chargePct)}
                data-testid="radiacode-chip-battery"
              />
            </Tooltip>
          )}
          {measurement.temperatureC !== undefined && (
            <Tooltip title={t('deviceTemperature')}>
              <Chip
                size="small"
                icon={<DeviceThermostatIcon />}
                label={`${measurement.temperatureC.toFixed(1)} °C`}
                data-testid="radiacode-chip-temperature"
              />
            </Tooltip>
          )}
          {rateFmt && (
            <Tooltip title={t('doseRate')}>
              <Chip
                size="small"
                icon={<BoltIcon />}
                label={`${rateFmt.value} ${rateFmt.unit}`}
                data-testid="radiacode-chip-doserate"
                sx={{
                  bgcolor: rateBg,
                  color: '#fff',
                  '& .MuiChip-icon': { color: '#fff' },
                }}
              />
            </Tooltip>
          )}
          <Tooltip title={t('countRate')}>
            <Chip
              size="small"
              icon={<SpeedIcon />}
              label={`${Math.round(measurement.cps)} cps`}
              data-testid="radiacode-chip-cps"
            />
          </Tooltip>
        </>
      )}
      <RadiacodeSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        readSettings={readSettings}
        writeSettings={writeSettings}
        playSignal={playSignal}
        doseReset={doseReset}
      />
    </>
  );
}
