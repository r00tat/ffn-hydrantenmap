'use client';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { useFirecall } from '../../hooks/useFirecall';
import { useLiveLocationContext } from '../providers/LiveLocationProvider';
import LiveLocationDialog from './LiveLocationDialog';
import LiveLocationStopConfirm from './LiveLocationStopConfirm';

export default function LiveLocationFab() {
  const { isSharing, settings, setSettings, start, stop, canShare } =
    useLiveLocationContext();
  const firecall = useFirecall();
  const [startOpen, setStartOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  if (!canShare) return null;

  const handleClick = () => {
    if (isSharing) {
      setStopOpen(true);
    } else {
      setStartOpen(true);
    }
  };

  const handleStart = () => {
    setStartOpen(false);
    void start();
  };

  const handleStop = () => {
    void stop();
  };

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          bottom: 184,
          left: 16,
        }}
      >
        <Tooltip
          title={isSharing ? 'Live-Sharing läuft' : 'Live-Standort teilen'}
        >
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
