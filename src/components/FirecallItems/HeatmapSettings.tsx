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
import { useCallback, useEffect } from 'react';
import { getAlgorithm, getAlgorithmList } from '../../common/interpolation';
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
  visualizationMode: 'interpolation',
};

export default function HeatmapSettings({
  config,
  dataSchema,
  onChange,
}: HeatmapSettingsProps) {
  const current = config || defaultConfig;
  const numericFields = dataSchema.filter((f) => f.type === 'number');

  // Auto-select first numeric field when heatmap is enabled and no field is selected
  useEffect(() => {
    if (
      current.enabled &&
      !current.activeKey &&
      numericFields.length > 0
    ) {
      onChange({ ...current, activeKey: numericFields[0].key });
    }
  }, [current, numericFields, onChange]);

  // Clear activeKey if the selected field no longer exists in the schema
  useEffect(() => {
    if (
      current.enabled &&
      current.activeKey &&
      numericFields.length > 0 &&
      !numericFields.some((f) => f.key === current.activeKey)
    ) {
      onChange({ ...current, activeKey: numericFields[0].key });
    }
  }, [current, numericFields, onChange]);

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
            required
            value={current.activeKey}
            onChange={(e) => update({ activeKey: e.target.value })}
            fullWidth
            error={!current.activeKey}
            helperText={
              numericFields.length === 0
                ? 'Zuerst ein numerisches Datenfeld hinzufügen'
                : !current.activeKey
                  ? 'Bitte ein Feld auswählen'
                  : undefined
            }
          >
            {numericFields.map((f) => (
              <MenuItem key={f.key} value={f.key}>
                {f.label} ({f.unit})
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="body2" gutterBottom>
            Darstellung
          </Typography>
          <ToggleButtonGroup
            value={current.visualizationMode || 'heatmap'}
            exclusive
            onChange={(_, val) => val && update({ visualizationMode: val })}
            size="small"
            sx={{ mb: 1 }}
          >
            <ToggleButton value="heatmap">Heatmap</ToggleButton>
            <ToggleButton value="interpolation">Interpolation</ToggleButton>
          </ToggleButtonGroup>
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
          {(current.visualizationMode || 'heatmap') === 'heatmap' ? (
            <>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Radius: {current.radius ?? 30}m
                </Typography>
                <Slider
                  value={current.radius ?? 30}
                  onChange={(_, val) => update({ radius: val as number })}
                  min={10}
                  max={1000}
                  step={10}
                  size="small"
                  valueLabelDisplay="auto"
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Weichzeichner: {Math.round(((current.blur ?? 15) / 25) * 100)}%
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
            </>
          ) : (
            <>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Algorithmus
                </Typography>
                <ToggleButtonGroup
                  value={current.interpolationAlgorithm ?? 'idw'}
                  exclusive
                  onChange={(_, val) => val && update({ interpolationAlgorithm: val, interpolationParams: {} })}
                  size="small"
                >
                  {getAlgorithmList().map((algo) => (
                    <ToggleButton key={algo.id} value={algo.id}>
                      {algo.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {(() => {
                  const algo = getAlgorithm(current.interpolationAlgorithm ?? 'idw');
                  if (!algo) return null;
                  return (
                    <>
                      {algo.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {algo.description}
                        </Typography>
                      )}
                      {algo.params.map((param) => {
                        const savedParams = current.interpolationParams ?? {};
                        // Migration: check legacy interpolationPower
                        const legacyValue = param.key === 'power' ? current.interpolationPower : undefined;
                        const value = savedParams[param.key] ?? legacyValue ?? param.default;

                        if (param.type === 'boolean') {
                          return (
                            <FormControlLabel
                              key={param.key}
                              control={
                                <Switch
                                  checked={!!value}
                                  onChange={(e) =>
                                    update({
                                      interpolationParams: { ...savedParams, [param.key]: e.target.checked },
                                    })
                                  }
                                />
                              }
                              label={param.label}
                            />
                          );
                        }

                        if (param.type === 'select' && param.options) {
                          return (
                            <TextField
                              key={param.key}
                              label={param.label}
                              size="small"
                              select
                              value={value as number}
                              onChange={(e) =>
                                update({
                                  interpolationParams: { ...savedParams, [param.key]: Number(e.target.value) },
                                })
                              }
                              fullWidth
                            >
                              {param.options.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          );
                        }

                        // number type → Slider
                        return (
                          <Box key={param.key}>
                            <Typography variant="body2" gutterBottom>
                              {param.label}: {value as number}
                            </Typography>
                            <Slider
                              value={value as number}
                              onChange={(_, val) =>
                                update({
                                  interpolationParams: { ...savedParams, [param.key]: val as number },
                                })
                              }
                              min={param.min ?? 0}
                              max={param.max ?? 10}
                              step={param.step ?? 1}
                              size="small"
                              valueLabelDisplay="auto"
                            />
                          </Box>
                        );
                      })}
                    </>
                  );
                })()}
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Radius: {current.interpolationRadius ?? 30}m
                </Typography>
                <Slider
                  value={current.interpolationRadius ?? 30}
                  onChange={(_, val) => update({ interpolationRadius: val as number })}
                  min={10}
                  max={500}
                  step={10}
                  size="small"
                  valueLabelDisplay="auto"
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  Deckkraft: {Math.round((current.interpolationOpacity ?? 0.6) * 100)}%
                </Typography>
                <Slider
                  value={current.interpolationOpacity ?? 0.6}
                  onChange={(_, val) => update({ interpolationOpacity: val as number })}
                  min={0.1}
                  max={1}
                  step={0.05}
                  size="small"
                  valueLabelDisplay="auto"
                />
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
