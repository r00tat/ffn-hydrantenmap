'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';

interface HeatmapLegendProps {
  config: HeatmapConfig;
  dataSchema: DataSchemaField[];
  allValues: number[];
}

export default function HeatmapLegend({
  config,
  dataSchema,
  allValues,
}: HeatmapLegendProps) {
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
            position: 'absolute',
            bottom: 30,
            right: 10,
            zIndex: 1000,
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
    min = Math.min(...allValues);
    max = Math.max(...allValues);
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
      : '#00ff00 0%, #ffff00 50%, #ff0000 100%';

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 30,
        right: 10,
        zIndex: 1000,
        bgcolor: 'background.paper',
        p: 1,
        borderRadius: 1,
        boxShadow: 2,
        minWidth: 120,
      }}
    >
      <Typography variant="caption" display="block" gutterBottom>
        {field.label} ({field.unit})
      </Typography>
      <Box
        sx={{
          height: 12,
          borderRadius: 1,
          background: `linear-gradient(to right, ${gradient})`,
          mb: 0.5,
        }}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption">
          {min}
          {field.unit}
        </Typography>
        <Typography variant="caption">
          {max}
          {field.unit}
        </Typography>
      </Box>
    </Box>
  );
}
