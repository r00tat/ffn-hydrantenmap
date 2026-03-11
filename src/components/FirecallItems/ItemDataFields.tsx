'use client';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback } from 'react';
import { DataSchemaField } from '../firebase/firestore';

interface ItemDataFieldsProps {
  dataSchema: DataSchemaField[];
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

  if (dataSchema.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Daten
      </Typography>
      {dataSchema.map((field) => {
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
    </Box>
  );
}
