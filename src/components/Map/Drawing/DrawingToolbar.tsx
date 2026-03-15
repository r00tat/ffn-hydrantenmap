'use client';

import UndoIcon from '@mui/icons-material/Undo';
import {
  Box,
  Button,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import React, { useState } from 'react';
import { useDrawing } from './DrawingContext';

const PRESET_COLORS = [
  { label: 'Rot', value: '#e53935' },
  { label: 'Orange', value: '#fb8c00' },
  { label: 'Gelb', value: '#fdd835' },
  { label: 'Grün', value: '#43a047' },
  { label: 'Blau', value: '#1e88e5' },
  { label: 'Weiß', value: '#ffffff' },
  { label: 'Schwarz', value: '#212121' },
  { label: 'Magenta', value: '#e91e63' },
];

const PRESET_WIDTHS = [
  { label: 'Dünn', value: 2 },
  { label: 'Mittel', value: 5 },
  { label: 'Dick', value: 10 },
];

export default function DrawingToolbar() {
  const drawing = useDrawing();
  const [isSaving, setIsSaving] = useState(false);

  if (!drawing.isDrawing) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 'env(safe-area-inset-bottom, 32px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 4,
        px: 2,
        py: 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        {/* Color swatches */}
        <Stack direction="row" spacing={0.5}>
          {PRESET_COLORS.map((c) => (
            <Tooltip key={c.value} title={c.label}>
              <Box
                onClick={() => drawing.setColor(c.value)}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: c.value,
                  border:
                    drawing.activeColor === c.value
                      ? '3px solid #1976d2'
                      : '2px solid #bdbdbd',
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          ))}
        </Stack>

        {/* Width presets */}
        <ToggleButtonGroup
          value={drawing.activeWidth}
          exclusive
          size="small"
          onChange={(_, v) => v !== null && drawing.setWidth(v)}
        >
          {PRESET_WIDTHS.map((w) => (
            <ToggleButton key={w.value} value={w.value}>
              {w.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Undo */}
        <Tooltip title="Letzten Strich rückgängig">
          <span>
            <IconButton
              size="small"
              disabled={drawing.strokes.length === 0}
              onClick={drawing.undoLastStroke}
            >
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Done */}
        <Button
          variant="contained"
          color="primary"
          size="small"
          disabled={drawing.strokes.length === 0 || isSaving}
          onClick={async () => {
            setIsSaving(true);
            await drawing.save();
            setIsSaving(false);
          }}
        >
          Fertig
        </Button>

        {/* Cancel */}
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          onClick={drawing.cancel}
        >
          Abbrechen
        </Button>
      </Stack>
    </Box>
  );
}
