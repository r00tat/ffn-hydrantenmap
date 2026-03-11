'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { DataSchemaField, HeatmapConfig } from '../firebase/firestore';

interface HeatmapSettingsProps {
  config: HeatmapConfig | undefined;
  dataSchema: DataSchemaField[];
  onChange: (config: HeatmapConfig | undefined) => void;
}

const defaultConfig: HeatmapConfig = {
  enabled: false,
  activeKey: '',
  colorMode: 'auto',
};

export default function HeatmapSettings({
  config,
  dataSchema,
  onChange,
}: HeatmapSettingsProps) {
  const current = config || defaultConfig;
  const numericFields = dataSchema.filter((f) => f.type === 'number');

  const update = useCallback(
    (updates: Partial<HeatmapConfig>) => {
      onChange({ ...current, ...updates });
    },
    [current, onChange]
  );

  const addColorStop = useCallback(() => {
    const stops = current.colorStops || [];
    onChange({
      ...current,
      colorStops: [...stops, { value: 0, color: '#ff0000' }],
    });
  }, [current, onChange]);

  const updateColorStop = useCallback(
    (index: number, updates: Partial<{ value: number; color: string }>) => {
      const stops = [...(current.colorStops || [])];
      stops[index] = { ...stops[index], ...updates };
      onChange({ ...current, colorStops: stops });
    },
    [current, onChange]
  );

  const removeColorStop = useCallback(
    (index: number) => {
      const stops = (current.colorStops || []).filter((_, i) => i !== index);
      onChange({ ...current, colorStops: stops });
    },
    [current, onChange]
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Heatmap
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={current.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        }
        label="Heatmap-Färbung aktivieren"
      />
      {current.enabled && (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Aktives Feld"
            size="small"
            select
            value={current.activeKey}
            onChange={(e) => update({ activeKey: e.target.value })}
            fullWidth
          >
            {numericFields.map((f) => (
              <MenuItem key={f.key} value={f.key}>
                {f.label} ({f.unit})
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            value={current.colorMode}
            exclusive
            onChange={(_, val) => val && update({ colorMode: val })}
            size="small"
          >
            <ToggleButton value="auto">Auto</ToggleButton>
            <ToggleButton value="manual">Manuell</ToggleButton>
          </ToggleButtonGroup>
          {current.colorMode === 'auto' && (
            <FormControlLabel
              control={
                <Switch
                  checked={!!current.invertAutoColor}
                  onChange={(e) => update({ invertAutoColor: e.target.checked })}
                />
              }
              label={current.invertAutoColor ? 'Mehr ist grün' : 'Weniger ist grün'}
            />
          )}
          {current.colorMode === 'manual' && (
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  label="Min"
                  type="number"
                  size="small"
                  value={current.min ?? ''}
                  onChange={(e) =>
                    update({ min: e.target.value !== '' ? parseFloat(e.target.value) : undefined })
                  }
                />
                <TextField
                  label="Max"
                  type="number"
                  size="small"
                  value={current.max ?? ''}
                  onChange={(e) =>
                    update({ max: e.target.value !== '' ? parseFloat(e.target.value) : undefined })
                  }
                />
              </Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Farbstops
              </Typography>
              {(current.colorStops || []).map((stop, index) => (
                <Box
                  key={index}
                  sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}
                >
                  <TextField
                    label="Wert"
                    type="number"
                    size="small"
                    value={stop.value}
                    onChange={(e) =>
                      updateColorStop(index, {
                        value: parseFloat(e.target.value) || 0,
                      })
                    }
                    sx={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) =>
                      updateColorStop(index, { color: e.target.value })
                    }
                    style={{ width: 40, height: 32, border: 'none', cursor: 'pointer' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeColorStop(index)}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={addColorStop}
                size="small"
              >
                Farbstop hinzufügen
              </Button>
            </Box>
          )}
          <Box>
            <Typography variant="body2" gutterBottom>
              Radius: {current.radius ?? 25}px
            </Typography>
            <Slider
              value={current.radius ?? 25}
              onChange={(_, val) => update({ radius: val as number })}
              min={5}
              max={100}
              step={5}
              size="small"
              valueLabelDisplay="auto"
            />
          </Box>
          <Box>
            <Typography variant="body2" gutterBottom>
              Weichzeichner: {current.blur ?? 15}px
            </Typography>
            <Slider
              value={current.blur ?? 15}
              onChange={(_, val) => update({ blur: val as number })}
              min={1}
              max={50}
              step={1}
              size="small"
              valueLabelDisplay="auto"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
