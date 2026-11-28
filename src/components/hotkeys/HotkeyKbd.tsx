'use client';

import Box from '@mui/material/Box';

/** Ein Tastenkürzel als Taste dargestellt. */
export default function HotkeyKbd({ label }: { label: string }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-block',
        minWidth: '1.8em',
        px: 0.75,
        py: 0.25,
        border: 1,
        borderColor: 'divider',
        borderBottomWidth: 2,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}
