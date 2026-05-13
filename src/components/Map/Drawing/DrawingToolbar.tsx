'use client';

import RedoIcon from '@mui/icons-material/Redo';
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
import { useTranslations } from 'next-intl';
import React, { useCallback, useState } from 'react';
import { useDrawing } from './DrawingContext';

type ColorKey = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'white' | 'black' | 'magenta';
type WidthKey = 'thin' | 'medium' | 'thick';

const PRESET_COLORS: { key: ColorKey; value: string }[] = [
  { key: 'red', value: '#e53935' },
  { key: 'orange', value: '#fb8c00' },
  { key: 'yellow', value: '#fdd835' },
  { key: 'green', value: '#43a047' },
  { key: 'blue', value: '#1e88e5' },
  { key: 'white', value: '#ffffff' },
  { key: 'black', value: '#212121' },
  { key: 'magenta', value: '#e91e63' },
];

const PRESET_WIDTHS: { key: WidthKey; value: number }[] = [
  { key: 'thin', value: 2 },
  { key: 'medium', value: 5 },
  { key: 'thick', value: 10 },
];

export default function DrawingToolbar() {
  const t = useTranslations('drawing');
  const tCommon = useTranslations('common');
  const drawing = useDrawing();
  const [isSaving, setIsSaving] = useState(false);

  // Stop touch events from bubbling to the map container where
  // DrawingCanvas calls preventDefault(), which suppresses click events.
  const stopTouch = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  if (!drawing.isDrawing) return null;

  return (
    <Box
      data-drawing-toolbar
      onTouchStart={stopTouch}
      onTouchMove={stopTouch}
      onTouchEnd={stopTouch}
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
        touchAction: 'auto',
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Color swatches */}
        <Stack direction="row" spacing={0.5}>
          {PRESET_COLORS.map((c) => (
            <Tooltip key={c.value} title={t(`colors.${c.key}`)}>
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
              {t(`widths.${w.key}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Undo */}
        <Tooltip title={t('undoLast')}>
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

        {/* Redo */}
        <Tooltip title={t('redoLast')}>
          <span>
            <IconButton
              size="small"
              disabled={drawing.redoStack.length === 0}
              onClick={drawing.redoLastStroke}
            >
              <RedoIcon />
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
          {t('done')}
        </Button>

        {/* Cancel */}
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          onClick={drawing.cancel}
        >
          {tCommon('cancel')}
        </Button>
      </Stack>
    </Box>
  );
}
