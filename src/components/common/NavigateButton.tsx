'use client';

import DirectionsIcon from '@mui/icons-material/Directions';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

interface NavigateButtonProps {
  lat?: number;
  lng?: number;
  size?: 'small' | 'medium' | 'large';
}

export default function NavigateButton({ lat, lng, size = 'small' }: NavigateButtonProps) {
  if (!lat || !lng) return null;

  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <Tooltip title="Navigation starten">
      <IconButton
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, '_blank');
        }}
        color="primary"
      >
        <DirectionsIcon fontSize={size} />
      </IconButton>
    </Tooltip>
  );
}
