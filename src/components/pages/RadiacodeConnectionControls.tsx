'use client';

import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
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

function statusLabel(
  status: RadiacodeStatus,
  device: { name?: string; serial?: string } | null,
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

export default function RadiacodeConnectionControls() {
  const {
    status,
    device,
    connect,
    disconnect,
    readSettings,
    writeSettings,
    playSignal,
    doseReset,
    refreshConnectionState,
  } = useRadiacode();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Chip
        label={statusLabel(status, device)}
        color={STATUS_CHIP_COLOR[status]}
      />
      {status === 'connected' ? (
        <Button variant="outlined" onClick={() => disconnect()}>
          Trennen
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
          Verbinden
        </Button>
      )}
      <Tooltip title="Verbindungsstatus prüfen">
        <span>
          <IconButton
            aria-label="Verbindungsstatus prüfen"
            onClick={() => {
              void refreshConnectionState();
            }}
            disabled={status === 'connecting' || status === 'reconnecting'}
          >
            <RefreshIcon />
          </IconButton>
        </span>
      </Tooltip>
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
