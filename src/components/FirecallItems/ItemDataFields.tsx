'use client';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useRef, useState } from 'react';
import { DataSchemaField } from '../firebase/firestore';

interface ItemDataFieldsProps {
  dataSchema?: DataSchemaField[];
  fieldData: Record<string, string | number | boolean>;
  onChange: (fieldData: Record<string, string | number | boolean>) => void;
  isNew?: boolean;
}

export default function ItemDataFields({
  dataSchema,
  fieldData,
  onChange,
  isNew,
}: ItemDataFieldsProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const updateValue = useCallback(
    (key: string, value: string | number | boolean | undefined) => {
      if (value === undefined) {
        const { [key]: _, ...rest } = fieldData;
        onChange(rest);
      } else {
        onChange({ ...fieldData, [key]: value });
      }
    },
    [fieldData, onChange]
  );

  const removeKey = useCallback(
    (key: string) => {
      const { [key]: _, ...rest } = fieldData;
      onChange(rest);
    },
    [fieldData, onChange]
  );

  const renameKey = useCallback(
    (oldKey: string, newKey: string) => {
      if (!newKey.trim() || (newKey.trim() !== oldKey && newKey.trim() in fieldData)) return;
      const { [oldKey]: value, ...rest } = fieldData;
      onChange({ ...rest, [newKey.trim()]: value });
    },
    [fieldData, onChange]
  );

  const addFreeFormKey = useCallback(() => {
    if (newKey.trim() && !(newKey.trim() in fieldData)) {
      onChange({ ...fieldData, [newKey.trim()]: newValue });
      setNewKey('');
      setNewValue('');
    }
  }, [newKey, newValue, fieldData, onChange]);

  const addRowRef = useRef<HTMLDivElement>(null);
  const handleAddRowBlur = useCallback(
    (e: React.FocusEvent) => {
      // Only flush if focus is leaving the add row entirely
      if (addRowRef.current?.contains(e.relatedTarget as Node)) return;
      if (newKey.trim() && !(newKey.trim() in fieldData)) {
        onChange({ ...fieldData, [newKey.trim()]: newValue });
        setNewKey('');
        setNewValue('');
      }
    },
    [newKey, newValue, fieldData, onChange]
  );

  const schemaFields = dataSchema || [];
  const schemaKeys = new Set(schemaFields.map((f) => f.key));
  const freeFormKeys = Object.keys(fieldData).filter((k) => !schemaKeys.has(k));
  const hasContent = schemaFields.length > 0 || freeFormKeys.length > 0 || Object.keys(fieldData).length > 0;

  if (!hasContent && !dataSchema) {
    // Show just the add button to allow starting free-form entry
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Daten
      </Typography>
      {schemaFields.map((field) => {
        const currentValue =
          fieldData[field.key] ??
          (isNew ? field.defaultValue : undefined) ??
          (field.type === 'boolean' ? false : field.type === 'number' ? '' : '');

        if (field.type === 'boolean') {
          return (
            <FormControlLabel
              key={field.key}
              control={
                <Checkbox
                  checked={!!currentValue}
                  onChange={(e) => updateValue(field.key, e.target.checked)}
                />
              }
              label={field.label}
            />
          );
        }

        const label = field.unit
          ? `${field.label} (${field.unit})`
          : field.label;

        return (
          <TextField
            key={field.key}
            label={label}
            type={field.type === 'number' ? 'number' : 'text'}
            size="small"
            fullWidth
            value={currentValue}
            onChange={(e) =>
              updateValue(
                field.key,
                field.type === 'number'
                  ? (e.target.value !== '' ? parseFloat(e.target.value) : undefined)
                  : e.target.value
              )
            }
            sx={{ mb: 1 }}
          />
        );
      })}
      {freeFormKeys.map((key) => (
        <Box key={key} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            label="Feld"
            size="small"
            value={key}
            onChange={(e) => renameKey(key, e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Wert"
            size="small"
            value={fieldData[key] ?? ''}
            onChange={(e) => updateValue(key, e.target.value)}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" onClick={() => removeKey(key)} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Box ref={addRowRef} onBlur={handleAddRowBlur} sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
        <TextField
          label="Neues Feld"
          size="small"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFreeFormKey();
            }
          }}
          sx={{ flex: 1 }}
        />
        <TextField
          label="Wert"
          size="small"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFreeFormKey();
            }
          }}
          sx={{ flex: 1 }}
        />
        <IconButton
          onClick={addFreeFormKey}
          size="small"
          color="primary"
          disabled={!newKey.trim() || newKey.trim() in fieldData}
        >
          <AddIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
