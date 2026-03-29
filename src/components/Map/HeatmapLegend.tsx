'use client';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';

interface HeatmapLegendProps {
  config: HeatmapConfig;
  dataSchema: DataSchemaField[];
  allValues: number[];
  layerName?: string;
}

export default function HeatmapLegend({
  config,
  dataSchema,
  allValues,
  layerName,
}: HeatmapLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  const field = dataSchema.find((f) => f.key === config.activeKey);
  if (!field) return null;

  let min: number;
  let max: number;

  if (
    config.colorMode === 'manual' &&
    config.min !== undefined &&
    config.max !== undefined
  ) {
    min = config.min;
    max = config.max;
  } else {
    if (allValues.length === 0) {
      return (
        <Box
          sx={{
            bgcolor: 'background.paper',
            p: 1,
            borderRadius: 1,
            boxShadow: 2,
          }}
        >
          <Typography variant="caption">{field.label}: Keine Daten</Typography>
        </Box>
      );
    }
    min = allValues.reduce((a, b) => Math.min(a, b), Infinity);
    max = allValues.reduce((a, b) => Math.max(a, b), -Infinity);
  }

  const gradient =
    config.colorMode === 'manual' && config.colorStops?.length
      ? config.colorStops
          .sort((a, b) => a.value - b.value)
          .map(
            (s) =>
              `${s.color} ${((s.value - min) / (max - min || 1)) * 100}%`
          )
          .join(', ')
      : config.invertAutoColor
        ? '#ff0000 0%, #ffff00 50%, #00ff00 100%'
        : '#00ff00 0%, #ffff00 50%, #ff0000 100%';

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        p: 0.5,
        px: 1,
        borderRadius: 1,
        boxShadow: 2,
        minWidth: collapsed ? 'auto' : 120,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <Typography variant="caption" sx={{ fontWeight: 'bold', mr: 0.5 }}>
          {layerName || field.label}
        </Typography>
        <IconButton size="small" sx={{ p: 0 }}>
          {collapsed ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ExpandLessIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>
      {!collapsed && (
        <>
          {layerName && (
            <Typography variant="caption" display="block" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              {config.visualizationMode === 'interpolation' ? 'Interpolation' : 'Heatmap'}
              {' · '}{field.label}{field.unit ? ` (${field.unit})` : ''}
            </Typography>
          )}
          <Box
            sx={{
              height: 12,
              borderRadius: 1,
              background: `linear-gradient(to right, ${gradient})`,
              my: 0.5,
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption">
              {Number.isInteger(min) ? min : min.toFixed(2)}
              {field.unit}
            </Typography>
            <Typography variant="caption">
              {Number.isInteger(max) ? max : max.toFixed(2)}
              {field.unit}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
