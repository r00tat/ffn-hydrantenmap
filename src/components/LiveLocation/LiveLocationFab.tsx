'use client';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useEffect, useState } from 'react';
import { useFirecall } from '../../hooks/useFirecall';
import { useLiveLocationContext } from '../providers/LiveLocationProvider';
import { usePositionContext } from '../providers/PositionProvider';
import LiveLocationDialog from './LiveLocationDialog';
import LiveLocationStopConfirm from './LiveLocationStopConfirm';

export default function LiveLocationFab() {
  const { isSharing, settings, setSettings, start, stop } =
    useLiveLocationContext();
  const [, isPositionSet, , enableTracking, isPositionPending] =
    usePositionContext();
  const firecall = useFirecall();
  const [startOpen, setStartOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);

  // Once the position arrives after a click, open the start dialog. If the
  // request fails (permission denied / unavailable) clear the pending flag.
  // Deferring via setTimeout keeps these reactive setState calls out of the
  // effect body proper (avoids react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!pendingDialogOpen) return;
    if (isPositionSet) {
      const t = setTimeout(() => {
        setPendingDialogOpen(false);
        setStartOpen(true);
      }, 0);
      return () => clearTimeout(t);
    }
    if (!isPositionPending) {
      const t = setTimeout(() => {
        setPendingDialogOpen(false);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [pendingDialogOpen, isPositionSet, isPositionPending]);

  const handleClick = () => {
    if (isSharing) {
      setStopOpen(true);
      return;
    }
    if (!isPositionSet) {
      enableTracking();
      setPendingDialogOpen(true);
      return;
    }
    setStartOpen(true);
  };

  const handleStart = () => {
    setStartOpen(false);
    void start();
  };

  const handleStop = () => {
    void stop();
  };

  const tooltipTitle = isSharing
    ? 'Live-Sharing läuft'
    : isPositionPending || pendingDialogOpen
      ? 'Position wird ermittelt …'
      : 'Live-Standort teilen';

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 120,
          left: 16,
        }}
      >
        <Tooltip title={tooltipTitle}>
          <Fab
            color={isSharing ? 'primary' : 'default'}
            aria-label={
              isSharing ? 'Live-Sharing beenden' : 'Live-Standort teilen'
            }
            size="small"
            onClick={handleClick}
            sx={{
              animation: isSharing
                ? 'liveLocPulse 2s ease-in-out infinite'
                : 'none',
              '@keyframes liveLocPulse': {
                '0%, 100%': {
                  boxShadow: '0 0 0 0 rgba(25, 118, 210, .55)',
                },
                '50%': {
                  boxShadow: '0 0 0 8px rgba(25, 118, 210, 0)',
                },
              },
            }}
          >
            {isSharing ? <LocationOnIcon /> : <LocationOnOutlinedIcon />}
          </Fab>
        </Tooltip>
      </Box>
      <LiveLocationDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        firecallName={firecall.name}
        settings={settings}
        setSettings={setSettings}
        onStart={handleStart}
      />
      <LiveLocationStopConfirm
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        onConfirm={handleStop}
      />
    </>
  );
}
