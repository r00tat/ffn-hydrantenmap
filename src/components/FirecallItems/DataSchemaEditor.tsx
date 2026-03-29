'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useRef } from 'react';
import { DataSchemaField } from '../firebase/firestore';
import { slugify } from '../firebase/importUtils';

function availableKeys(schema: DataSchemaField[], currentIndex: number): string {
  return schema
    .filter((f, i) => i !== currentIndex && f.type !== 'computed' && f.key)
    .map((f) => f.key)
    .join(', ') || 'keine';
}

interface DataSchemaEditorProps {
  dataSchema: DataSchemaField[];
  onChange: (schema: DataSchemaField[]) => void;
}

let nextFieldId = 0;

export default function DataSchemaEditor({
  dataSchema,
  onChange,
}: DataSchemaEditorProps) {
  const fieldIds = useRef<string[]>([]);

  // Ensure we have a stable ID for each field index
  while (fieldIds.current.length < dataSchema.length) {
    fieldIds.current.push(`field-${nextFieldId++}`);
  }
  // Trim if fields were removed
  if (fieldIds.current.length > dataSchema.length) {
    fieldIds.current.length = dataSchema.length;
  }

  const updateField = useCallback(
    (index: number, updates: Partial<DataSchemaField>) => {
      const updated = [...dataSchema];
      updated[index] = { ...updated[index], ...updates };
      onChange(updated);
    },
    [dataSchema, onChange]
  );

  const handleLabelBlur = useCallback(
    (index: number) => {
      const field = dataSchema[index];
      if (!field || field.key || !field.label) return;
      const autoKey = slugify(field.label);
      const existingKeys = dataSchema
        .filter((_, i) => i !== index)
        .map((f) => f.key);
      if (autoKey && !existingKeys.includes(autoKey)) {
        const updated = [...dataSchema];
        updated[index] = { ...updated[index], key: autoKey };
        onChange(updated);
      }
    },
    [dataSchema, onChange]
  );

  const addField = useCallback(() => {
    fieldIds.current.push(`field-${nextFieldId++}`);
    onChange([
      ...dataSchema,
      { key: '', label: '', unit: '', type: 'number' as const },
    ]);
  }, [dataSchema, onChange]);

  const removeField = useCallback(
    (index: number) => {
      fieldIds.current.splice(index, 1);
      onChange(dataSchema.filter((_, i) => i !== index));
    },
    [dataSchema, onChange]
  );

  const moveField = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= dataSchema.length) return;
      const updated = [...dataSchema];
      [updated[index], updated[newIndex]] = [
        updated[newIndex],
        updated[index],
      ];
      const ids = fieldIds.current;
      [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
      onChange(updated);
    },
    [dataSchema, onChange]
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Datenfelder
      </Typography>
      {dataSchema.map((field, index) => (
        <Box
          key={fieldIds.current[index]}
          sx={{ mb: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              label="Label"
              size="small"
              value={field.label}
              onChange={(e) => updateField(index, { label: e.target.value })}
              onBlur={() => handleLabelBlur(index)}
              sx={{ flex: 2 }}
            />
            <TextField
              label="Key"
              size="small"
              value={field.key}
              onChange={(e) =>
                updateField(index, { key: e.target.value })
              }
              sx={{ flex: 2 }}
            />
            <TextField
              label="Einheit"
              size="small"
              value={field.unit}
              onChange={(e) => updateField(index, { unit: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label="Typ"
              size="small"
              select
              value={field.type}
              onChange={(e) =>
                updateField(index, {
                  type: e.target.value as DataSchemaField['type'],
                })
              }
              sx={{ flex: 1 }}
            >
              <MenuItem value="number">Zahl</MenuItem>
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="boolean">Ja/Nein</MenuItem>
              <MenuItem value="computed">Berechnet</MenuItem>
            </TextField>
            {field.type === 'computed' ? (
              <TextField
                label="Formel"
                size="small"
                value={field.formula ?? ''}
                onChange={(e) =>
                  updateField(index, { formula: e.target.value })
                }
                placeholder={availableKeys(dataSchema, index)}
                helperText={`Verfügbare Felder: ${availableKeys(dataSchema, index)}`}
                sx={{ flex: 2 }}
              />
            ) : field.type === 'boolean' ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!!field.defaultValue}
                    onChange={(e) =>
                      updateField(index, { defaultValue: e.target.checked })
                    }
                  />
                }
                label="Standard"
                sx={{ flex: 1 }}
              />
            ) : (
              <TextField
                label="Standard"
                size="small"
                type={field.type === 'number' ? 'number' : 'text'}
                value={field.defaultValue ?? ''}
                onChange={(e) =>
                  updateField(index, {
                    defaultValue:
                      field.type === 'number'
                        ? (e.target.value !== '' ? parseFloat(e.target.value) : undefined)
                        : (e.target.value !== '' ? e.target.value : undefined),
                  })
                }
                sx={{ flex: 1 }}
              />
            )}
            <IconButton
              size="small"
              onClick={() => moveField(index, -1)}
              disabled={index === 0}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => moveField(index, 1)}
              disabled={index === dataSchema.length - 1}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => removeField(index)}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ))}
      <Button startIcon={<AddIcon />} onClick={addField} size="small">
        Feld hinzufügen
      </Button>
    </Box>
  );
}
