'use client';

import { Capacitor } from '@capacitor/core';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const THRESHOLD = 80;

export function PullToRefreshIndicator() {
  const isAndroid =
    typeof window !== 'undefined' && Capacitor.getPlatform() === 'android';

  const { pulling, distance } = usePullToRefresh({
    onRefresh: () => window.location.reload(),
    threshold: THRESHOLD,
    enabled: isAndroid,
  });

  if (!isAndroid || !pulling) return null;

  const progress = Math.min(100, (distance / THRESHOLD) * 100);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: Math.min(distance / 2, 60),
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        pointerEvents: 'none',
        transition: 'top 0.1s linear',
      }}
    >
      <CircularProgress variant="determinate" value={progress} size={36} />
    </Box>
  );
}
